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

Run migrations:

```bash
cargo binstall sqlx-cli --no-default-features --features postgres
DATABASE_URL=postgresql://gym_nexus:gym_nexus_dev@localhost:15432/gym_nexus sqlx migrate run
```

For local DB-backed health checks, start the existing database from `backend/` first and use:

```bash
DATABASE_URL=postgresql://gym_nexus:gym_nexus_dev@localhost:15432/gym_nexus cargo run
```

## Routes

- `GET /health` returns process health without touching the database.
- `GET /health/db` returns database connectivity health using a lightweight query.
- `POST /api/auth/login` accepts staff email/password and returns a bearer token.
- `GET /api/auth/me` returns the authenticated staff user and tenant context.
- unmatched routes return a JSON `404` envelope.
- unsupported methods on known routes return a JSON `405` envelope.
