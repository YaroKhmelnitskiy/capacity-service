# Capacity Service

Tracks the credit capacity of financing programs. An approved invoice reserves part of a program's limit; repayment releases it. Clients read what is still available. The treasury system sends limit changes and periodic full-state reconciliations over Kafka.

TypeScript, NestJS 11, Postgres, Kafka.

## Run

Requirements: Docker with Compose.

```bash
docker compose up --build
```

This starts Postgres, a single-node Kafka (KRaft), creates the `treasury.capacity` topic and starts the API on `http://localhost:3000`. Migrations run on start-up. `docker compose down -v` deletes the data.

Every endpoint except health and metrics needs a JWT. To get a local token:

```bash
export TOKEN=$(docker compose exec -T app node dist/infrastructure/auth/issueToken.js my-client)
```

Programs come from treasury. To create one, send a message to the topic:

```bash
echo 'prog-1|{"type":"LIMIT_UPDATED","programId":"prog-1","currency":"USD","limit":1000000000,"version":1}' | \
  docker compose exec -T kafka /opt/kafka/bin/kafka-console-producer.sh --bootstrap-server localhost:9092 \
  --topic treasury.capacity --property parse.key=true --property 'key.separator=|'
```

For local development (Node 24.13+, pnpm):

```bash
docker compose up -d db kafka kafka-init
pnpm install
set -a && . ./example.env && set +a
pnpm start:dev
pnpm token my-client      # prints a token signed with JWT_SECRET
```

| Variable | Default | |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `DATABASE_URL` | required | Postgres connection string |
| `JWT_SECRET` | required | HS256 secret, at least 32 characters |
| `KAFKA_BROKERS` | required | Comma-separated, e.g. `localhost:9094` |
| `KAFKA_TOPIC` | `treasury.capacity` | Treasury topic |
| `KAFKA_GROUP_ID` | `capacity-service` | Consumer group |
| `FX_RATES` | none | `USD=1,EUR=1.08,…`: value of one unit of each currency in a common base |
| `LOG_LEVEL` | `info` | `fatal` … `trace`, or `silent` |

## API

Amounts are integers in the **minor units** of their currency: cents for USD, yen for JPY (no minor unit), fils for KWD (three digits). Currencies are ISO 4217 codes.

```bash
# capacity of a program (200)
curl -s localhost:3000/programs/prog-1 -H "Authorization: Bearer $TOKEN"
# {"programId":"prog-1","currency":"USD","limit":1000000000,"reserved":0,"available":1000000000}

# reserve capacity for an approved invoice (201; 200 for a repeat of the same request)
curl -s -X POST localhost:3000/programs/prog-1/reservations -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"invoiceId":"inv-1","amount":150000000,"currency":"EUR"}'
# {"programId":"prog-1","invoiceId":"inv-1","amount":150000000,"currency":"EUR","programAmount":162000000,
#  "fxRate":"1.08","status":"RESERVED","reservedAt":"…","releasedAt":null}

# a reservation (200)
curl -s localhost:3000/programs/prog-1/reservations/inv-1 -H "Authorization: Bearer $TOKEN"

# release it when the invoice is repaid (200, also for a repeat)
curl -s -X POST localhost:3000/programs/prog-1/reservations/inv-1/release -H "Authorization: Bearer $TOKEN"
```

`programAmount` is what the reservation takes from the program, in the program's currency.

| Status | When | `code` |
|---|---|---|
| `400` | invalid input; the body lists every problem | |
| `401` | missing, invalid or expired token | |
| `404` | unknown program or reservation | `PROGRAM_NOT_FOUND`, `RESERVATION_NOT_FOUND` |
| `409` | not enough capacity left | `INSUFFICIENT_CAPACITY` |
| `409` | the invoice is already reserved with another amount or currency | `INVOICE_ALREADY_RESERVED` |
| `422` | no exchange rate is configured for the invoice currency | `UNSUPPORTED_CURRENCY` |

Clients should branch on `code`; `message` is for developers and may change.

## Treasury messages

Topic `treasury.capacity`, JSON values, **keyed by `programId`**, so each program's messages stay in order within one partition.

```jsonc
// The limit of a program changed. The first message for a program creates it.
{ "type": "LIMIT_UPDATED", "programId": "prog-1", "currency": "USD", "limit": 1000000000, "version": 12 }

// The program's full state as treasury saw it at asOf: its limit and every reservation still outstanding.
{ "type": "RECONCILIATION", "programId": "prog-1", "currency": "USD", "limit": 1000000000, "version": 13,
  "asOf": "2026-10-27T09:00:00Z",
  "reservations": [{ "invoiceId": "inv-1", "amount": 150000000, "currency": "EUR", "programAmount": 162000000 }] }
```

`version` increases with every change treasury makes to a program, across both types.

## Decisions

The task leaves these questions open. Each answer is covered by a test.

**Capacity**
- **The limit can never be exceeded, even with many instances.** Every write locks its program's row (`SELECT … FOR UPDATE`) and checks the available amount inside the same transaction. Writes to one program run one at a time; different programs don't block each other. The e2e suite sends 25 concurrent reservations against room for 10.
- **`reserved` is stored on the program**, so reading capacity costs one row read. It always equals the sum of outstanding reservations: reservations and releases change both in one transaction, and a reconciliation recomputes it.
- **A lower limit doesn't cancel reservations.** If treasury lowers the limit below what is reserved, `available` goes negative and new reservations are refused until releases bring it back.

**Reservations**
- **One reservation per invoice and program**, and the invoice id is the idempotency key. Repeating a request with the same amount and currency returns the recorded reservation (`200`), so client retries are safe. The same invoice with other values returns `409`.
- **A released invoice can't be reserved again.** A repeat returns the released reservation; financing the same invoice twice needs a new invoice id.
- **A release frees the whole reservation.** Partial repayments are not modelled; a release frees exactly the `programAmount` that was reserved.
- **Programs are created only by treasury.** The API has no endpoint to create or change a program.

**Currencies**
- **The FX rate is fixed when the reservation is made** and stored with it. A release frees the stored program amount, so rate changes never make `reserved` drift. Existing reservations are not revalued when rates move.
- **The converted amount is rounded up** to the program currency's minor unit, so a reservation never takes less than the invoice is worth. Cross rates go through a common base and are rounded to 10 decimal places (half up); the stored rate gives exactly the stored amount. The arithmetic is native `bigint` fixed-point: rates are integers in units of 10⁻¹⁰ and amounts are capped at 10¹⁵ minor units, so no decimal library is needed and every result fits a JavaScript number.
- **Rates come from configuration (`FX_RATES`) behind the `ExchangeRates` abstraction.** The configuration is a stand-in: in production a market-data feed or treasury would implement `ExchangeRates`, and only the provider in `AppModule` changes. Rounding and conversion stay in the domain whatever the source. An invoice currency without a rate returns `422`. Same-currency reservations need no rate.
- **No repository interfaces.** Correctness relies on Postgres row locks and upserts, which an alternative implementation could not reproduce, so tests run against real Postgres instead of mocks. The FX source is the one dependency with a known second implementation, so it is the one behind an abstraction.

**Treasury and reconciliation**
- **Treasury is the source of truth as of `asOf`.** Applying a reconciliation:
  - sets the limit;
  - writes every listed reservation, with treasury's amounts;
  - releases every outstanding reservation that is not listed;
  - recomputes `reserved`.
- **Local changes after `asOf` win.** A reservation made or released here after the snapshot was taken keeps its local state, so a reconciliation can't undo a reservation treasury hadn't seen yet. This compares treasury's `asOf` with this service's clock; clock skew between the two is assumed to be small.
- **Older or repeated messages are ignored** by `version`. This makes the at-least-once delivery from Kafka safe, and an old snapshot can't overwrite a newer state.
- **A program's currency never changes.** A message with a different currency is rejected.
- **A message that can never be applied is logged at error level, counted and skipped**: invalid JSON, failed validation or a currency mismatch. Skipping it keeps the partition from blocking.
- **Other failures, such as a database outage, are retried from the same offset**, one second apart, until they succeed. Order within a program is kept.
- **The service doesn't start if Kafka is unreachable** at start-up, so the orchestrator restarts it instead of running without treasury updates. After that, the client reconnects by itself.

**Authentication**
- **Clients send a bearer JWT signed with HS256** and a shared secret, with a non-empty `sub`.
- **Any valid token can read and change any program.** Per-client authorisation (which client may touch which program) is not in scope.
- **Health checks and metrics are open.** They are meant for the internal network only.
- **The token script is a stand-in.** In production, an identity provider would issue tokens, ideally with asymmetric keys (RS256/ES256 via JWKS).

## Not done, on purpose

- **No outbox or events published by this service.** The task doesn't ask for any; if treasury needs to hear about reservations, add a transactional outbox.
- **No dead-letter topic.** Rejected messages are only logged and counted (`capacity_treasury_messages_total{result="rejected"}`); a DLQ would make replaying them easier.
- **No pagination or listing of reservations**, and no history beyond each reservation's own timestamps.
- **Reconciliation size is limited.** A reconciliation is one Kafka message, so the default 1 MB message limit allows roughly 8,000 outstanding reservations per program. Larger programs would need chunked snapshots or a pointer to a file.

## Observability

- **Logs**: JSON on stdout, one access line per request with a `requestId` (taken from `x-request-id` or generated). Every reservation, release and treasury message is logged with its ids and amounts.
- **Metrics** at `GET /metrics`, plus default Node.js metrics:
  - `capacity_http_request_duration_seconds`;
  - `capacity_reservations_total` and `capacity_releases_total` by result;
  - `capacity_treasury_messages_total` by type and result.
- **Health**: `GET /health/liveness`, and `GET /health/readiness` (`503` when Postgres is unreachable).
- **Shutdown**: on SIGTERM the service finishes requests in flight, then disconnects from Kafka.

## Tests

```bash
docker compose up -d db kafka kafka-init
pnpm test        # unit: money, config, message parsing
pnpm test:e2e    # HTTP API, reconciliation and Kafka end to end, against Postgres and Kafka
pnpm typecheck
pnpm lint
```

Each e2e file creates and drops its own database; the Kafka test uses its own topic and consumer group.

## Structure

The application lives in `capacity/`; `infrastructure/` is what it runs on and knows nothing about programs or reservations, except `fx/`, which implements the application's `ExchangeRates`. The repository and the Kafka consumer stay in `capacity/` because they carry business rules: locking, idempotency and reconciliation.

```text
src/
  capacity/       the application: programs, reservations, reconciliation
    api/          controller, DTOs, error codes
    treasury/     Kafka consumer and message validation
    database/     schema, migration, CapacityRepository (locking and reconciliation)
    CapacityService, CapacityModule, ExchangeRates, money and conversion, domain types and errors
  infrastructure/ what the application runs on
    database/     connection pool and migration runner
    fx/           ExchangeRates from configuration
    auth/         JWT guard and the local token script
    logging/      logger options and request ids
    metrics/      metrics and the access log
    health/       liveness, readiness, shutdown
    validation/   shared validation rules
  config/         environment configuration
  AppModule, app, bootstrap
  tests/          end-to-end tests and helpers
```
