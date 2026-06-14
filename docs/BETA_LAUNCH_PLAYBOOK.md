# Beta Launch Playbook

Status: **Ready** · Owner: Engineering · Last updated: 2026-06-14

The concrete runbook for taking BarReady to invite-only beta and backing out if
needed. Pair with `docs/DEPLOYMENT.md` (how to deploy) and
`docs/POST_BETA_BACKLOG.md` (what’s intentionally deferred).

Beta scope reminder: invite-only, UBE/California, MBE-only + Essay-only, core
loop, original/licensed content. (`docs/BETA_ACCEPTANCE_CRITERIA.md`.)

---

## 1. Go / no-go gates (must all be ✅)

| Gate | Check |
| --- | --- |
| CI green | `pnpm check` + `pnpm build` pass on the release commit |
| Migrations | All forward migrations apply cleanly to a fresh DB; none edited after apply |
| Licensing | Only `cleared` content is student-visible; all seeded content is `original` (enforced + tested) |
| Security | Helmet headers, auth rate limiting, hashed sessions, deny-by-default authz all in place (`SECURITY_AND_PRIVACY.md`) |
| Privacy | Data export + account deletion work; beta privacy draft published to testers |
| Secrets | No secrets in VCS; `DATABASE_URL` from host; `STRIPE_SECRET_KEY` blank (stub billing) |
| Beta access | Invite-only enforced (`beta_access` gate); invites generated |
| No blockers | No open critical/high issues (`BETA_BUG_BASH_REPORT.md`) |

If any gate is ❌ → **no-go**; fix and re-run.

---

## 2. Pre-launch checklist (T-1 day)

- [ ] Tag the release commit (e.g. `beta-YYYYMMDD`) on `main`.
- [ ] Provision Render Blueprint (`render.yaml`): DB + API + web.
- [ ] Set secrets: `CORS_ORIGINS` (= web URL), `VITE_API_BASE_URL` (= API URL),
      `STRIPE_SECRET_KEY` left **blank**.
- [ ] Confirm `DATABASE_URL` is wired from the managed DB (not hand-set).
- [ ] Run migrations against the production DB (automatic via `preDeployCommand`).
- [ ] Seed beta/demo content if the cohort should see it: `pnpm db:seed:demo`
      (run **once**, fresh DB).
- [ ] Generate and record beta invite codes; prepare the invite email.
- [ ] Verify backups are enabled on the managed DB (see §5).
- [ ] Configure uptime check on `…/health` and the web URL; set alert recipients.
- [ ] Dry-run the smoke test (§4) on a staging deploy.

---

## 3. Launch day (T-0)

1. [ ] Deploy the tagged release (push/`autoDeploy` or manual deploy in Render).
2. [ ] Watch the deploy: build → **migrations** → start; health check goes green.
3. [ ] Run the **smoke test** (§4). Abort + rollback (§6) on any failure.
4. [ ] Send invites to the first small wave (e.g. 5–10 testers), not the whole list.
5. [ ] Monitor for 60–90 min: error rate, latency, DB connections, logs.
6. [ ] If healthy, send the remaining invites in waves.
7. [ ] Post launch status to the team channel; note the release tag + DB backup id.

---

## 4. Smoke test (core journey)

Run against production right after deploy:
- [ ] `GET /health` → `{"status":"ok"}`.
- [ ] Web landing loads; PWA installable.
- [ ] Sign up / log in (a real invited tester or a demo persona).
- [ ] Onboarding saves; dashboard renders readiness + daily plan.
- [ ] Answer one practice question end-to-end (confidence → answer → review).
- [ ] Take the diagnostic’s MBE section to results.
- [ ] Submit one essay; review one flashcard.
- [ ] Admin: log in, see CMS + cohort analytics; student is denied admin routes (403).

A failure in signup/login, dashboard, or practice = **stop-ship**; roll back.

---

## 5. Backups & data safety
- [ ] Managed Postgres automated backups enabled (Render daily snapshots +
      point-in-time where available).
- [ ] **Capture a manual snapshot immediately before each deploy** that includes
      a migration — this is the restore point for rollback.
- [ ] Record the snapshot id / timestamp in the launch notes.
- [ ] Periodically test restore into a scratch database (post-beta cadence).

---

## 6. Rollback plan

Decide fast: if the smoke test fails or error rate/latency spikes shortly after
launch, **roll back rather than debug in production.**

### A. Application rollback (no schema change in this deploy)
1. In Render → `barready-api` → **Rollback** to the previous deploy (and
   `barready-web` likewise). Render keeps prior builds.
2. Re-run the smoke test (§4) on the restored version.
3. Pause new invites; post status.
> Fastest path. Forward-only, additive migrations are backward-compatible, so an
> app-only rollback is usually safe even if a migration ran.

### B. Rollback **with** an incompatible migration
1. App-rollback as in A.
2. If the new migration broke the old app: **restore the DB** from the
   pre-deploy snapshot (§5) into the database, then point the rolled-back API at
   it. Accept the data delta since the snapshot (small at beta scale; testers
   notified).
3. Author a **new forward migration** to correct the schema — never edit or
   “down” an applied migration.

### C. Full stop (kill switch)
- If a security/licensing incident is suspected: scale the web + API services to
  zero (or disable the services) to take the app offline, rotate any exposed
  secret, then investigate. Communicate downtime to testers.

### Rollback triggers (any one)
- Smoke test fails on a core flow (signup/login, dashboard, practice).
- Sustained API 5xx or health-check failures after traffic shift.
- Data-integrity or licensing/security concern (un-cleared content served, data
  leak, auth bypass).

### After any rollback
- [ ] Confirm health + smoke green on the restored version.
- [ ] Write a short incident note (what, when, blast radius, fix-forward plan).
- [ ] Add a regression test before re-attempting the deploy.

---

## 7. Roles & comms
- **Release driver:** runs the deploy, smoke test, and the rollback decision.
- **On-call:** watches logs/metrics for the first 90 min and the first 24 h.
- **Comms:** sends invites in waves; notifies testers of any downtime/rollback.

## 8. Post-launch (first week)
- [ ] Daily: error rate, latency, DB health, new sign-ups, any tester reports.
- [ ] Triage feedback into the backlog; hot-fix only true blockers.
- [ ] Confirm honest-readiness/coverage gating looks sane on real data.
- [ ] Review `POST_BETA_BACKLOG.md`; schedule the first hardening items
      (SEC-5, MOB-1) ahead of any public launch.
