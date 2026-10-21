# Architectural Decision Records (ADRs)

## Decision 1: HttpOnly Cookie Authentication with Origin Validation

- **Chosen Approach:** Store the session JWT in an `HttpOnly`, `SameSite=Strict` browser cookie, verified by server-side Origin validation on state-changing requests.
- **Alternative Considered:** Store the JWT in browser `localStorage` or `sessionStorage` and transmit it via `Authorization: Bearer` headers.
- **Trade-offs & Rationale:** Client-accessible storage exposes authentication tokens to theft if an XSS vulnerability exists in the frontend application.
- Cookie-based authentication requires CSRF mitigations; combining `SameSite=Strict` with strict Origin validation helps defend against cross-site forged requests.
- The bearer-token alternative was rejected because preventing client-side script token exfiltration is an important security baseline for administrative consoles.

## Decision 2: Database-Enforced Composite Uniqueness for R2 Idempotency

- **Chosen Approach:** Enforce order-creation idempotency with a PostgreSQL composite unique constraint `(user_id, idempotency_key)` and SHA-256 payload verification in a Prisma transaction.
- **Alternative Considered:** Pre-check an external Redis cache with distributed TTL-based locks before creating the order in the database.
- **Trade-offs & Rationale:** Distributed caches introduce operational overhead, network failure modes, and edge cases if locks expire before database commits complete.
- A database-level unique constraint supports ACID transaction guarantees and deterministic deduplication under concurrent requests.
- Redis was rejected to avoid external infrastructure when PostgreSQL can enforce uniqueness for this use case.

## Decision 3: Component-Level Sequence Counter for Stale-Response Protection (R1)

- **Chosen Approach:** Protect against out-of-order asynchronous responses during rapid filter typing with an incrementing sequence counter stored in React `useRef(0)`.
- **Alternative Considered:** Integrate a server-state library such as TanStack Query or enforce mandatory input debouncing.
- **Trade-offs & Rationale:** An external caching library adds dependencies and configuration complexity for this console's current needs.
- Mandatory debouncing adds latency to input response and is not necessary to ensure stale responses are ignored.
- The sequence-counter approach ensures that only the latest initiated request can update the relevant state, without adding a dependency or typing delay.

## AI Assistance Disclosure

This project was developed with architectural, refactoring, and code-review assistance from Antigravity AI (powered by Google DeepMind models). AI tooling was used for test-case authoring (including concurrency and test-database guard suites), analysis of Prisma transaction rollback edge cases, evaluation of database indexing strategies such as `pg_trgm` GIN indexes, and review of UI component modularity. The resulting code and architectural choices were reviewed and verified through automated tests by the author.
