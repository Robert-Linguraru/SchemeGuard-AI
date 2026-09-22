package org.schemeguard.backend.service.csvUpload;

import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVPrinter;
import org.postgresql.PGConnection;
import org.postgresql.copy.CopyManager;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

@Component
public class TransactionBatchWriter {

    private static final String DELETE_STAGED_ROWS_SQL = """
            DELETE FROM transaction_import_staging
            WHERE upload_id = ?
            """;

    private static final String COPY_STAGED_ROWS_SQL = """
            COPY transaction_import_staging (
                upload_id, row_number, external_id, network, amount, currency_code,
                merchant_id, merchant_name, merchant_mcc, merchant_country,
                issuer_country, card_type, card_category, channel,
                authorized_at, cleared_at, three_ds_used, cvv_present, raw_data
            ) FROM STDIN WITH (FORMAT csv, NULL '')
            """;

    private static final String UPSERT_MERCHANTS_SQL = """
            INSERT INTO merchants (
                id, name, mcc, country_code, default_currency, status
            )
            SELECT DISTINCT ON (merchant_id)
                merchant_id, merchant_name, merchant_mcc, merchant_country,
                currency_code, 'ACTIVE'
            FROM transaction_import_staging
            WHERE upload_id = ?
            ORDER BY merchant_id, row_number DESC
            ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                mcc = EXCLUDED.mcc,
                country_code = EXCLUDED.country_code,
                default_currency = EXCLUDED.default_currency,
                status = EXCLUDED.status
            """;

    private static final String UPSERT_SCHEMES_SQL = """
            INSERT INTO card_schemes (code, name, active)
            SELECT network, network, TRUE
            FROM transaction_import_staging
            WHERE upload_id = ?
            GROUP BY network
            ON CONFLICT (code) DO UPDATE SET
                name = EXCLUDED.name
            """;

    private static final String MERGE_TRANSACTIONS_SQL = """
            WITH latest AS (
                SELECT DISTINCT ON (external_id)
                    upload_id, external_id, merchant_id, network, amount,
                    currency_code, card_type, card_category, channel,
                    issuer_country, merchant_country, authorized_at, cleared_at,
                    three_ds_used, cvv_present, raw_data
                FROM transaction_import_staging
                WHERE upload_id = ?
                ORDER BY external_id, row_number DESC
            )
            INSERT INTO transactions AS existing (
                upload_id, external_id, merchant_id, scheme_id, amount, currency_code,
                card_type, card_category, channel, issuer_country, merchant_country,
                authorized_at, cleared_at, three_ds_used, cvv_present, status,
                raw_data, active
            )
            SELECT
                latest.upload_id,
                latest.external_id,
                latest.merchant_id,
                scheme.id,
                latest.amount,
                latest.currency_code,
                latest.card_type,
                latest.card_category,
                latest.channel,
                latest.issuer_country,
                latest.merchant_country,
                latest.authorized_at,
                latest.cleared_at,
                latest.three_ds_used,
                latest.cvv_present,
                'NEW',
                latest.raw_data,
                scheme.active
            FROM latest
            JOIN card_schemes scheme ON scheme.code = latest.network
            ON CONFLICT (external_id) DO UPDATE SET
                upload_id = EXCLUDED.upload_id,
                merchant_id = EXCLUDED.merchant_id,
                scheme_id = EXCLUDED.scheme_id,
                amount = EXCLUDED.amount,
                currency_code = EXCLUDED.currency_code,
                card_type = EXCLUDED.card_type,
                card_category = EXCLUDED.card_category,
                channel = EXCLUDED.channel,
                issuer_country = EXCLUDED.issuer_country,
                merchant_country = EXCLUDED.merchant_country,
                authorized_at = EXCLUDED.authorized_at,
                cleared_at = EXCLUDED.cleared_at,
                three_ds_used = EXCLUDED.three_ds_used,
                cvv_present = EXCLUDED.cvv_present,
                status = EXCLUDED.status,
                raw_data = EXCLUDED.raw_data,
                active = EXCLUDED.active
            WHERE existing.upload_id IS DISTINCT FROM EXCLUDED.upload_id
               OR existing.merchant_id IS DISTINCT FROM EXCLUDED.merchant_id
               OR existing.scheme_id IS DISTINCT FROM EXCLUDED.scheme_id
               OR existing.amount IS DISTINCT FROM EXCLUDED.amount
               OR existing.currency_code IS DISTINCT FROM EXCLUDED.currency_code
               OR existing.card_type IS DISTINCT FROM EXCLUDED.card_type
               OR existing.card_category IS DISTINCT FROM EXCLUDED.card_category
               OR existing.channel IS DISTINCT FROM EXCLUDED.channel
               OR existing.issuer_country IS DISTINCT FROM EXCLUDED.issuer_country
               OR existing.merchant_country IS DISTINCT FROM EXCLUDED.merchant_country
               OR existing.authorized_at IS DISTINCT FROM EXCLUDED.authorized_at
               OR existing.cleared_at IS DISTINCT FROM EXCLUDED.cleared_at
               OR existing.three_ds_used IS DISTINCT FROM EXCLUDED.three_ds_used
               OR existing.cvv_present IS DISTINCT FROM EXCLUDED.cvv_present
               OR existing.status IS DISTINCT FROM EXCLUDED.status
               OR existing.raw_data IS DISTINCT FROM EXCLUDED.raw_data
               OR existing.active IS DISTINCT FROM EXCLUDED.active
            """;

    private final JdbcTemplate jdbcTemplate;

    public TransactionBatchWriter(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Transactional
    public void write(UUID uploadId, List<TransactionRow> rows) {
        if (rows.isEmpty()) {
            return;
        }

        // A failed transaction rolls this staging data back. The delete also
        // makes retries safe if a previous process stopped after a commit point.
        jdbcTemplate.update(DELETE_STAGED_ROWS_SQL, uploadId);
        copyRowsToStaging(uploadId, rows);
        jdbcTemplate.update(UPSERT_MERCHANTS_SQL, uploadId);
        jdbcTemplate.update(UPSERT_SCHEMES_SQL, uploadId);
        jdbcTemplate.update(MERGE_TRANSACTIONS_SQL, uploadId);
        jdbcTemplate.update(DELETE_STAGED_ROWS_SQL, uploadId);
    }

    private void copyRowsToStaging(UUID uploadId, List<TransactionRow> rows) {
        byte[] csv = serializeRows(uploadId, rows);
        jdbcTemplate.execute((ConnectionCallback<Long>) connection -> {
            PGConnection postgresConnection = connection.unwrap(PGConnection.class);
            CopyManager copyManager = postgresConnection.getCopyAPI();
            try {
                return copyManager.copyIn(
                        COPY_STAGED_ROWS_SQL,
                        new ByteArrayInputStream(csv)
                );
            } catch (IOException exception) {
                throw new IllegalStateException(
                        "Could not copy transaction batch into PostgreSQL staging.",
                        exception
                );
            }
        });
    }

    private byte[] serializeRows(UUID uploadId, List<TransactionRow> rows) {
        try (ByteArrayOutputStream output = new ByteArrayOutputStream();
             OutputStreamWriter writer = new OutputStreamWriter(
                     output,
                     StandardCharsets.UTF_8
             );
             CSVPrinter printer = new CSVPrinter(
                     writer,
                     CSVFormat.DEFAULT.builder()
                             .setRecordSeparator('\n')
                             .get()
             )) {
            for (TransactionRow row : rows) {
                printer.printRecord(
                        uploadId,
                        row.rowNumber(),
                        row.transactionId(),
                        row.network(),
                        row.amount().toPlainString(),
                        row.currency(),
                        merchantUuid(row.merchantId()),
                        row.merchantName(),
                        row.mcc(),
                        row.merchantCountry(),
                        row.cardCountry(),
                        row.targetCardType(row.rowNumber()),
                        row.targetCardCategory(),
                        row.targetChannel(row.rowNumber()),
                        row.authorizationTimestamp(),
                        row.clearingTimestamp(),
                        row.threeDsUsed(),
                        row.cvvPresent(),
                        row.rawDataJson()
                );
            }
            printer.flush();
            return output.toByteArray();
        } catch (IOException exception) {
            throw new IllegalStateException(
                    "Could not prepare transaction batch for PostgreSQL COPY.",
                    exception
            );
        }
    }

    private static UUID merchantUuid(String merchantId) {
        return UUID.nameUUIDFromBytes(
                ("schemeguard:merchant:" + merchantId)
                        .getBytes(StandardCharsets.UTF_8)
        );
    }
}
