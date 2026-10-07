-- Curata datele operationale ale tranzactiilor si uploadurilor.
-- Pastreaza utilizatorii, schemele de card si datele de referinta (ex. merchants, reguli).
-- Executati doar dupa backup, pe baza de date dorita.

BEGIN;

-- Tabelele dependente de tranzactii/uploaduri se sterg inaintea parintilor.
DELETE FROM anomaly_detection_inputs;
DELETE FROM anomaly_detection_jobs;
DELETE FROM transaction_outliers;
DELETE FROM transaction_import_staging;
DELETE FROM fee_calculations;
DELETE FROM ml_predictions;
DELETE FROM qualification_results;
DELETE FROM transactions;

-- Uploadurile si sesiunile lor.
DELETE FROM uploads;
DELETE FROM upload_parts;
DELETE FROM upload_sessions;

-- Joburile de import/evaluare contin doar metadate operationale.
DELETE FROM processing_jobs;

COMMIT;
