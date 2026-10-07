package org.schemeguard.backend.service.csvuploads;

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
            INSERT INTO transactions (
                upload_id, external_id, merchant_id, scheme_id, amount, currency_code,
                card_type, card_category, channel, issuer_country, merchant_country,
                authorized_at, cleared_at, three_ds_used, cvv_present, status,
                raw_data, active
            )
            SELECT
                staging.upload_id,
                staging.external_id,
                staging.merchant_id,
                scheme.id,
                staging.amount,
                staging.currency_code,
                staging.card_type,
                staging.card_category,
                staging.channel,
                staging.issuer_country,
                staging.merchant_country,
                staging.authorized_at,
                staging.cleared_at,
                staging.three_ds_used,
                staging.cvv_present,
                'NEW',
                staging.raw_data,
                scheme.active
            FROM transaction_import_staging staging
            JOIN card_schemes scheme ON scheme.code = staging.network
            WHERE staging.upload_id = ?
            """;

    private final JdbcTemplate jdbcTemplate;

    public TransactionBatchWriter(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Transactional
    public void clearStagedRows(UUID uploadId) {
        jdbcTemplate.update(DELETE_STAGED_ROWS_SQL, uploadId);
    }

    @Transactional
    public void stage(UUID uploadId, List<TransactionRow> rows) {
        if (rows.isEmpty()) {
            return;
        }

        // Staging commits independently from the final merge. This keeps the
        // database transaction short while ensuring no final transaction is
        // visible until the complete CSV has been parsed successfully.
        copyRowsToStaging(uploadId, rows);
    }

    @Transactional
    public void mergeStagedRows(UUID uploadId) {
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
