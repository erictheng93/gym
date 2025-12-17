# Project Structure

```
gym-nexus/
├── backend/                          # Directus backend
│   ├── docker-compose.yml            # PostgreSQL + Directus services
│   ├── extensions/                   # Custom Directus extensions
│   │   └── directus-extension-gym-hooks/
│   │       └── src/index.js          # Business logic hooks (contract pause, member status sync, etc.)
│   ├── migrations/                   # SQL migration files (numbered)
│   ├── schema.sql                    # Core database schema
│   ├── seed.sql                      # Initial seed data
│   └── uploads/                      # Local file uploads (dev)
│
├── frontend/                         # Nuxt 3 monorepo
│   ├── app/                          # Main application
│   │   ├── components/               # Vue components (PascalCase.vue)
│   │   ├── composables/              # Vue composables (useCamelCase.ts)
│   │   │   ├── useAuth.ts            # Authentication state
│   │   │   ├── useDirectus.ts        # Directus SDK wrapper
│   │   │   ├── useMembers.ts         # Member CRUD operations
│   │   │   └── ...
│   │   ├── middleware/               # Route middleware
│   │   ├── pages/                    # File-based routing
│   │   │   ├── members/              # /members routes
│   │   │   ├── contracts/            # /contracts routes
│   │   │   ├── employees/            # /employees routes
│   │   │   └── ...
│   │   ├── plugins/                  # Nuxt plugins
│   │   │   └── directus.ts           # Directus client initialization
│   │   └── types/                    # TypeScript definitions
│   │       └── directus.ts           # Schema types matching DB
│   ├── apps/                         # Future: separate apps
│   │   ├── admin-web/                # Staff dashboard (planned)
│   │   └── member-app/               # Member PWA (planned)
│   ├── packages/shared/              # Shared code (planned)
│   ├── nuxt.config.ts                # Nuxt configuration
│   └── package.json                  # pnpm workspace root
│
├── PRD.md                            # Product requirements (Chinese)
├── README.md                         # Project overview
├── CLAUDE.md                         # AI assistant guide
└── 健身房系統架構設計.md               # Technical architecture (Chinese)
```

## Naming Conventions
| Context | Convention | Example |
|---------|------------|---------|
| Database tables/columns | snake_case | `member_code`, `branch_id` |
| TypeScript/Vue | camelCase | `memberCode`, `branchId` |
| Vue components | PascalCase | `MemberCard.vue` |
| Composables | useCamelCase | `useMembers.ts` |
| API routes | kebab-case | `/api/member-status` |

## Core Database Entities
1. `branches` - Multi-tenant root (type: HEADQUARTER/BRANCH)
2. `employees` - Staff linked to directus_users
3. `members` - Customers with auto-updated status
4. `contracts` - Links members to membership_plans
5. `contract_logs` - Tracks pause/transfer/extension
6. `payments` - Financial records per contract
7. `attendances` - Employee check-in/out
8. `leave_requests` - HR leave management

## Permission Model
- Directus Policies + PostgreSQL RLS
- `job_titles.permissions_config` (JSON) defines role defaults
- `employees.custom_permissions` (JSON) for per-employee overrides
- Key filter: `branch_id = $CURRENT_USER.branch_id`
