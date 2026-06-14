# Security & Privacy

Status: **Beta draft** · Owner: Engineering · Last reviewed: 2026-06-14

This document records BarReady's security posture and the privacy commitments
we make to beta users. It is the companion to `docs/TECHNICAL_CHARTER.md` §3
(Security) and the content rules in `docs/CONTENT_AND_LICENSING_POLICY.md`.
It is intentionally concrete: every control below maps to code in this repo, so
reviewers can verify claims rather than trust them.

---

## 1. Security posture

### 1.1 Authentication & sessions
- Passwords are hashed with **scrypt** (per-user random salt) in
  `api/src/auth/password.ts`. Plaintext passwords are never stored or logged.
- Sessions are opaque random tokens delivered in an **httpOnly**, `SameSite`,
  `Secure`-in-production cookie (`br_session`). Only a **hash** of the token is
  stored server-side (`sessions` table), so a database read cannot reidentify a
  live session. See `api/src/auth/session.ts` and `api/src/auth/cookies.ts`.
- Login uses a constant-shape verification path to reduce user-enumeration
  timing leaks (`api/src/routes/auth.ts`): a hash comparison runs whether or not
  the email exists, and the error is the same generic `invalid_credentials`.
- Logout destroys the server-side session and clears the cookie.

### 1.2 Authorization (deny-by-default)
- Every protected route is guarded by `requireAuth` / `requireRole`
  (`api/src/auth/guards.ts`); absence of a guard means no access, not open
  access.
- Data access is **ownership-scoped**: user-owned queries filter by
  `userId` (e.g. account export, attempts, submissions). Admin/instructor
  surfaces require an explicit role.
- The content engine serves only `license_status = 'cleared'` items; clearing
  is a structural gate set solely by the `publish` transition (approved +
  complete metadata + reviewer ≠ author). See
  `docs/CONTENT_AND_LICENSING_POLICY.md`.

### 1.3 Input validation
- All request bodies/params are parsed with **Zod** schemas at the route
  boundary; invalid input yields a `400` before any handler logic runs.
- Database access is exclusively through **Drizzle ORM** parameterized
  queries — no string-concatenated SQL anywhere in the codebase.

### 1.4 Transport & HTTP hardening
- **`@fastify/helmet`** is registered first in the middleware chain
  (`api/src/app.ts`), setting `X-Content-Type-Options: nosniff`,
  `X-Frame-Options`, `Referrer-Policy`, HSTS, and related headers. CSP is
  disabled at the API tier because it serves only JSON; the browser PWA owns its
  own CSP at the static-hosting layer.
- **CORS** is allow-listed from validated env (`CORS_ORIGINS`) with
  `credentials: true` so only known origins may send the session cookie.

### 1.5 Brute-force throttling
- `/auth/login` and `/auth/signup` are protected by an in-memory fixed-window
  rate limiter (`api/src/auth/rateLimit.ts`), keyed by client IP + route,
  returning `429 rate_limited` with a `Retry-After` header when exceeded.
- Default: **20 attempts / IP / minute** in production; disabled under test so
  suites can hammer endpoints, with a dedicated test that sets a low cap to
  exercise the limiter.
- **Beta limitation:** the window is per-process and in-memory. Behind multiple
  instances it throttles per-instance, not globally. The post-beta upgrade is a
  shared store (Redis); tracked as a known limitation, not a blocker at beta
  scale.

### 1.6 Secrets management
- No secrets are committed. `.env` is gitignored; `.env.example` documents every
  variable with **blank** sensitive values.
- `STRIPE_SECRET_KEY` is **optional**. When blank, billing runs in a safe
  **stub** provider; the live Stripe provider is selected only when a real key
  is supplied at runtime (`api/src/services/billing/*`). This makes "ship
  without a payment secret" the default, safe path.
- Logs **redact** `authorization` and `cookie` request headers (`api/src/app.ts`
  logger config).

### 1.7 OWASP Top 10 — quick mapping
| Risk | Control |
| --- | --- |
| Broken access control | deny-by-default guards; ownership-scoped queries |
| Cryptographic failures | scrypt password hashing; hashed session tokens; httpOnly/Secure cookies |
| Injection | Zod boundary validation; Drizzle parameterized queries only |
| Insecure design | content `cleared` gate enforced structurally; forward-only reviewed migrations |
| Security misconfiguration | helmet defaults; CORS allow-list; secrets out of VCS |
| Vulnerable components | dependency scan in CI; deliberate dependency additions |
| Auth failures | rate limiting; generic auth errors; server-side session invalidation |
| Integrity failures | reviewed migrations; reviewer ≠ author publish rule |
| Logging failures | header redaction; structured logs (no secrets/PII in messages) |
| SSRF | no user-controlled outbound fetch in the API surface |

---

## 2. Privacy policy (beta draft)

> This is a plain-language draft for the invite-only beta. It is not yet legal
> copy; a lawyer reviews before any public launch.

### 2.1 Who we are
BarReady is an adaptive bar-exam prep platform. For beta we operate invite-only
with a limited cohort.

### 2.2 What we collect
- **Account:** email, hashed password, beta-access flag, roles.
- **Profile:** display name, target exam date, weekly study-time budget,
  notification preferences.
- **Learning performance:** question attempts, essay submissions, performance-
  test submissions, spaced-repetition reviews, error-journal entries, and the
  derived plan/readiness signals computed from them.
- **Operational:** standard server logs (with auth/cookie headers redacted).

We do **not** collect payment card data directly; when billing is enabled it is
handled by the payment provider (Stripe), not stored by us.

### 2.3 Why we use it
- To run the core loop: diagnose weaknesses, drive a personalized plan, and
  report **honest** readiness (gated on coverage and recency — we never inflate
  a score).
- To operate, secure, and debug the service.
- To send the notifications a user has opted into.

We do not sell personal data and do not use it for third-party advertising.

### 2.4 Your rights
- **Access / portability:** `GET /account/export` returns a complete JSON export
  of your account plus all learning-performance data
  (`api/src/services/account.ts → exportAccount`).
- **Deletion:** `DELETE /account` (requires explicit `{ "confirm": true }`)
  permanently deletes the account and all owned rows via database cascade, and
  clears the session cookie (`deleteAccount`). This is irreversible.
- **Correction:** profile fields are editable via `PATCH /account/profile`.

### 2.5 Retention
Personal and performance data is retained for the life of the account. On
deletion it is removed promptly via cascading delete. Backups age out on the
infrastructure provider's standard cycle.

### 2.6 Sharing
Limited to infrastructure sub-processors needed to run the service (hosting,
database, email, and — if enabled — the payment provider). No other sharing.

### 2.7 Contact
Privacy questions for the beta: the operator contact in the beta invite.

---

## 3. Verification

The controls above are exercised by automated tests, notably:
- `api/test/security.test.ts` — hardening headers present; auth rate limiting
  returns `429` after the cap; data export returns the user's own data; account
  deletion requires confirmation and removes the user row.
- Auth, ownership, and content-gating tests across the `api/test` suite.

Run the full quality gate (lint + typecheck + tests + build) before merge; CI
must be green.

---

## 4. Known limitations (beta) & post-beta hardening
- Rate limiting is per-process/in-memory → move to a shared store (Redis).
- Add CSP + Subresource Integrity at the PWA hosting layer.
- Add audit logging for admin/CMS content-state transitions.
- Add automated data-retention expiry and configurable retention windows.
- Formal third-party security review and a published, lawyer-reviewed privacy
  policy before any public (non-invite) launch.
