-- Run after transaction_outliers.sql; no existing table is modified.
CREATE TABLE IF NOT EXISTS transaction_outlier_explanations (
    outlier_id UUID PRIMARY KEY REFERENCES transaction_outliers(id) ON DELETE CASCADE,
    reasons JSONB NOT NULL
);
