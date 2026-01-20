# Gym Nexus Project Context for Gemini

## 1. Project Overview
Gym Nexus is a comprehensive Gym Management System designed to support **Multi-Store/Chain architectures**. 
It utilizes a modern full-stack architecture with a headless CMS backend and a Nuxt-based frontend monorepo.

### Core Design Philosophy
- **Universal ID:** A single underlying user account system across all branches and services.
- **Hierarchical Management:** Clear separation between Headquarters (HQ) and Branch operations.
- **Integrated Solution:** Unifies CRM, Electronic Contracts, HR/Payroll, and BI Reporting.

### Core Objectives
- **Member Management:** Contracts, Check-ins, profiles, universal access.
- **Admin Dashboard:** Staff management, reporting, configuration, multi-store views.
- **Member App:** Class booking, payments, QR code access.
- **Scalability:** Dockerized services, Redis caching, Postgres optimizations.

## 2. Tech Stack & Architecture

### 2.1 Technical Stack
#### Backend (Dockerized)
Located in `backend/`
- **CMS/API:** [Directus 11](https://directus.io/) (Headless CMS, Node.js)
- **Database:** PostgreSQL 17 + PostGIS 3.4 (Geospatial support)
- **Cache:** Redis 7 (Session, API caching)
- **Infrastructure:** Docker Compose

#### Frontend (Monorepo)
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

### 2.2 System Architecture Logic
- **Multi-Store Support:**
  - **HQ:** Access to all branch data, cross-store reports, and global policy settings.
  - **Branch:** Access restricted to local data, staff, and members.
- **Global Membership (Universal ID):**
  - Unique underlying `User` ID.
  - Supports future extensions to other service types (e.g., Pilates, Physical Therapy) with shared data.

## 3. Functional Modules

### Module 1: CRM & Contract Center
*Goal: Comprehensive member database with precise filtering and digital administration.*

- **Customer Database:**
  - **Filters:** Branch, Month, Coach, Keyword (Name/Phone/ID), Contract Status (Active/Expired/Terminated).
  - **Columns:** Member Info, Current Plan, Financial Status (Prepaid/Revenue), Coach.
  - **Management:** Store Managers can re-assign members/contracts between coaches.
- **Member Profile:**
  - **Basic Info:** Profile, Timeline, Contact info.
  - **E-Contract:** Generation, Digital Signature, Auto-emailing, Cloud storage.
  - **History:** Purchase records, Attendance records.

### Module 2: HR & Payroll (HRM)
*Goal: Independent staff management including attendance and compensation.*

- **Staff Profile:** Position, Branch, Employment Status, RBAC Roles.
- **Attendance & Leave:**
  - Check-in/out logging (Time & Location/IP).
  - Leave application and approval workflow (Annual, Sick, Personal leave).
- **Payroll:**
  - **Calculation:** Base Salary + Class Fees (Execution) + Commissions (Sales) - Leave Deductions.
  - Supports different commission rates based on seniority.

### Module 3: BI Reporting Center
*Goal: Automated charts and data for "Single Store" and "HQ" views.*

- **Dimensions:** Daily/Weekly/Monthly; Store-wide/Individual Staff.
- **Core Reports:**
  1.  **Sales Report:** New contract value (Cash Flow).
  2.  **Execution Report:** Realized revenue from conducted classes (Revenue Recognition).
  3.  **Revenue/Profitability:** Sales - (Personnel + Ops Costs) = Gross Profit.
  4.  **Refund Report:** Refund records, reasons, and fees.
  5.  **Accounts Receivable (AR):** Outstanding payments.

### Module 4: Admin & Security

- **Role-Based Access Control (RBAC):**
  - **Super Admin:** Full access.
  - **Store Manager:** Full branch access, Staff Leave approval, Member Re-assignment.
  - **Vice Manager:** Assist Manager, read-only restricted.
  - **Coach:** View own members, Execute classes, View personal performance.
  - **Admin Staff:** Data entry, Payments, Refunds. (No access to Payroll).
  - **Marketing:** Export anonymized lists for analysis.
- **Permission Interface:** Granular checkbox system for custom permissions on top of default roles.

## 4. Technical & Data Strategy

1.  **Tenant ID (Store_ID):**
    - All core tables (Members, Contracts, Transactions) must include `Store_ID`.
    - Enables easy data segregation: HQ sees `Store_ID = All`, Branch sees `Store_ID = X`.
2.  **Global User vs. Local Member:**
    - Separate `Users` table (Auth, Universal ID) from `Members` table (Store-specific profile).
    - A single `User` can have multiple `Member` records (e.g., PT at Store A, Gym Access at Store B).
3.  **Payroll Implementation Strategy:**
    - Initial phase: Focus on "Performance Bonus" and "Class Fee" calculations.
    - Base salary and complex deductions can be handled via export to Excel/External systems initially to reduce risk.

## 5. Quick Start Guide

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

## 6. Key Commands Reference

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

## 7. Directory Structure Overview

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

## 8. Development Standards & AI Guidelines

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