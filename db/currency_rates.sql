CREATE TABLE IF NOT EXISTS currency_rates (
    source_currency CHAR(3) NOT NULL,
    target_currency CHAR(3) NOT NULL,
    rate DECIMAL(20, 10) NOT NULL,
    rate_date DATE NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    PRIMARY KEY (source_currency, target_currency)
);
