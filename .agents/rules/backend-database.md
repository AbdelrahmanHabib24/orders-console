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
- **ORM & Migrations:** Prisma ORM (`backend/prisma/schema.prisma`, migrations, seed scripts).
- **Communication:** Vite development proxy routes `/api/*` to Express. Origin validation middleware protects cross-origin requests.

## 2. Layered Architecture & Separation of Concerns
- Maintain clean architectural boundaries:
  - **Routes / Controllers:** HTTP request handling, parameter extraction, response serialization, and status codes (`backend/src/routes/`).
  - **Services:** Core business logic, Prisma queries, calculations, and transactional boundaries (`backend/src/services/`).
  - **Middleware:** Authentication verification, role-based authorization, request validation, and centralized error handling (`backend/src/middleware/`).
- Avoid unnecessary abstraction layers (no speculative repositories, factory classes, or DI containers over Prisma).
- Enforce strict TypeScript typing across all domain models and DTOs; never use `any`.
- Validate all incoming client data at system boundaries using Zod schemas (`backend/src/schemas/`) before executing business logic.

## 3. Database Integrity & Decimal Precision
- Enforce relational integrity, foreign keys, and cascading rules at the PostgreSQL schema level.
- **Monetary Amounts:** Use exact decimal arithmetic (`Prisma.Decimal` or integer minor units/cents). In the database schema, store financial amounts using `Decimal @db.Decimal(10, 2)` (e.g., `Order.amount`, `OrderItem.unitPrice`). Never use JavaScript floating-point arithmetic for financial calculations.
- **Amount Validation Contract:**
  - Client sends `amount` along with line items (`quantity`, `unitPrice`).
  - Backend recalculates total amount in integer minor units (cents) via `Math.round(item.unitPrice * 100) * item.quantity`.
  - If the client's submitted `amount` in cents does not strictly match the recalculated sum, reject the request with HTTP 400 Bad Request.

## 4. Performance & High-Volume Scalability (50,000+ Orders)
- **Mandatory Server Pagination:** Orders listing must use `skip` and `take` with a strict upper bound (`limit <= 50`, default `20`). Never load entire tables into memory.
- **Substring Search Optimization:**
  - Support case-insensitive substring search on customer name and email.
  - Back substring searches with PostgreSQL `pg_trgm` GIN indexes (`CREATE EXTENSION IF NOT EXISTS pg_trgm;`).
  - Verify query execution plans using `EXPLAIN (ANALYZE, BUFFERS)` without promising fixed millisecond execution times.
- **High-Speed Batch Seeding:**
  - Seed script must generate 50,000+ orders with 1-5 line items per order and seed users (Admin & Agent).
  - Use high-speed batched insertions (`createMany` or raw chunked SQL) to complete seeding efficiently within reasonable time limits.

## 5. Idempotency & ACID Concurrency (Requirement R2)
- **Composite Unique Constraint:** Rely on PostgreSQL composite uniqueness `(user_id, idempotency_key)` (`@@unique([userId, idempotencyKey])` in Prisma) on the `Order` table inside an ACID transaction (`prisma.$transaction`).
- **Canonical SHA-256 Payload Hash:** Compute a SHA-256 hash of the normalized request payload (`customerName`, `customerEmail`, `amount`, and line items) and store it in `requestHash` alongside `idempotencyKey`.
- **Atomic Order Creation:** Creating the order header, line items, and idempotency metadata must occur within one atomic database transaction.
- **Seed-Friendly Schema:** `idempotencyKey` and `requestHash` fields are nullable in the Prisma schema to allow historical seeded orders, but strictly required and validated for API order creation (`POST /api/orders`).
- **Concurrency Resolution Protocol:**
  - When concurrent parallel requests submit the same idempotency key for the same user, exactly one transaction commits while competing inserts encounter a uniqueness violation (PostgreSQL error `23505` / Prisma error `P2002`).
  - Upon a uniqueness conflict, query the existing committed order for that `(userId, idempotencyKey)`:
    - If `requestHash` matches the existing order: return the existing order with HTTP 200 OK (idempotent replay).
    - If `requestHash` differs: reject with HTTP 422 Unprocessable Entity (conflicting payload for same key).
  - Newly created orders return HTTP 201 Created.
- **Automated Verification:**
  - Verify with the isolated integration test suite in `backend/tests/integration/orderCreate.test.ts` firing 8 simultaneous parallel requests with identical `Idempotency-Key` headers.
  - Assert that exactly one order is persisted in the database for the key and all parallel requests resolve successfully to the same order ID.

## 6. Authentication, Authorization, & Security
- **Cookie-Based JWT Verification:** Read authentication tokens strictly from the `auth_token` HttpOnly cookie (`req.cookies.auth_token`). Never accept tokens from request bodies, query parameters, or `Authorization: Bearer` headers.
- **Cryptographic Verification:** Use `jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] })` with strong error handling. Reject `jwt.decode`. Enforce at least 32 characters for `JWT_SECRET`.
- **Cookie Configuration:** Set `auth_token` with `httpOnly: true`, `sameSite: 'strict'`, `path: '/'`, and `secure: true` in production (`false` in local development). Never return the JWT in login response JSON.
- **Origin Validation:** Reject all state-changing requests (`POST`, `PUT`, `DELETE`, `PATCH`) missing an Origin header or originating from an untrusted Origin with HTTP 403 Forbidden via `originGuard.ts`.
- **Password Security:** Hash all passwords using `bcrypt` with a minimum salt rounds factor of 10.
- **Token Expiration:** Enforce a finite token expiration window (`expiresIn: '8h'`).
- **Server-Side Role-Based Authorization (RBAC):**
  - Restrict `DELETE /api/orders/:id` to users with the `ADMIN` role.
  - Users with the `AGENT` role attempting deletion must receive HTTP 403 Forbidden.
- **Security Trade-Off Documentation:**
  - Document the HttpOnly cookie and stateless JWT trade-offs in `README.md` and `DECISIONS.md`.
  - Clarify that HttpOnly cookies eliminate token theft via XSS, while `SameSite=Strict` and server-side Origin validation protect against CSRF attacks. Note that stateless JWT logout clears the cookie from the browser but does not maintain a server-side revocation list.

## 7. Test Suite Structure & Database Safety Guards
- **Test File Organization:** All tests must reside in `backend/tests/` using the native Node.js test runner (`node:test`) and `tsx`:
  - `backend/tests/checkTestEnv.ts`: Pre-test safety guard refusing execution if `NODE_ENV === 'production'`.
  - `backend/tests/integration/orderCreate.test.ts`: R2 creation, replay, payload mismatch, and concurrency deduplication tests.
  - `backend/tests/integration/orderDelete.test.ts`: Acceptance criterion test verifying Agent deletion returns 403.
  - `backend/tests/integration/ordersList.test.ts`: R1 listing, pagination boundaries, search, and sorting tests.
  - `backend/tests/integration/testDbGuard.integration.test.ts`: Live database identity and test isolation verification.
  - `backend/tests/unit/testDbGuard.unit.test.ts`: Offline URL parsing and database name safety checks.
- **Fail-Closed Test Database Isolation:**
  - All integration tests must execute exclusively against `TEST_DATABASE_URL` via `getTestPrismaClient()` from `backend/src/testDbGuard.ts`.
  - The guard enforces that the test database name ends with `_test` and does not match `DATABASE_URL`.
  - Integration tests must NEVER write to, modify, or truncate the application database (`orders_console`).
  - Serial execution (`--test-concurrency=1`) must be enforced for integration tests to prevent inter-suite database race conditions.
