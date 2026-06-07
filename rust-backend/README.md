# Gym Rust Backend MVP

This is the Rust backend port starting point. It intentionally covers only the shared API foundation:

- Axum HTTP server and routing
- JSON health checks
- unified JSON error envelopes
- request/body validation failure mapping
- PostgreSQL connection pool via SQLx
- staff login and bearer JWT tenant context

## Commands

```bash
cargo build
cargo test
cargo run
```

## Acceptance matrix

Use these as the minimum Rust-backend acceptance checks before wiring a frontend
or promoting a CI run.

| Scope | Command | Notes |
| --- | --- | --- |
| Fast non-DB unit/route checks | `cargo test` | DB smoke tests are gated off unless `RUN_DB_TESTS=1`. |
| Compile-only gate | `cargo build` | Confirms the Axum service and route tree compile. |
| Targeted DB smoke | `RUN_DB_TESTS=1 DATABASE_URL=postgresql://gym_nexus:gym_nexus_dev@localhost:15432/gym_nexus cargo test member_app_core_smoke_with_seed_data -- --nocapture` | Covers member app auth/profile/classes/bookings/contracts/payments/checkins/fitness/support/reviews/notifications against a real Postgres schema. |
| Admin notification DB smoke | `RUN_DB_TESTS=1 DATABASE_URL=postgresql://gym_nexus:gym_nexus_dev@localhost:15432/gym_nexus cargo test admin_notification_config_and_usage_round_trip_with_seed_user -- --nocapture` | Covers admin notification config, usage, and CSV export paths used by admin-web. |
| Frontend integration smoke | Start Rust with `BIND_ADDRESS=127.0.0.1:8056 cargo run`, set frontend `API_BASE_URL=http://localhost:8056`, then run the relevant app typecheck or targeted smoke. | Avoid full frontend builds for quick validation unless the change touches frontend build/runtime config. |

For a broader DB pass, run `RUN_DB_TESTS=1 DATABASE_URL=... cargo test -- --nocapture`.
That is slower and should be reserved for CI or release validation.

Run migrations:

```bash
cargo binstall sqlx-cli --no-default-features --features postgres
DATABASE_URL=postgresql://gym_nexus:gym_nexus_dev@localhost:15432/gym_nexus sqlx migrate run
```

For local DB-backed health checks, start the existing database from `backend/` first and use:

```bash
DATABASE_URL=postgresql://gym_nexus:gym_nexus_dev@localhost:15432/gym_nexus BIND_ADDRESS=127.0.0.1:8056 cargo run
```

Frontend apps expect the backend at `API_BASE_URL=http://localhost:8056` by
default. If you bind Rust to a different port, update the app env files before
running member/admin integration smoke checks.

## Routes

- `GET /health` returns process health without touching the database.
- `GET /health/db` returns database connectivity health using a lightweight query.
- `POST /api/auth/login` accepts staff email/password and returns a bearer token.
- `GET /api/auth/me` returns the authenticated staff user and tenant context.
- unmatched routes return a JSON `404` envelope.
- unsupported methods on known routes return a JSON `405` envelope.
