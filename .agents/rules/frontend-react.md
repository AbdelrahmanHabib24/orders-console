---
description: Frontend engineering rules for React 18, TypeScript, Tailwind CSS, Native Fetch, and rapid-filter race condition protection
trigger: glob
globs:
  - "frontend/**/*"
---

# Frontend Engineering Rules (React, TypeScript, Tailwind, Native Fetch)

## 1. Technology Scope & Stack
- **Framework:** React 18 with Vite and TypeScript (`frontend/src/**/*`).
- **Styling:** Tailwind CSS utility classes. Avoid inline styles and external UI component libraries.
- **HTTP Client:** Native `fetch` API exclusively. No Axios or external data-fetching wrappers.
- **State Management:** Native React state (`useState`, `useReducer`, custom hooks). No Redux, Zustand, or React Query.

## 2. Rapid-Filter Race Condition Protection (Requirement R1)
- **Sequence Counter Guarantee:** Use a lightweight request sequence counter stored in `useRef` as the primary correctness mechanism for rapid search/filtering:
  ```typescript
  const requestSeq = useRef(0);
  ```
- Increment the sequence counter before initiating each fetch request.
- When a response resolves, compare its captured sequence ID against `requestSeq.current`.
- If the response's sequence ID does not match `requestSeq.current`, silently discard the response and do NOT update React state.
- An `AbortController` may be used for network hygiene to cancel obsolete in-flight requests, but the `useRef` sequence counter remains the mandatory correctness check.

## 3. UI States & Data Integrity
- Prevent contradictory UI states: never display stale success data alongside an active error banner.
- Synchronously clear previous data or transition to an explicit error state when a request fails:
  ```typescript
  .catch((err) => {
    setData(null);
    setError(err.message);
  });
  ```
- Explicitly handle four distinct UI states in all data views:
  1. **Loading:** Accessible spinner or skeleton loader.
  2. **Error:** Clear, user-friendly error message with retry capability.
  3. **Success:** Rendered tabular or grid data.
  4. **Empty:** Informative empty state message when queries return 0 results.

## 4. Enterprise Visual Aesthetics & Responsive Layout
- Use a restrained, professional enterprise palette (Tailwind Slate, Indigo, Emerald, Rose).
- Establish clear visual hierarchy, consistent padding/spacing scales, and responsive layout verified across mobile (375px), tablet (768px), and desktop (1280px) viewports without horizontal page overflow.
- Keep table overflowing contained inside dedicated horizontal scroll wrappers (`overflow-x-auto`) rather than spilling into document scroll.
- Eliminate developer-facing sprint labels, internal status tags, or informal debugging text from user-facing screens.

## 5. Accessibility (a11y) & Semantic HTML
- Use semantic HTML5 elements: `<header>`, `<main>`, `<section>`, `<nav>`, `<table>`, `<button>`.
- Use accessible ARIA attributes for dynamic regions:
  - `role="status"` and `aria-live="polite"` for non-disruptive status updates.
  - `role="alert"` for error banners requiring immediate user attention.
- Ensure all interactive elements have visible focus rings, keyboard navigability (Tab/Enter/Space), and adequate contrast ratios (WCAG AA).
- Maintain user-intent modal dismissal (explicit Close/Cancel triggers) without unintended background event interference.

## 6. Client-Side Authentication & Session Management
- **HttpOnly Cookie Authentication:** Authenticate exclusively through the `auth_token` HttpOnly cookie managed securely by the browser.
- **No Client-Side Token Storage:** Never store JWTs in `localStorage`, `sessionStorage`, or JavaScript memory. The frontend must never expect, read, or process a JWT in login response bodies.
- **No Bearer Headers:** Do not send or attach `Authorization: Bearer` headers. All authentication relies strictly on browser cookies.
- **Credentialed Requests:** Send all authenticated requests and session checks using native `fetch` with `credentials: 'include'` (supported by Vite proxy and backend CORS/Origin policy).
- **Session Hydration & Verification:** Restore session state on application mount by calling `GET /api/auth/me`. If the request fails or returns 401, transition cleanly to the unauthenticated view.
- **Clean Logout:** Provide a clean logout mechanism that calls `POST /api/auth/logout` to clear the HttpOnly cookie on the server, then immediately resets all authenticated application state in React.
