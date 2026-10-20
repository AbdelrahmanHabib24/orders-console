---
description: Backend and database engineering rules for Express, Prisma ORM, PostgreSQL, idempotency, performance, authentication, and testing
trigger: glob
globs:
  - "backend/**/*"
  - "prisma/**/*"
  - "**/*.prisma"
  - "**/*.sql"
---

# Backend & Database Engineering Rules (Express, Prisma, PostgreSQL)

## 1. Technology Scope & Stack
- **Runtime & Framework:** Node.js, Express, TypeScript (`backend/src/**/*`).
- **Database:** Local PostgreSQL 17 running natively.
- **ORM & Migrations:** Prisma ORM (`prisma/schema.prisma`, migrations, seed scripts).
- **Communication:** Vite development proxy routes `/api/*` to Express. No CORS middleware on Express.

## 2. Layered Architecture & Separation of Concerns
- Maintain clean architectural boundaries:
  - **Routes / Controllers:** HTTP request handling, parameter extraction, response serialization, and status codes.
  - **Services:** Core business logic, Prisma queries, calculations, and transactional boundaries.
  - **Middleware:** Authentication verification, role-based authorization, request validation, and centralized error handling.
- Avoid unnecessary abstraction layers (no speculative repositories, factory classes, or DI containers over Prisma).
- Enforce strict TypeScript typing across all domain models and DTOs; never use `any`.
- Validate all incoming client data at system boundaries before executing business logic.

## 3. Database Integrity & Decimal Precision
- Enforce relational integrity, foreign keys, and cascading rules at the PostgreSQL schema level.
- **Monetary Amounts:** Use exact decimal arithmetic (`Prisma.Decimal` or integer minor units). Never use JavaScript floating-point numbers (`number`) for financial amounts.
- **Amount Validation Contract:**
  - Client sends `amount` along with line items (`quantity`, `unit_price`).
  - Backend recalculates `SUM(quantity * unit_price)` using exact decimal math.
  - If client `amount` does not match the recalculated sum, reject with HTTP 400 Bad Request.

## 4. Performance & High-Volume Scalability (50,000+ Orders)
- **Mandatory Server Pagination:** Orders listing must use `offset` and `limit` with a strict upper bound (`limit <= 50`). Never load entire tables into memory.
- **Substring Search Optimization:**
  - Support case-insensitive substring search (`ILIKE '%term%'`) on customer name and email.
  - Back substring searches with PostgreSQL `pg_trgm` GIN indexes (`CREATE EXTENSION IF NOT EXISTS pg_trgm;`).
  - Verify query execution plans using `EXPLAIN (ANALYZE, BUFFERS)` without promising fixed millisecond execution times.
- **High-Speed Batch Seeding:**
  - Seed script must generate 50,000+ orders with 1–5 line items per order and seed users (Admin & Agent).
  - Use high-speed batched insertions (`createMany` or raw chunked SQL) to complete seeding efficiently within reasonable time limits.

## 5. Idempotency & ACID Concurrency (Requirement R2)
- **Database-Enforced Uniqueness:** Rely on PostgreSQL `UNIQUE(idempotency_key)` on the `Order` table inside an ACID transaction (`prisma.$transaction`).
- **Atomic Order Creation:** Creating the order header, line items, and idempotency metadata must occur within one atomic database transaction.
- **Seed-Friendly Schema:** `idempotencyKey` and `requestHash` fields are nullable in the Prisma schema to allow historical seeded orders, but strictly required and non-null for API order creation (`POST /api/orders`).
- **Concurrency Resolution Protocol:**
  - A competing insert using the same unique key may wait for the first transaction to commit or roll back.
  - Upon a uniqueness violation (PostgreSQL error `23505` / Prisma error `P2002`), safely handle the failed transaction before querying the existing committed order:
    - If `requestHash` matches the existing order: return the existing order with HTTP 200/201 (idempotent replay).
    - If `requestHash` differs: reject with HTTP 422 Unprocessable Entity (conflicting payload for same key).
- **Automated Verification:**
  - Verify with a reproducible parallel request test script (`tests/idempotency.test.ts`) firing simultaneous `Promise.all` requests with identical `Idempotency-Key` headers.
  - Assert that exactly one order is persisted in the database for the test key.

## 6. Authentication, Authorization, & Security
- **Token Verification:** Use `jwt.verify(token, process.env.JWT_SECRET)` with strong error handling. Reject `jwt.decode`.
- **Header-Based Transport:** Read tokens strictly from the `Authorization: Bearer <token>` header. Reject tokens passed via query parameters or request bodies.
- **Password Security:** Hash all passwords using `bcrypt` with a minimum salt rounds factor of 10.
- **Token Expiration:** Enforce a finite token expiration window (`expiresIn: '8h'`).
- **Server-Side Role-Based Authorization (RBAC):**
  - Restrict `DELETE /api/orders/:id` to users with the `ADMIN` role.
  - Users with the `AGENT` role attempting deletion must receive HTTP 403 Forbidden.
- **Security Trade-Off Documentation:**
  - Document client-side storage trade-offs in `README.md`.
  - Clarify that manual bearer token attachment avoids automatic ambient credential transmission (CSRF), while noting that any JavaScript-accessible storage (`sessionStorage`) remains vulnerable to token theft if an XSS vulnerability exists.
