package org.schemeguard.backend.service.csvuploads;

import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.streaming.SXSSFWorkbook;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.io.IOException;
import java.io.OutputStream;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.UUID;

@Service
public class DuplicateTransactionReportService {

    private static final List<String> HEADERS = List.of(
            "CSV row",
            "External transaction ID",
            "Duplicate reason",
            "Previously imported transaction ID",
            "Previous upload ID",
            "Source",
            "Network",
            "Amount",
            "Currency",
            "Merchant",
            "Merchant country",
            "Card country",
            "Card type",
            "Card category",
            "Channel",
            "Authorized at",
            "Cleared at"
    );

    private static final String DUPLICATE_ROWS_SQL = """
            SELECT
                staging.row_number,
                staging.external_id,
                staging.duplicate_reason,
                staging.duplicate_transaction_id,
                staging.duplicate_upload_id,
                source.name AS source_name,
                staging.network,
                staging.amount,
                staging.currency_code,
                staging.merchant_name,
                staging.merchant_country,
                staging.issuer_country,
                staging.card_type,
                staging.card_category,
                staging.channel,
                staging.authorized_at,
                staging.cleared_at
            FROM transaction_import_review staging
            JOIN uploads upload ON upload.id = staging.upload_id
            JOIN transaction_sources source ON source.id = upload.source_id
            WHERE staging.upload_id = ?
              AND staging.is_duplicate = TRUE
            ORDER BY staging.row_number
            """;

    private final JdbcTemplate jdbcTemplate;
    private final TransactionDeduplicationService deduplicationService;
    private final TransactionTemplate transactionTemplate;

    public DuplicateTransactionReportService(
            JdbcTemplate jdbcTemplate,
            TransactionDeduplicationService deduplicationService,
            PlatformTransactionManager transactionManager
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.deduplicationService = deduplicationService;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
    }

    public void writeReport(UUID uploadRecordId, OutputStream outputStream) throws IOException {
        SXSSFWorkbook workbook = new SXSSFWorkbook(100);
        try {
            Sheet sheet = workbook.createSheet("Duplicate transactions");
            writeHeader(sheet.createRow(0));
            int[] nextRow = {1};
            RowCallbackHandler rowWriter = resultSet ->
                    writeTransactionRow(sheet, nextRow, resultSet);
            transactionTemplate.executeWithoutResult(status -> {
                // Use the same lock order as confirmation: upload session, then source.
                String currentStatus = jdbcTemplate.queryForObject(
                        """
                                SELECT session.status
                                FROM upload_sessions session
                                JOIN uploads upload ON upload.session_id = session.id
                                WHERE upload.id = ?
                                FOR UPDATE OF session
                                """,
                        String.class,
                        uploadRecordId
                );
                if (!"DUPLICATES_FOUND".equals(currentStatus)) {
                    throw new IllegalStateException(
                            "This upload is no longer waiting for a duplicate decision."
                    );
                }
                // Refresh at download time as well: another upload may have been
                // approved while this file was waiting for the analyst's decision.
                deduplicationService.lockSource(uploadRecordId);
                TransactionDeduplicationService.DuplicateSummary summary =
                        deduplicationService.refreshReviewDuplicateMarks(uploadRecordId);
                jdbcTemplate.update(
                        """
                                UPDATE upload_sessions
                                SET duplicate_rows = ?, duplicate_signature = ?, updated_at = now()
                                WHERE id = (SELECT session_id FROM uploads WHERE id = ?)
                                  AND status = 'DUPLICATES_FOUND'
                                """,
                        summary.count(),
                        summary.signature(),
                        uploadRecordId
                );
                jdbcTemplate.query(DUPLICATE_ROWS_SQL, rowWriter, uploadRecordId);
            });
            workbook.write(outputStream);
        } finally {
            workbook.dispose();
            workbook.close();
        }
    }

    private void writeHeader(Row row) {
        for (int column = 0; column < HEADERS.size(); column++) {
            row.createCell(column).setCellValue(HEADERS.get(column));
        }
    }

    private void writeTransactionRow(Sheet sheet, int[] nextRow, ResultSet resultSet)
            throws SQLException {
        Row row = sheet.createRow(nextRow[0]++);
        int column = 0;
        setCell(row, column++, resultSet.getString("row_number"));
        setCell(row, column++, resultSet.getString("external_id"));
        setCell(row, column++, resultSet.getString("duplicate_reason"));
        setCell(row, column++, resultSet.getString("duplicate_transaction_id"));
        setCell(row, column++, resultSet.getString("duplicate_upload_id"));
        setCell(row, column++, resultSet.getString("source_name"));
        setCell(row, column++, resultSet.getString("network"));
        setCell(row, column++, resultSet.getString("amount"));
        setCell(row, column++, resultSet.getString("currency_code"));
        setCell(row, column++, resultSet.getString("merchant_name"));
        setCell(row, column++, resultSet.getString("merchant_country"));
        setCell(row, column++, resultSet.getString("issuer_country"));
        setCell(row, column++, resultSet.getString("card_type"));
        setCell(row, column++, resultSet.getString("card_category"));
        setCell(row, column++, resultSet.getString("channel"));
        setCell(row, column++, resultSet.getString("authorized_at"));
        setCell(row, column, resultSet.getString("cleared_at"));
    }

    private void setCell(Row row, int column, String value) {
        Cell cell = row.createCell(column);
        if (value != null) {
            cell.setCellValue(value);
        }
    }
}
