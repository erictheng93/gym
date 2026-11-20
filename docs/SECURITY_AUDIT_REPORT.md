# Security Audit Report: Gym Nexus (`erictheng93/gym`)

**Target Repository:** `erictheng93/gym`  
**Commit Audited:** `e043d17`  
**Audit Date:** 2026-11-20  
**Audit Framework:** Cloudflare Security Audit Skill  
**Classification:** Defensive Security Assessment  

---

## Executive Summary

A comprehensive security audit of the Gym Nexus repository (`erictheng93/gym`) was conducted across all subsystems:
- **Backend Service (`backend/`)**: TypeScript / Hono API handling multi-tenant gym management, authentication, contracts, members, payments, and PDF generation.
- **Rust Backend (`rust-backend/`)**: Axum HTTP service with CORS and database connectivity.
- **HR Service (`hr-service/`)**: Express service handling attendance, leave, and employee synchronization.
- **Frontend Applications (`frontend/`)**: Nuxt/Vue applications (`admin-web`, `member-app`, `coach-app`).

The assessment identified **10 significant security findings**, including **1 Critical**, **5 High**, **3 Medium**, and **1 Low** severity vulnerabilities. All findings have been verified from source code analysis, mapped to specific affected files/line numbers, and submitted as tracked issues to GitHub repository `erictheng93/gym`.

---

## Severity & Issue Tracking Summary

| Issue | Title | Severity | GitHub Issue |
| :--- | :--- | :--- | :--- |
| **SEC-01** | Hardcoded Directus admin session token committed to repository (`cookies.txt`) | **Critical** | [#1](https://github.com/erictheng93/gym/issues/1) |
| **SEC-02** | Missing authentication and tenant isolation on file upload/management endpoints (`/api/files`) | **High** | [#2](https://github.com/erictheng93/gym/issues/2) |
| **SEC-03** | Server-Side HTML injection and SSRF/LFI in Puppeteer PDF generation | **High** | [#3](https://github.com/erictheng93/gym/issues/3) |
| **SEC-04** | Webhook signature verification bypass in LINE Pay webhook handler | **High** | [#4](https://github.com/erictheng93/gym/issues/4) |
| **SEC-05** | Unauthenticated payment status information disclosure and contract underpayment flaw | **High** | [#5](https://github.com/erictheng93/gym/issues/5) |
| **SEC-06** | Cross-tenant IDOR vulnerabilities across core check-in, payment, and issue endpoints | **High** | [#6](https://github.com/erictheng93/gym/issues/6) |
| **SEC-07** | Insecure randomness (`Math.random`) and race condition in member OTP verification | **Medium** | [#7](https://github.com/erictheng93/gym/issues/7) |
| **SEC-08** | Overly permissive CORS with reflected origin and credentials enabled in Rust backend | **Medium** | [#8](https://github.com/erictheng93/gym/issues/8) |
| **SEC-09** | Hardcoded fallback JWT secrets and shared keys across member and coach services | **Medium** | [#9](https://github.com/erictheng93/gym/issues/9) |
| **SEC-10** | Formula injection vulnerability in CSV export functionality | **Low** | [#10](https://github.com/erictheng93/gym/issues/10) |

---

## Detailed Audit Findings

### 1. Hardcoded Directus admin session token committed to repository (`cookies.txt`)
- **Severity:** Critical (CVSS: 9.8)
- **Location:** `cookies.txt` (Line 5)
- **GitHub Issue:** [#1](https://github.com/erictheng93/gym/issues/1)
- **Impact:** Any entity reading the repository gains administrative credentials granting full access to the Directus admin interface and underlying databases.
- **Remediation:** Revoke session in Directus, rotate secrets, remove file from git history, and add to `.gitignore`.

### 2. Missing authentication and tenant isolation on file upload/management endpoints (`/api/files`)
- **Severity:** High (CVSS: 8.6)
- **Location:** `backend/src/routes/files.ts` (Lines 20, 132, 210, 259)
- **GitHub Issue:** [#2](https://github.com/erictheng93/gym/issues/2)
- **Impact:** Unauthenticated file uploads up to 50MB directly to Cloudflare R2 storage, potential storage exhaustion, arbitrary file deletion and modification.
- **Remediation:** Add `app.use('*', requireAuth)` and `app.use('*', requireTenant)` to `backend/src/routes/files.ts`.

### 3. Server-Side HTML injection and SSRF/LFI in Puppeteer PDF generation
- **Severity:** High (CVSS: 8.5)
- **Location:** `backend/src/services/pdf.ts` (Lines 148-164, 180-350, 640-645), `backend/src/routes/pdf.ts` (Lines 20-35)
- **GitHub Issue:** [#3](https://github.com/erictheng93/gym/issues/3)
- **Impact:** Unsanitized user inputs concatenated into raw HTML passed to Puppeteer running with `--no-sandbox` enables Server-Side XSS, Local File Inclusion (LFI), SSRF against internal cloud metadata, and cross-tenant contract PDF exfiltration.
- **Remediation:** HTML-escape all user inputs, restrict network requests in Puppeteer, and enforce tenant verification in PDF routes.

### 4. Webhook signature verification bypass in LINE Pay webhook handler
- **Severity:** High (CVSS: 8.2)
- **Location:** `backend/src/routes/payment-webhooks.ts` (Lines 235-241)
- **GitHub Issue:** [#4](https://github.com/erictheng93/gym/issues/4)
- **Impact:** Attackers omitting the `X-Line-Signature` header bypass verification entirely, allowing forged payment confirmation and refund notifications.
- **Remediation:** Ensure signature existence: `if (!signature || !verifyLinePayWebhook(signature, rawBody)) return c.json({ error: 'Invalid signature' }, 401);`.

### 5. Unauthenticated payment information disclosure and contract underpayment flaw
- **Severity:** High (CVSS: 7.5)
- **Location:** `backend/src/routes/payment-webhooks.ts` (Lines 49-60, 283-322)
- **GitHub Issue:** [#5](https://github.com/erictheng93/gym/issues/5)
- **Impact:** Public `/api/payments/webhook/:id/status` endpoint leaks member payment transactions without auth; Stripe webhook handler marks contracts active without checking received amount against contract total amount.
- **Remediation:** Protect status endpoint with authentication and tenant checks; compare `session.amount_total` against `contract.totalAmount`.

### 6. Cross-tenant IDOR vulnerabilities across core check-in, payment, and issue endpoints
- **Severity:** High (CVSS: 7.7)
- **Location:** `backend/src/routes/check-ins.ts` (Lines 136-140), `backend/src/routes/payments.ts` (Lines 310-318, 351-356), `backend/src/routes/member-issues.ts` (Lines 144-150)
- **GitHub Issue:** [#6](https://github.com/erictheng93/gym/issues/6)
- **Impact:** Multi-tenant isolation failure where staff can mutate or reference resources (members, contracts, branches) across tenant boundaries.
- **Remediation:** Scope all entity queries and mutations with `eq(table.tenantId, tenantId)`.

### 7. Insecure randomness (`Math.random`) and race condition in member OTP verification
- **Severity:** Medium (CVSS: 6.5)
- **Location:** `backend/src/routes/member-otp.ts` (Lines 82-84, 258-272)
- **GitHub Issue:** [#7](https://github.com/erictheng93/gym/issues/7)
- **Impact:** OTP prediction via PRNG state reconstruction; non-atomic attempt counter allows concurrent requests to bypass the 3-attempt limit.
- **Remediation:** Use `crypto.randomInt(100000, 1000000)` and atomic increment operations (`attempts = attempts + 1`).

### 8. Overly permissive CORS with reflected origin and credentials enabled in Rust backend
- **Severity:** Medium (CVSS: 6.5)
- **Location:** `rust-backend/src/main.rs` (Lines 66-68)
- **GitHub Issue:** [#8](https://github.com/erictheng93/gym/issues/8)
- **Impact:** Allows malicious third-party websites to perform authenticated cross-origin requests and read private API responses.
- **Remediation:** Replace `AllowOrigin::mirror_request()` with an explicit allowlist of authorized origins.

### 9. Hardcoded fallback JWT secrets and shared keys across member and coach services
- **Severity:** Medium (CVSS: 5.9)
- **Location:** `backend/src/services/member-jwt.ts` (Line 10), `backend/src/services/coach-jwt.ts` (Line 10), `hr-service/src/config/index.ts` (Line 24)
- **GitHub Issue:** [#9](https://github.com/erictheng93/gym/issues/9)
- **Impact:** Forged JWT authentication tokens if environment variables are not supplied.
- **Remediation:** Abort startup in production if secrets are missing or default; require distinct secrets for each service.

### 10. Formula injection vulnerability in CSV export functionality
- **Severity:** Low (CVSS: 3.8)
- **Location:** `backend/src/services/export.ts` (Lines 132-137)
- **GitHub Issue:** [#10](https://github.com/erictheng93/gym/issues/10)
- **Impact:** Malicious formulas beginning with `=`, `+`, `-`, `@` can execute DDE commands or trigger data exfiltration when exported CSVs are opened in spreadsheet software.
- **Remediation:** Sanitize formula prefixes or prefix with single quote `'`.
