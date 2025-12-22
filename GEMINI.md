# GEMINI.md

This file serves as the primary context and instruction manual for the Gemini AI agent working on the **Gym Nexus** project.

## 1. Project Overview

**Gym Nexus** is a comprehensive gym management system (CRM/ERP) designed for multi-branch operations. It features a Headless CMS backend and a modern Nuxt 3 frontend.

*   **Goal:** Manage memberships, contracts, HR (attendance/leave), and financial reporting across multiple gym branches.
*   **Architecture:**
    *   **Backend:** Directus (Headless CMS) running on Node.js with PostgreSQL.
    *   **Frontend:** Nuxt 3 Monorepo (managed via `pnpm`) containing:
        *   `apps/admin-web`: Staff/Admin dashboard.
        *   `apps/member-app`: Member-facing PWA.
        *   `packages/`: Shared logic and UI components.
    *   **Infrastructure:** Docker (local dev), Cloudflare (Pages/R2), VPS (Backend).

## 2. Key Files & Documentation

*   **`README.md`**: Project entry point, setup guide, and tech stack overview.
*   **`CLAUDE.md`**: Contains useful development commands and architecture summaries (highly relevant).
*   **`PRD.md`**: Product Requirement Document - detailed feature specs.
*   **`健身房系統架構設計.md`**: Technical architecture, database schema, and permission models.
*   **`frontend/package.json`**: Root scripts for the frontend monorepo.

## 3. Development Workflow & Commands

### Backend (Directus + Postgres)
*   **Location:** `backend/`
*   **Start:** `docker-compose up -d` (Runs Directus at `http://localhost:8055`)
*   **Extensions:** Located in `backend/extensions/`.
*   **Database:** PostgreSQL entities include `branches`, `employees`, `members`, `contracts`, `payments`.

### Frontend (Nuxt 3 Monorepo)
*   **Location:** `frontend/`
*   **Package Manager:** `pnpm`
*   **Install Dependencies:** `pnpm install`
*   **Start Admin App:** `pnpm dev:admin`
*   **Start Member App:** `pnpm dev:member`
*   **Build:** `pnpm build` (or specific app: `pnpm build:admin`)

### Testing
*   **Unit Tests (Vitest):** `pnpm test` (Runs in `frontend/`)
*   **E2E Tests (Playwright):** `pnpm test:e2e` (Runs in `frontend/`)
    *   UI Mode: `pnpm test:e2e:ui`
    *   Debug: `pnpm test:e2e:debug`

## 4. Coding Conventions

*   **Language:**
    *   **Code/Comments:** English.
    *   **UI/Documentation:** Traditional Chinese (繁體中文).
*   **Naming:**
    *   Database: `snake_case` (e.g., `member_code`, `branch_id`).
    *   TS/JS/Vue: `camelCase` (e.g., `memberCode`, `branchId`).
    *   Vue Components: `PascalCase` (e.g., `MemberCard.vue`).
*   **Frameworks:**
    *   **Vue 3** with Composition API (`<script setup>`).
    *   **Tailwind CSS** for styling.
    *   **Pinia** for state management.

## 5. Architecture Highlights

*   **Multi-Tenancy:** Data is isolated by `branch_id`.
*   **Permissions:** controlled by `job_titles` and `employees.custom_permissions`.
*   **Contracts:** Logic for `TIME_BASED` and `COUNT_BASED` memberships.
    *   **Pause Logic:** Pausing a contract *must* extend the `end_date` automatically.

## 6. Gemini Agent Instructions

*   **Context First:** Always check `PRD.md` or schema docs if business logic is unclear.
*   **Test-Driven:** When adding features, verify with `vitest` or `playwright`.
*   **Safety:** Explain any filesystem changes before execution.
*   **Monorepo Awareness:** Be mindful of which app (`admin-web` vs `member-app`) you are modifying.
