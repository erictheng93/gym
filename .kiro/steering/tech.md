# Tech Stack & Development

## Backend
- **Directus v11** - Headless CMS with auto-generated REST/GraphQL APIs
- **PostgreSQL 18** - Primary database with Row-Level Security (RLS)
- **Node.js 20 LTS** - Runtime for Directus and custom extensions
- **Docker Compose** - Local development environment

## Frontend
- **Nuxt 3** - SSR/SSG framework
- **Vue 3.5** - UI framework with Composition API
- **Tailwind CSS** - Utility-first styling
- **@directus/sdk** - API client
- **PWA** - Offline support via @vite-pwa/nuxt
- **pnpm** - Package manager (monorepo)

## Infrastructure
- Cloudflare Pages (frontend), Cloudflare R2 (file storage)
- Coolify/VPS for backend containers

## Development Commands

### Backend
```bash
cd backend
docker-compose up -d          # Start Directus + PostgreSQL
# Directus Admin: http://localhost:8055
# Default: admin@gym.com / admin
```

### Frontend
```bash
cd frontend
pnpm install
pnpm run dev                  # Dev server at http://localhost:3000
pnpm run build                # Production build
```

### Database
```bash
# Run migrations
docker-compose exec database psql -U directus -d gym_nexus -f /path/to/migration.sql

# Schema files in backend/
# - schema.sql: Core tables
# - seed.sql: Initial data
# - migrations/: Incremental changes
```

## Key Libraries
- `@directus/sdk` - Directus API client with TypeScript support
- `signature_pad` - Canvas-based e-signature
- `sharp` - PWA icon generation
