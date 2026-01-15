# Gym Nexus Project Context for Gemini

## 1. Project Overview
Gym Nexus is a comprehensive Gym Management System designed to be SaaS-capable and multi-tenant. It utilizes a modern full-stack architecture with a headless CMS backend and a Nuxt-based frontend monorepo.

### Core Objectives
- **Member Management:** Contracts, Check-ins, profiles.
- **Admin Dashboard:** Staff management, reporting, configuration.
- **Member App:** Class booking, payments, QR code access.
- **Scalability:** Dockerized services, Redis caching, Postgres optimizations.

## 2. Tech Stack & Architecture

### Backend (Dockerized)
Located in `backend/`
- **CMS/API:** [Directus 11](https://directus.io/) (Headless CMS, Node.js)
- **Database:** PostgreSQL 17 + PostGIS 3.4 (Geospatial support)
- **Cache:** Redis 7 (Session, API caching)
- **Infrastructure:** Docker Compose

### Frontend (Monorepo)
Located in `frontend/` (Managed via `pnpm` workspaces)
- **Framework:** [Nuxt 4](https://nuxt.com/) (Vue 3, Vite)
- **Language:** TypeScript
- **Styling:** Tailwind CSS (Inferred)
- **State/Validation:** Zod, Pinia (Inferred)
- **Testing:** Vitest (Unit), Playwright (E2E)

#### Applications
- **Admin Web:** `apps/admin-web` (Port 3001) - For staff and managers.
- **Member App:** `apps/member-app` (Port 3002) - PWA for gym members.
- **Shared Packages:** `packages/shared`, `packages/ui`

## 3. Quick Start Guide

### Prerequisites
- Node.js & pnpm (for frontend)
- Docker & Docker Compose (for backend)

### Backend Setup
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Start services:
   ```bash
   docker-compose up -d
   ```
   - Directus Console: `http://localhost:8500`
   - Database: Port 5444
   - Redis: Port 6333

### Frontend Setup
1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   pnpm install
   ```
3. Start Development Servers:
   - **Admin Web:**
     ```bash
     pnpm dev:admin
     ```
   - **Member App:**
     ```bash
     pnpm dev:member
     ```

## 4. Key Commands Reference

| Category | Command | Description | Directory |
|----------|---------|-------------|-----------|
| **Backend** | `docker-compose up -d` | Start backend services | `backend/` |
| | `docker-compose down` | Stop backend services | `backend/` |
| | `docker-compose logs -f` | View logs | `backend/` |
| **Frontend** | `pnpm install` | Install dependencies | `frontend/` |
| | `pnpm dev:admin` | Start Admin App (Port 3001) | `frontend/` |
| | `pnpm dev:member` | Start Member App (Port 3002) | `frontend/` |
| | `pnpm build` | Build all apps | `frontend/` |
| | `pnpm typecheck` | Run type checking | `frontend/` |
| | `pnpm lint` | Run ESLint | `frontend/` |
| **Testing** | `pnpm test` | Run Unit Tests (Vitest) | `frontend/` |
| | `pnpm test:e2e` | Run E2E Tests (Playwright) | `frontend/` |
| | `pnpm test:e2e:ui` | E2E Tests with UI Mode | `frontend/` |

## 5. Directory Structure Overview

```
.
├── backend/                # Backend Infrastructure & Config
│   ├── docker-compose.yml  # Service definitions
│   ├── migrations/         # SQL Migrations
│   ├── extensions/         # Custom Directus extensions
│   └── uploads/            # Local file storage
├── frontend/               # Frontend Monorepo Root
│   ├── apps/
│   │   ├── admin-web/      # Admin Dashboard (Nuxt)
│   │   └── member-app/     # Member PWA (Nuxt)
│   ├── packages/           # Shared code
│   ├── e2e/                # Playwright E2E tests
│   └── package.json        # Workspace scripts
├── docs/                   # Project Documentation
└── .github/                # CI/CD Workflows
```

## 6. Development Standards & AI Guidelines

### Code Style
- **Vue/Nuxt:** Use Composition API (`<script setup lang="ts">`).
- **TypeScript:** Strict typing preferred. Use Zod for runtime validation.
- **Naming:** PascalCase for components, camelCase for functions/vars.

### Testing
- **Unit:** Write Vitest tests for utility functions and complex components.
- **E2E:** Critical flows (Auth, Payments, Booking) must be covered by Playwright.
- **Run Tests:** Always run `pnpm typecheck` and `pnpm lint` before committing.

### Git Workflow
- **Commits:** Follow Conventional Commits (e.g., `feat:`, `fix:`, `chore:`).
- **Branches:** Feature branches preferred.

### Important Notes
- **Directus:** The backend logic is heavily data-driven via Directus. Schema changes often require migrations (`backend/migrations`).
- **Environment:** Check `.env.example` files in respective directories for required variables.
