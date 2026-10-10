# SchemeGuardAI

SchemeGuardAI manages card-scheme rules, qualifies imported transactions, and calculates interchange fees.

!! You have to run the container that pulls the ollama model before running the entire project
```

docker compose up ollama-model
```

```bash
py -m generate_csv --rows [n_rows] --output [file_name.csv] --seed 42

# From the repository root, for a deterministic 1,000-row anomaly fixture:
py misc/generate_csv.py --rows 1000 --output transactions_1000.csv --seed 42 --anomaly-rate 0.02
```

The generator creates a realistic transaction distribution and injects a small
number of deliberate candidates. Those rows remain in the same clustering
cohort as their peers but have incomplete merchant data and a five-day clearing
delay, which should cause the rule engine to calculate a different/fallback
interchange rate. The anomaly detector can therefore be tested end to end.

## Main features

- **Accounts:** registration, login, and profile updates.
- **Rules:** create, list, inspect, and delete card-scheme rules with conditions, priorities, effective dates, and interchange rates.
- **CSV imports:** upload transaction files, track import progress, and cancel uploads.
- **Qualification API:** evaluate pending transactions against rules, log decisions, and calculate fees.
- **Dashboard:** view transactions and summary statistics.

## Technology and structure

| Directory | Purpose | Technology |
| --- | --- | --- |
| `frontend/` | Web interface | React 18, TypeScript, Vite 6 |
| `backend/` | REST API, authentication, rules, and CSV imports | Java 26, Spring Boot 4.1.1, Maven |
| `ML/` | ML service scaffold | Python 3.12, FastAPI |
| `db/` | Database schema and reference data | PostgreSQL 17 |

## Run locally

Install Docker with Docker Compose, then run this command from the project root:

```powershell
Copy-Item .env.example .env
```

Open `.env` and fill the blank password and JWT-secret values. The `.env` file is ignored
by Git and must never be committed. Then start the application:

Generate a suitable JWT secret in PowerShell with:

```powershell
[Convert]::ToHexString(
    [Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
).ToLower()
```

```sh
docker compose up --build --remove-orphans
```

| Service | Local address |
| --- | --- |
| Web application | http://localhost:5173 |
| Backend API | http://localhost:8080 |
| ML API documentation | http://localhost:8000/docs |
| ML health check | http://localhost:8000/health |
| Ollama API | http://localhost:11434 |

### OpenAPI contract generation

The backend generates its OpenAPI 3 contract from Spring controllers and DTOs using
springdoc. After starting the backend, inspect the specification at
`http://localhost:8080/v3/api-docs` or Swagger UI at `http://localhost:8080/swagger-ui.html`.
`TransactionUploadController` is excluded because of its chunked binary upload endpoint;
the separate anomaly controller remains documented.

To generate frontend TypeScript contract types from the running backend, run from
`frontend/`:

```sh
npm run api:types
```

This writes `src/shared/api/generated/openapi.ts`. Regenerate it after backend API/DTO
changes and commit the generated output with the change.

Open the web application and register an account to get started. The application uses the
Supabase PostgreSQL database configured in `.env`.

To stop the services while keeping database data:

```sh
docker compose down
```

### Supabase database setup

Docker Compose does not create or migrate the remote Supabase database. Before starting
the application for the first time, run these files once in the Supabase SQL Editor, in
the following order:

1. `country_regions.sql` creates the country mapping table.
2. `create_schema.sql` creates the main tables.
3. `rule_interpreter.sql` creates fallback rates and evaluation indexes.
4. `seed_reference_data.sql` inserts roles, card schemes, and 249 country mappings.
5. `db/csvuploads/upload_system.sql` creates the upload sessions, parts, upload records, staging and review tables, transaction sources and deduplication indexes, upload timing columns, and upload-scoped anomaly detection tables.

If the database already exists, run `db/csvuploads/upload_system.sql` after
`db/create_schema.sql` has been applied and before starting or restarting the backend.
Its DDL is idempotent. The script also preserves known transaction/source associations,
moves pending duplicate review rows from staging into the review table, and removes
empty upload records for sessions already marked `DUPLICATE` while retaining those
sessions. Existing uploads keep a `NULL` content hash, and historical uploads without
an explicitly associated source remain source-less; those rows are not used for
exact-file or source-scoped duplicate detection.

Detection returns a job from `POST /api/uploads/{uploadId}/anomalies/detect` (HTTP 202).
For stored outlier explanations, also run `db/transaction_outlier_explanations.sql`
before restarting the backend. This adds a separate table without altering existing ones.
Run Detect outliers again for historical results; the detector version invalidates the
previous cache once. Expanded transaction details retrieve the saved evidence from
`GET /api/uploads/{uploadId}/anomalies/{transactionId}/explanation` without rerunning detection.
Poll `/anomalies/status`, then retrieve transaction IDs from `/anomalies` when the job
is completed. The scheduler applies Java rules in the background; there are no model
or token calls for this computation. Unchanged completed jobs are reused, while changes
to evaluated inputs or the detector version queue a new run. Older jobs are recalculated
on the next Detect outliers request after this migration.

The detector flags two kinds of review candidates: incomplete merchant data combined
with clearing delays over two days, and unusual interchange rates within the same
qualification/rule and card context. The former are operational anomalies, not proof
of an incorrect fee. Valid qualified rates and fallback rates remain separate. The CSV
generator injects operational anomalies; an ordinary upload with consistent evaluated
rates can legitimately have no rate outliers. Missing evaluations fail explicitly rather
than silently producing an empty result.

CSV rows are copied to the unlogged staging table while the file is validated. They are
merged into the transaction tables only after the complete file succeeds, so a malformed
file or a cancellation cannot leave a partial transaction import.

External transaction IDs are not treated as unique. The same identifier may appear multiple
times in one upload or across different banking systems.

### Recommendation assistant security boundary

The recommendation endpoint checks that the authenticated user owns the upload and that
the selected transaction belongs to that upload before loading transaction context. The
assistant receives only that transaction's evaluated context and retrieved reference text.
It has no tools or database/action interface, so model output cannot delete transactions or
invoke backend operations. The backend remains the authorization boundary; prompt wording
is an additional instruction to treat user text, transaction fields, and retrieved snippets
as untrusted data, not a security control by itself. Recommendation messages are limited to
2,000 characters.

The backend uses `spring.jpa.hibernate.ddl-auto=validate`, so startup fails with a clear
schema-validation error if these tables have not yet been created in Supabase.

![DbDiagram](mermaid.png)

### Configuration

Backend defaults and upload limits are defined in [application.properties](backend/src/main/resources/application.properties).

| Environment variable | Purpose / default |
| --- | --- |
| `SPRING_DATASOURCE_URL` | Supabase JDBC URL; required |
| `SPRING_DATASOURCE_USERNAME` | Supabase database user; required |
| `SPRING_DATASOURCE_PASSWORD` | Supabase database password; required |
| `CORS_ALLOWED_ORIGIN` | Allowed frontend origin; `http://localhost:5173` |
| `APP_JWT_SECRET` | JWT signing secret of at least 32 characters; required |
| `UPLOAD_STORAGE_DIRECTORY` | Temporary upload storage; `/tmp/schemeguard-transaction-uploads` |
| `UPLOAD_PROGRESS_UPDATE_INTERVAL_MS` | Minimum interval for persisted import progress updates; `2000` |
| `OLLAMA_URL` | Ollama base URL; Compose supplies `http://ollama:11434` |
| `OLLAMA_MODEL` | Model pulled and used by the backend; `qwen3:4b` |
| `OLLAMA_PORT` | Ollama port exposed on the host; `11434` |
| `OLLAMA_IMAGE` | Ollama Docker image; `ollama/ollama:latest` |

Spring imports `.env` from either the repository root or the `backend` module's parent
directory. This supports starting the backend from IntelliJ or Maven. Docker Compose also
reads the repository-level `.env` automatically and passes the same Supabase connection
values into the backend container. Both launch methods therefore use the same database.

For Supabase, use a JDBC URL without embedding the password, for example:

```properties
SPRING_DATASOURCE_URL=jdbc:postgresql://your-pooler-host:5432/postgres?sslmode=require
SPRING_DATASOURCE_USERNAME=your-supabase-database-user
SPRING_DATASOURCE_PASSWORD=your-supabase-database-password
```

## API overview

### Authentication and profile

| Endpoint | Purpose |
| --- | --- |
| `POST /api/auth/register`, `POST /api/auth/login` | Register or sign in |
| `GET /api/auth/me`, `PUT /api/auth/profile` | Read or update the current account |

### Card schemes

| Endpoint | Purpose |
| --- | --- |
| `GET /api/card-schemes` | List active schemes; supports `includeInactive`, `search`, `page`, `size` and `sort` |
| `GET /api/card-schemes/{id}` | Read one active scheme; admins can use `includeInactive=true` |
| `POST /api/card-schemes` | Create a card scheme |
| `PATCH /api/card-schemes/{id}` | Update the scheme `code` and `name` |
| `PATCH /api/card-schemes/{id}/activate` | Activate the scheme; `{ "cascade": true }` also activates associated entities |
| `PATCH /api/card-schemes/{id}/deactivate` | Deactivate the scheme and associated rules, transactions and results |
| `DELETE /api/card-schemes/{id}` | Hard-delete the scheme and its dependent rules, transactions and results |

### Rules

| Endpoint | Purpose |
| --- | --- |
| `GET /api/rule/getRules`, `GET /api/rule/getRule?id=...` | List rules or read one rule |
| `POST /api/rule/upload`, `POST /api/rule/delete?id=...` | Create or delete a rule |

### Transactions and uploads

| Endpoint | Purpose |
| --- | --- |
| `GET /api/transactions` | Retrieve paginated transactions and their latest qualification results |
| `GET /api/transaction-sources` | List saved shared sources for the upload dropdown |
| `POST /api/uploads` | Create an upload session with a required `sourceName` |
| `PUT /api/uploads/{id}/parts/{partNumber}` | Upload a binary file chunk |
| `POST /api/uploads/{id}/complete` | Queue the CSV import |
| `GET /api/uploads/{id}`, `DELETE /api/uploads/{id}` | Check progress or cancel an upload |
| `GET /api/uploads/{id}/duplicates.xlsx` | Download the duplicate transaction report while review is pending |
| `POST /api/uploads/{id}/duplicates/confirm` | Continue the import while skipping duplicate transactions |

### Machine learning

| Endpoint | Purpose |
| --- | --- |
| `POST /predict` (ML service) | Placeholder prediction endpoint |
| `POST /api/qualifications/evaluate` | Compute qualifications and fees |
| `POST /api/assistant/recommendations` | Generate Romanian improvement recommendations from qualification conditions through Ollama |

Protected backend requests use `Authorization: Bearer <token>`. Current access rules are defined in [SecurityConfig.java](backend/src/main/java/org/schemeguard/backend/config/SecurityConfig.java).

For a transaction CSV example, see [transactions_40.csv](transactions_40.csv). Required columns are defined in [CsvImportService.java](backend/src/main/java/org/schemeguard/backend/service/csvUpload/CsvImportService.java).

# Rule-based component example
```json

{
  "scheme_id": "8c6d8f90-6b3f-4c7b-9b4a-111111111111",
  "rule_code": "MC_EU_CONSUMER_CREDIT_POS",
  "rule_name": "Mastercard EU Consumer Credit POS",
  "region": "EU",
  "priority": 10,
  "conditions": {
    "all": [
      {
        "field": "card_type",
        "operator": "equals",
        "value": "CREDIT"
      },
      {
        "field": "card_category",
        "operator": "equals",
        "value": "CONSUMER"
      },
      {
        "field": "channel",
        "operator": "equals",
        "value": "POS"
      },
      {
        "field": "three_ds_used",
        "operator": "equals",
        "value": true
      },
      {
        "field": "clearing_delay_days",
        "operator": "less_than_or_equal",
        "value": 1
      }
    ]
  },
  "result": {
    "qualification_category": "EU_CONSUMER_CREDIT_POS",
    "interchange_rate": 0.003,
    "fee_type": "PERCENTAGE"
  },
  "effective_from": "2026-01-01",
  "effective_to": null,
  "version": 1,
  "active": true
}

```


# Transaction example

```json

{
  "transaction_id": "TX-100045",
  "network": "VISA",
  "amount": 100.00,
  "currency": "EUR",

  "merchant_country": "RO",
  "merchant_id": "MER-123",
  "merchant_name": "Example Electronics",
  "mcc": "5732",

  "card_country": "FR",
  "card_type": "consumer_credit",
  "card_product": "traditional",
  "is_commercial_card": false,

  "channel": "ecommerce",
  "entry_mode": "card_not_present",
  "authentication": "3ds_authenticated",

  "authorization_timestamp": "2026-09-01T10:00:00Z",
  "clearing_timestamp": "2026-09-02T10:00:00Z",

  "authorization_code": "A78291",
  "settlement_status": "settled",

  "merchant_data_complete": true,
  "recurring": false,
  "refund": false
}

```

# Qualification result example
```json

Qualified
{
  "qualification_status": "qualified",
  "fee_category": "EU_CONSUMER_CREDIT_ECOMMERCE",
  "estimated_interchange_rate": 0.30,
  "estimated_interchange_amount": 0.30,
  "currency": "EUR",
  "confidence": 0.96,
  "reasons": [
    "Cardul este consumer credit",
    "Comerciantul și cardul sunt din regiunea EU",
    "Tranzacția este autentificată 3DS",
    "Clearing-ul s-a făcut în mai puțin de 2 zile"
  ],
  "warnings": []
}

Unqualified
---------------------------------------------------------

{
  "qualification_status": "not_qualified",
  "fee_category": "FALLBACK_ECOMMERCE",
  "estimated_interchange_rate": 1.80,
  "estimated_interchange_amount": 1.80,
  "confidence": 0.91,
  "reasons": [
    "Clearing-ul a avut loc după 5 zile",
    "Datele comerciantului sunt incomplete"
  ],
  "recommendations": [
    "Trimiteți date complete ale comerciantului",
    "Reduceți intervalul dintre autorizare și clearing"
  ]
}

```

## RAG knowledge retrieval

The recommendation assistant keeps exact transaction and qualification data in PostgreSQL and optionally enriches the prompt with semantically retrieved rule/documentation snippets.

Before using RAG, run `db/rag_documents.sql` against the application database. The backend uses Ollama's `embeddinggemma` model by default and pulls it through Docker Compose.

After the schema and model are available, an administrator can index the existing interchange rules:

```http
POST /api/rag/rules/reindex
```

Additional documentation can be indexed through:

```http
POST /api/rag/documents
Content-Type: application/json

{
  "title": "Card scheme guidance",
  "source": "docs/card-scheme-guidance.md",
  "content": "Documentation text to split into chunks and index."
}
```

RAG is optional at runtime: if the vector schema or embedding model is unavailable, the assistant falls back to the exact transaction context and continues to answer normally.
