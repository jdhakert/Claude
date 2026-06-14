# Mobile & App Strategy

Status: **Beta** · Owner: Engineering · Last reviewed: 2026-06-14

How BarReady reaches students on phones now, and the path to native apps later.
The guiding principle matches ADR 0001: **one product, one API, progressive
enhancement** — ship an installable web app for beta, keep the door open to
native without a rewrite.

---

## 1. Beta approach — installable PWA

For beta we ship a single React + Vite **Progressive Web App**. It is the same
codebase students use in a desktop browser, hardened to feel app-like on a
phone.

What's in place (Phase 7 + Phase 20):
- **Installable**: web app manifest with name, theme/background color,
  `display: standalone`, scope, maskable icon, app shortcuts (Dashboard /
  Practice / Review), and `categories`. Chromium fires `beforeinstallprompt`
  (we offer one-tap install); iOS Safari gets explicit "Share → Add to Home
  Screen" guidance (`InstallPrompt`).
- **Offline-tolerant**: a service worker (vite-plugin-pwa / Workbox) precaches
  the app shell, serves it `NetworkFirst` for navigations, `StaleWhileRevalidate`
  for scripts/styles, and `CacheFirst` (bounded, expiring) for media. API/auth/
  health paths are denylisted from the navigation fallback so we never serve a
  stale shell for a data call or cache a mutation. An `offline.html` fallback
  and an in-app offline banner explain the state.
- **Mobile-first layout**: a bottom tab bar replaces the sidebar under 768px;
  content max-widths and auto-fit grids reflow to one column; the PT split-pane
  stacks.
- **Touch & viewport hardening**: ≥44px tap targets on buttons, nav cells, and
  practice/exam choice rows; 16px form fields (prevents iOS focus-zoom);
  `viewport-fit=cover` with `env(safe-area-inset-*)` padding for notch/home-
  indicator; `100dvh` shell to avoid URL-bar jump; `touch-action: manipulation`
  and no tap-highlight flash. Pinch-zoom stays enabled (WCAG 1.4.4).
- **Wide content**: analytics tables scroll horizontally instead of breaking
  the layout.

**Why PWA for beta:** zero app-store review latency, one codebase to iterate,
instant updates, and no native build/release pipeline to staff while the core
learning loop is still moving. See "Beta scope" in `CLAUDE.md`.

### Icons
Placeholder SVG icons (`public/icon.svg`, `public/icon-maskable.svg`) ship now.
Before any store submission they must be replaced with a designed icon set
exported to PNG at 192/512 (plus maskable safe-zone and iOS sizes). Tracked as
a pre-launch asset task, not a code blocker.

---

## 2. Later path — Expo / React Native

When native is justified (see triggers below), the plan is **Expo + React
Native**, not a second web rewrite:

- **Shared core, native shell.** The learning engine, assessment scoring,
  adaptive scheduling, and all business rules already live server-side behind
  the HTTP API; the client is a thin view layer. A native app re-implements
  presentation against the **same API contract** — no second source of truth.
- **Reusable TypeScript.** API client types (`api/types.ts`), validation
  schemas, and pure formatting/util logic are portable to RN. UI components are
  not (DOM vs native primitives) and are rebuilt with RN equivalents.
- **Expo** gives us OTA updates, a managed build/submit pipeline (EAS), and
  push notifications (study reminders, exam countdown) with far less native
  plumbing than bare RN.
- **Auth** moves from cookie-based sessions to a token flow suited to native
  (secure storage), an additive change to the existing session service.

This is deliberately deferred: it is **out of beta scope** (`CLAUDE.md` /
`BETA_ACCEPTANCE_CRITERIA.md`).

---

## 3. Shared API / data layer

The contract that makes "PWA now, native later" cheap:

- **Single API** (`/api/...`) is the only source of truth for content
  (cleared-only gating), performance data, plans, and readiness.
- **Typed boundary**: request/response types are shared TS; clients never
  re-derive scoring or scheduling locally.
- **Deny-by-default authz** server-side means a new client surface inherits the
  same access rules for free.
- **Offline writes**: beta treats the network as required for mutations (attempt
  submissions, grading). A future offline-queue (outbox) for practice answers is
  an additive client concern; the server stays authoritative and idempotent-
  friendly. Not in beta.

---

## 4. Features unsuitable for small screens

Supported on phones but **better elsewhere**, with explicit in-app guidance:

- **Full-length timed exams.** Supported on mobile, but `MobileExamNotice`
  recommends desktop/tablet — more reading room and fewer mis-taps under time
  pressure, closer to real test conditions.
- **Performance Tests (MPT/PT).** The two-pane file/library + answer workspace
  is genuinely cramped on a phone; it stacks vertically but reads best on a
  tablet or larger.
- **Long essay composition.** Writable on a phone, but extended timed writing
  favors a physical keyboard; we surface the timer and autosave so a phone is a
  safe fallback, not the recommended default.
- **Admin CMS / authoring / instructor analytics.** Desktop-oriented; dense
  tables and multi-field forms. Functional on mobile, not optimized, and out of
  the core student mobile path.

Well-suited to phones (and the focus of mobile polish): dashboard, daily plan,
lessons, **MBE practice questions**, **flashcards / spaced repetition**, rule
drills, and progress at-a-glance.

---

## 5. App Store / Play Store roadmap

Phased, gated on demand and the native investment being warranted:

1. **Beta (now):** PWA only. Installable from the browser; no store presence.
2. **Listed PWA (optional, low cost):** submit the PWA to **Google Play** via a
   Trusted Web Activity (Bubblewrap/PWABuilder) once icons/splash are finalized.
   Apple does not accept wrapped PWAs, so iOS stays "Add to Home Screen" until
   step 3.
3. **Native (Expo/EAS):** when triggers below are met — build the RN app,
   wire push notifications and secure-store auth, and submit to **both**
   App Store and Play Store via EAS Submit. Establish review, privacy-nutrition/
   data-safety disclosures, and release channels.
4. **Parity & OTA:** keep web and native at feature parity against the shared
   API; ship JS-layer fixes via Expo OTA between store releases.

**Triggers to start native:** sustained mobile usage share, demand for reliable
push reminders, offline practice as a top request, or a store presence needed
for distribution/credibility. Until then, the PWA is the lowest-risk way to be
"app-quality" on a phone.

---

## 6. Verification
- `client/test/Mobile.test.tsx` — exam desktop-recommendation appears at phone
  width and not at desktop width; iOS install guidance renders and dismissal
  persists; a flashcard flips and records a rating at phone width.
- Manual: install flow on Chrome (Android) and Safari (iOS), bottom-nav reflow,
  safe-area padding on a notched device, offline reload serving the shell.
