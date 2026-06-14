# ADR 0001 — Technology Stack

- **Status:** Accepted
- **Date:** 2026-06-14
- **Deciders:** BarReady core team
- **Context docs:** [Technical Charter](../TECHNICAL_CHARTER.md),
  [Architecture](../ARCHITECTURE.md), [Product Design Spec](../PRODUCT_DESIGN_SPEC.md)

## Context
We are starting BarReady from an empty repo and must commit to a stack that is
**production-grade but beta-realistic** (Beta Acceptance Criteria). The Technical
Charter set principles (TypeScript end-to-end, modular monolith, forward-only
migrations, async for heavy work, WCAG AA) and left specific tools open. This ADR
finalizes the concrete choices and the app-access strategy.

Key forces:
- Small team, beta timeline → favor one language, managed services, low ops.
- Learning engine + progress spine + licensing workflow are **core
  differentiation** → build custom, keep deterministic/testable.
- Must not preclude post-beta growth: MPRE, native apps, school/cohort accounts.
- Accessibility and security are launch blockers, not later work.

## Decision

| Concern | Choice | Notes |
| --- | --- | --- |
| Web frontend | **React + TypeScript + Vite**, TanStack Query, design-token component library | Typed contract shared with API; a11y baked into components |
| App / PWA | **Installable PWA for beta**; **Expo (React Native) post-beta** | Native wrapper considered only if store presence needed sooner |
| Backend / API | **Node.js + TypeScript**, layered routes→services→repositories, OpenAPI/typed client | Business logic in services, not handlers |
| Database | **PostgreSQL**, typed migrations (forward-only) | JSONB for item payloads; relational progress spine |
| Auth | **Own session auth (memory-hard KDF, rotating httpOnly tokens) + OAuth (Google/Apple)**, RBAC | Managed provider remains a fallback to accelerate beta |
| Payments | **Stripe** (Checkout + Billing + webhooks) | Entitlements map plans → course access |
| Content storage | **Postgres (text+metadata) + S3-compatible object store (media/PT files) + CDN** | Never blobs in Postgres |
| Analytics / events | **PostHog-style product analytics (self-host option) + internal typed event bus → Postgres rollups** | Learning analytics is first-party data, not third-party |
| Admin CMS | **Custom in-app authoring/review console** | Must enforce reviewer≠author + license-state machine |
| Testing | **Vitest/Jest (unit) + testcontainers Postgres (integration) + Playwright (E2E)**; coverage floor on engine/assessment | Deterministic, seedable engine logic |
| Deployment | **Containerized, immutable artifacts, local→staging→prod, managed Postgres, gated CI/CD**, structured logs + error tracking + metrics | Single-region beta, horizontally scalable API |

### App-access strategy (explicit)
- **Beta:** an **installable PWA** — web-app manifest, service worker, offline
  shell, cached read-only study (review/SRS) with idempotent mutation sync.
- **Post-beta:** an **Expo / React Native** app sharing the TypeScript domain
  layer; a thin native wrapper is an acceptable interim only if app-store
  presence is needed before the Expo build is ready. No native-only beta work.

## Alternatives considered
- **Python/Django or Go backend** — rejected for beta: loses end-to-end TS type
  sharing and a single talent pool; revisit only if a hotspot demands it.
- **Off-the-shelf headless CMS for content** — rejected: cannot structurally
  enforce the licensing state machine and reviewer≠author rule.
- **Serverless-first / microservices** — rejected for beta: premature operational
  complexity; the modular monolith preserves the option to extract later.
- **Native-first (React Native only)** — rejected for beta: slower to iterate,
  no install-free web trial; PWA reaches all personas immediately.
- **Build our own payments** — rejected: PCI/regulatory burden; Stripe is standard.

## Consequences
- **Positive:** one language end-to-end; fast iteration; managed services keep
  ops small; custom build only where it differentiates; clear native + B2B path.
- **Negative / risks:** modular-monolith discipline must be enforced in review
  (no cross-module SQL) or future extraction gets expensive; PWA offline scope
  must stay bounded to avoid sync bugs; self-hosting analytics adds some ops if
  chosen over SaaS.
- **Follow-ups:** future ADRs for the job-queue/worker choice, the typed
  data-access layer, and the analytics deployment (SaaS vs self-host) once
  implementation starts.

> Material future decisions are recorded as new ADRs in `docs/ADR/`.
