package org.schemeguard.backend;

import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.schemeguard.backend.service.csvuploads.TransactionRow;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.StringReader;

import static org.junit.jupiter.api.Assertions.assertEquals;

class TransactionRowTests {

    private static final String HEADER = String.join(",",
            "transaction_id", "network", "amount", "currency", "merchant_country",
            "merchant_id", "merchant_name", "mcc", "card_country", "card_type",
            "card_product", "is_commercial_card", "channel", "entry_mode",
            "authentication", "authorization_timestamp", "clearing_timestamp",
            "authorization_code", "settlement_status", "merchant_data_complete",
            "recurring", "refund"
    );

    @Test
    void cardTypeAndCommercialCategoryAreMappedIndependently() throws IOException {
        TransactionRow row = parse("consumer_credit", "TRUE");

        assertEquals("CREDIT", row.targetCardType(row.rowNumber()));
        assertEquals("BUSINESS", row.targetCardCategory());
    }

    private static TransactionRow parse(String cardType, String commercialCard)
            throws IOException {
        String values = String.join(",",
                "TX-TEST", "MASTERCARD", "164.61", "EUR", "FR",
                "14b984e8-bb90-3be7-abc7-e769a13f3ae6", "Paris Bakery", "5462", "PT",
                cardType, "traditional", commercialCard, "pos", "chip",
                "3ds_not_applicable", "2026-01-21T14:51:00Z", "2026-01-25T00:51:00Z",
                "A971845", "pending", "FALSE", "FALSE", "FALSE"
        );
        String csv = HEADER + "\n" + values;
        CSVFormat format = CSVFormat.DEFAULT.builder()
                .setHeader()
                .setSkipHeaderRecord(true)
                .get();
        try (CSVParser parser = format.parse(new StringReader(csv))) {
            return TransactionRow.from(parser.iterator().next(), 2);
        }
    }
}
