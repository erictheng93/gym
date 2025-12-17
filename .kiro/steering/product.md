# Gym Nexus - Product Overview

Gym Nexus is a multi-branch gym management system (CRM/ERP) designed for fitness centers in Taiwan.

## Core Purpose
- Manage 50+ gym branches with centralized data and reporting
- Automate contract lifecycle (pause/transfer/extension with auto-calculated end dates)
- Enforce row-level security for data isolation (HQ → Store Manager → Coach)
- Integrate HR (attendance, leave) and financial modules

## Key Business Domains
1. **Organization** - Multi-tenant branches (HEADQUARTER/BRANCH), job titles with JSON permissions
2. **Members (CRM)** - Member lifecycle, status auto-updated by contract state, tagging system
3. **Contracts** - TIME_BASED (monthly/yearly) and COUNT_BASED (class packages), e-signatures, PDF generation
4. **HR** - Employee attendance (GPS/IP tracking), leave requests with approval workflow
5. **Finance** - Payment tracking, AR management, multi-dimensional reports

## User Roles
| Role | Access Scope |
|------|--------------|
| HQ_ADMIN | Full system access |
| STORE_MANAGER | Own branch data only |
| COACH | Own assigned members only |
| RECEPTION | Branch operations |
| MARKETING | Member data (read-only) |
| HR | Employee data for branch |
| MEMBER | Self-service via PWA |

## Language Convention
- **UI/Documentation**: Traditional Chinese (繁體中文)
- **Code/Database**: English
