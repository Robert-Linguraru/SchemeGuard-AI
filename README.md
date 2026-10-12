# SchemeGuardAI

SchemeGuardAI manages card-scheme rules, qualifies imported transactions, and calculates interchange fees.

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
| ML service API documentation | http://localhost:8000/docs |
| ML service health check | http://localhost:8000/health |
| ML service outlier endpoint | `POST http://localhost:8000/detect-outliers` |

### OpenAPI contract generation

The backend generates its OpenAPI 3 contract from Spring controllers and DTOs using
springdoc. After starting the backend, inspect the specification at
`http://localhost:8080/v3/api-docs` or Swagger UI at `http://localhost:8080/swagger-ui.html`.
The whole `TransactionUploadController` is hidden from the generated specification because
it includes a chunked binary upload endpoint; this means the other upload routes in that
controller are hidden from Swagger too. The separate anomaly controller remains documented.

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

### MY AGENT security boundary

`POST /api/agent/chat` checks that the authenticated user owns the selected upload and that
each selected transaction belongs to it before loading transaction and qualification data
from PostgreSQL. A request can include up to two transaction IDs and recent conversation
history. The backend sends this context to the configured OpenAI-compatible Chat Completions
API when `OPENAI_API_KEY` is set. The agent is read-only and has no action tools; backend
ownership checks remain the authorization boundary. Prompts and transaction fields are
treated as untrusted data, not as a security control.

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
| `OPENAI_API_KEY` | API key for MY AGENT; optional, but required for model-generated answers |
| `OPENAI_MODEL` | Chat Completions model; `gpt-4o-mini` |
| `OPENAI_BASE_URL` | OpenAI-compatible API base URL; `https://api.openai.com/v1` |
| `CURRENCY_RATES_ENABLED` | Enable scheduled ECB rate synchronization through Frankfurter; `true` |
| `CURRENCY_RATES_CRON` | Rate refresh schedule; `0 0 18 * * MON-FRI` |
| `CURRENCY_RATES_ZONE` | Schedule time zone; `Europe/Bucharest` |
| `CURRENCY_RATES_CURRENCIES` | Currency codes to synchronize; `EUR,RON,USD,GBP,CHF` |
| `CURRENCY_RATES_REFRESH_ON_STARTUP` | Fetch rates when the backend starts; `true` |
| `VITE_API_BASE_URL` | Base path used by the browser's chunked upload client; defaults to `/api` |

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

## API reference

The React application calls the Spring Boot API on the same origin under `/api`. In local
development, Vite proxies `/api` to `http://backend:8080`. The browser sends the JWT access
token as `Authorization: Bearer <token>` for protected requests. Registration, login, and
`GET /api/rule/getRule` are public; other application API routes require authentication.
Rule management, card-scheme mutations, and the database nuke operation require an admin
role. Upload and transaction endpoints check ownership against the signed-in user.

The tables below list the routes used or supported by current web-client API modules.
`{uploadId}` and other braced path values are identifiers returned by the API.

### Authentication and profile

| Method and path | Purpose / request |
| --- | --- |
| `POST /api/auth/register` | Create an account; JSON registration fields; public |
| `POST /api/auth/login` | Sign in; returns the access token and account profile; public |
| `GET /api/auth/me` | Load the signed-in account after page refresh |
| `PUT /api/auth/profile` | Update the current account's email, name, and optional password |

### Card schemes

| Method and path | Purpose / query or body |
| --- | --- |
| `GET /api/card-schemes` | Search and page through schemes; `search`, `page`, `size`, `sort`, `includeInactive` |
| `GET /api/card-schemes/{cardSchemeId}` | Read scheme details; `includeInactive=true` is admin-only. A client helper exists, though no current page calls it. |
| `POST /api/card-schemes` | Create a scheme; `{ "code": "...", "name": "..." }`; admin |
| `PATCH /api/card-schemes/{cardSchemeId}` | Update scheme code and name; admin |
| `PATCH /api/card-schemes/{cardSchemeId}/activate` | Activate; optional `{ "cascade": true }`; admin |
| `PATCH /api/card-schemes/{cardSchemeId}/deactivate` | Deactivate the scheme and associated data; admin |
| `DELETE /api/card-schemes/{cardSchemeId}` | Delete the scheme and dependent data; admin |

### Rules

| Method and path | Purpose / query or body |
| --- | --- |
| `GET /api/rule/getRules` | List rules; admin |
| `GET /api/rule/getRule?id={ruleId}` | Read one rule; this route is public |
| `POST /api/rule/upload` | Create a rule using the rule JSON structure shown below; admin |
| `POST /api/rule/delete?id={ruleId}` | Delete a rule; admin |

### Transaction sources and CSV uploads

| Method and path | Purpose / query or body |
| --- | --- |
| `GET /api/transaction-sources` | List saved sources for the CSV upload form |
| `POST /api/uploads` | Create an upload session; JSON includes `fileName`, `fileSizeBytes`, and `sourceName` |
| `GET /api/uploads` | List uploads; supports `page`, `size`, `search`, and `sort` |
| `PUT /api/uploads/{uploadId}/parts/{partNumber}` | Send one binary chunk (`application/octet-stream`); optional `X-Chunk-SHA256` checksum |
| `POST /api/uploads/{uploadId}/complete` | Finish sending chunks and queue CSV import |
| `GET /api/uploads/{uploadId}` | Read upload/import status and progress; response is not cached |
| `DELETE /api/uploads/{uploadId}` | Cancel an upload session or in-progress import |
| `POST /api/uploads/{uploadId}/duplicates/confirm` | Confirm import while skipping the reported duplicate transactions |
| `GET /api/uploads/{uploadId}/duplicates.xlsx` | Download an XLSX report when duplicate review is pending |
| `DELETE /api/uploads/{uploadId}/document` | Delete the stored original CSV document |
| `GET /api/uploads/{uploadId}/transactions` | List transactions in one upload; supports `page`, `size`, `search`, `sort`, and `anomaliesOnly` |
| `POST /api/uploads/{uploadId}/evaluate` | Evaluate all transactions in an upload against rules and calculate fees |
| `GET /api/uploads/{uploadId}/statistics` | Read upload-level transaction and qualification statistics |
| `GET /api/uploads/{uploadId}/download` | Download the original CSV file |

The upload client creates a session, uploads chunks in parallel (with retry on throttling or
server errors), completes the session, and polls its status until import finishes. Import
statuses include `QUEUED`, `PROCESSING`, `FINALIZING`, `COMPLETED`, `DUPLICATES_FOUND`,
`DUPLICATE`, `FAILED`, and `CANCELLED`.

### Outlier detection and review

| Method and path | Purpose |
| --- | --- |
| `POST /api/uploads/{uploadId}/anomalies/detect` | Queue anomaly detection; returns HTTP `202 Accepted` and a job ID |
| `GET /api/uploads/{uploadId}/anomalies/status` | Check the job status (`PENDING`, `RUNNING`, `COMPLETED`, or `FAILED`) |
| `GET /api/uploads/{uploadId}/anomalies` | Return transaction IDs marked as outliers |
| `POST /api/uploads/{uploadId}/anomalies/{transactionId}/confirm` | Mark an outlier as manually reviewed |

The current web flow calls the Spring API. The backend processes anomaly jobs with its Java
rules engine; it does not send these requests to the separate FastAPI ML service.

### Analytics and transaction explanations

| Method and path | Purpose / query |
| --- | --- |
| `GET /api/currency/available` | Load currencies available for the analytics selector |
| `GET /api/analytics` | Load dashboard metrics; optional `from`, `to`, `scheme`, `country`, `merchant`, `qualification`, `status`, and `targetCurrency` filters |
| `GET /api/results/explanation` | Explain a transaction's qualification and fees; requires `transactionId` and `uploadId` |

### MY AGENT

| Method and path | Purpose / JSON body |
| --- | --- |
| `POST /api/agent/chat` | Ask about an upload's transactions; body contains `message`, nullable `uploadId`, `transactionIds` (up to two), and `history` |

The backend checks upload and transaction ownership, loads the relevant transaction and
qualification context, and calls the configured OpenAI-compatible `POST
{OPENAI_BASE_URL}/chat/completions` endpoint. `OPENAI_API_KEY` is sent by the backend as a
Bearer token and is never sent directly by the browser. If no key is configured, deterministic
anomaly-list requests can still be answered, while model-generated chat is unavailable.

### Admin operation

| Method and path | Purpose |
| --- | --- |
| `POST /api/admin/nuke` | Execute `db/utils/Nuke.sql` after admin confirmation; permanently removes application data |

### Other backend and service endpoints

These routes are available in the services but are not called directly by the current React
client:

| Service | Method and path | Purpose |
| --- | --- | --- |
| Spring Boot | `GET /api/currency/convert?sourceCurrency=...&targetCurrency=...&sourceValue=...` | Convert a value using stored currency rates |
| Spring Boot | `POST /api/qualifications/evaluate?file_id={uploadId}` | Alternate upload-evaluation route; the web client uses `/api/uploads/{uploadId}/evaluate` |
| FastAPI ML service | `GET /health` | Service health response |
| FastAPI ML service | `POST /detect-outliers` | Outlier calculation endpoint; current backend anomaly jobs use Java instead |

The FastAPI service does not currently expose `/predict`. The PostgreSQL database configured
in `.env` is accessed by the backend through JDBC; the browser does not call the database or
Supabase REST APIs directly.

### External APIs and API documentation

| API | How SchemeGuard uses it |
| --- | --- |
| Frankfurter, `GET https://api.frankfurter.dev/v2/providers/ecb/rates` | Backend imports configured ECB currency pairs at startup and on its weekday schedule; rates are stored locally for analytics and conversion |
| OpenAI-compatible Chat Completions, `POST {OPENAI_BASE_URL}/chat/completions` | Optional backend integration used by MY AGENT when `OPENAI_API_KEY` is configured |
| Springdoc OpenAPI | `http://localhost:8080/v3/api-docs` serves the backend specification; Swagger UI is at `http://localhost:8080/swagger-ui.html` |

`TransactionUploadController` is hidden from the generated OpenAPI contract because it
contains the chunked binary upload route, so its upload, status, transaction, evaluation,
statistics, and download endpoints are documented above but omitted from generated OpenAPI.
The separate anomaly controller is included in the contract. To regenerate frontend contract
types after documented backend API changes, run `npm run api:types` from `frontend/`.

Generate a transaction CSV fixture with `py misc/generate_csv.py`. Required columns are
defined in [CsvImportService.java](backend/src/main/java/org/schemeguard/backend/service/csvuploads/CsvImportService.java).

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
