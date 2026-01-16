# Scripts

Cross-platform testing and utility scripts for Gym Nexus.

## Prerequisites

- Node.js 18+ (for native fetch support)
- pnpm
- Docker (for database tests)

## Setup

```bash
cd scripts
pnpm install
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `pnpm test:api` | Basic Directus API connectivity test |
| `pnpm test:hooks` | Test business logic hooks via API |
| `pnpm test:hooks:db` | Test hooks by querying database directly |

## Script Details

### `test-directus-api.ts`
Tests basic Directus API functionality:
- Server health check
- Authentication (login)
- Data retrieval (members)

### `test-hooks-api.ts`
Tests business logic hooks through the API:
- Contract pause auto-extension
- Class usage deduction
- Contract resume
- Member status auto-update

### `test-hooks-functionality.ts`
Tests hooks by querying the database directly via Docker:
- Verifies data state without API triggers
- Checks Directus extension loading status
- Useful for debugging hook behavior

## Running Directly

You can also run scripts directly without pnpm:

```bash
# Using npx
npx tsx test-directus-api.ts

# Or with node (requires tsx installed globally)
tsx test-directus-api.ts
```

## Cross-Platform Compatibility

These scripts are designed to work on:
- Windows (PowerShell, CMD)
- macOS (Terminal)
- Linux (Bash)

No shell-specific syntax is used. All scripts use Node.js native APIs.
