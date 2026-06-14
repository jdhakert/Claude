# CLAUDE.md

Persistent guidance for coding sessions on **BarReady** — an adaptive,
content-licensed bar exam prep platform. Read the `docs/` set before building;
this file is the short version.

## What this is
- Product: diagnose a student's weaknesses → drive a personalized daily study
  plan → measure honest readiness to pass the bar.
- Source of truth: `docs/PRODUCT_BRIEF.md`, `docs/TECHNICAL_CHARTER.md`,
  `docs/LEARNING_SYSTEM.md`, `docs/CONTENT_AND_LICENSING_POLICY.md`,
  `docs/BETA_ACCEPTANCE_CRITERIA.md`. If code and docs disagree, fix one in the
  same PR — don't silently diverge.

## Non-negotiables
1. **Licensing is a launch blocker.** Never scrape or copy protected bar
   content. All content is original, licensed, public-domain, or user-supplied
   with rights. Every item tracks `source`, `license_status`, `jurisdiction`,
   `subject`, `subtopic`, `author`, `reviewer`, `version`. The engine serves
   only `cleared` items — enforce this structurally, not by convention.
2. **Adaptivity is the product.** Plans recompute from real performance; a
   static calendar is a defect.
3. **Honest readiness.** Never inflate a readiness score to comfort a user;
   gate it on coverage and recency.
4. **Course-agnostic core.** Treat `course/subject/subtopic/issue/item_type/
   jurisdiction` as data. Adding **MPRE** later must need no schema migration.

## Engineering rules
- TypeScript strict end-to-end; no implicit/unsafe `any`. Logic in
  services/repositories, not in controllers or React components.
- Learning-engine + assessment logic must be unit-tested and
  **deterministic/seedable** — it's the product, not shippable untested.
- Security: deny-by-default authz, validate all boundary input, parameterized
  queries only, secrets in a manager (never committed), OWASP Top 10 as the
  review floor.
- Accessibility: WCAG 2.1 AA on student flows — keyboard, screen reader, AA
  contrast, never meaning-by-color-alone, respect `prefers-reduced-motion`.
- Migrations are forward-only and reviewed. Heavy work (grading, scheduling,
  rollups) goes to the job queue, never request handlers.
- CI must stay green: lint + typecheck + tests + dependency scan.

## Working style
- Small, descriptive commits and PRs; explain *why*. Record material
  architecture decisions as ADRs under `docs/adr/`.
- Add dependencies deliberately; justify each one.
- Don't add application code unless the task asks for it. Planning docs come
  before implementation.

## Beta scope reminder
In: UBE, California, MBE-only, Essay-only; core loop; original/licensed content.
Out (post-beta): MPRE, AI/human grading at scale, native apps, multi-course,
social, B2B, localization, offline. See `docs/BETA_ACCEPTANCE_CRITERIA.md`.
