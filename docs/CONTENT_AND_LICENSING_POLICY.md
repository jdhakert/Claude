# Content & Licensing Policy

> Binding policy for all study content in BarReady. Licensing integrity is a
> **launch blocker**, not a cleanup task (see [Product Brief](./PRODUCT_BRIEF.md)
> §6). This policy governs every question, explanation, essay prompt, model
> answer, and Performance Test file in the system.

## 1. Core prohibition — no protected content
- **No scraping.** We do not scrape, crawl, or bulk-extract questions,
  explanations, or answers from bar review providers, the NCBE, state bar
  websites, forums, or any third-party source.
- **No copying.** We do not reproduce, paraphrase-to-disguise, or create
  derivative works of **protected** bar exam content (e.g., real released or
  unreleased MBE/MEE/MPT items, commercial prep questions) without a written
  license that explicitly permits it.
- **"Looks similar" is not enough.** Genuinely original items that happen to
  test the same rule are fine; reworded copies of someone else's item are not.
- When in doubt, content is treated as **protected** until proven otherwise.

## 2. Allowed content sources
Every item must fall into exactly one of these provenance categories:

1. **Original** — authored by us or our contracted authors; work-for-hire or
   assigned rights documented.
2. **Licensed** — used under a written license whose terms we record and honor
   (scope, jurisdiction, expiry, attribution requirements).
3. **Public domain** — e.g., genuinely public-domain legal texts, statutes, and
   government works, with the public-domain basis recorded.
4. **User-supplied with rights** — a user contributes content **and** affirms
   they hold the rights to do so; we record that affirmation. User content is
   not treated as licensed to other users unless terms explicitly allow it.

No item may enter the active question bank without a provenance category and a
**license status of `cleared`** (see §4 lifecycle).

## 3. Required metadata (every imported/authored item)
Each item **must** track the following before it can be activated. Missing any
required field blocks activation.

| Field | Meaning | Required |
| --- | --- | --- |
| `source` | Where it came from (author, license, public-domain origin, or contributing user) | Yes |
| `license_status` | One of: `unverified`, `in_review`, `cleared`, `rejected`, `expired` | Yes |
| `license_ref` | Pointer to the license/agreement/affirmation record | Yes for Licensed & User-supplied |
| `jurisdiction` | Exam jurisdiction(s) it applies to (e.g., UBE, California, federal/MBE) | Yes |
| `subject` | Top-level subject (e.g., Evidence) | Yes |
| `subtopic` | Specific subtopic/issue area (e.g., Hearsay exceptions) | Yes |
| `author` | Person/entity who created it | Yes |
| `reviewer` | Person who reviewed/cleared it (distinct from author) | Yes to reach `cleared` |
| `version` | Monotonic version of the item content | Yes |

Supporting fields also tracked: `issues`/`rules tested` (for issue tracking, see
[Learning System](./LEARNING_SYSTEM.md) §4), `item_type`, `difficulty`,
`created_at`, `updated_at`, and an immutable change/audit history.

## 4. Content lifecycle
```
 draft ─► in_review ─► cleared ─► (active in question bank)
   │           │           │
   │           ▼           ▼
   └────────► rejected   expired / superseded ─► retired
```
- **Authoring/import** creates an item as `draft`/`unverified`. It is **not**
  visible to students.
- **Review** is performed by a `reviewer` who is **not** the `author`. The
  reviewer verifies legal accuracy *and* licensing provenance.
- **Cleared** items (license_status = `cleared`, reviewer set) may be activated
  into the question bank and consumed by the learning engine.
- **Expiry:** licensed content with time-bound terms auto-flags to `expired`
  and is pulled from active use until renewed.
- **Versioning:** edits create a new `version`; substantive changes re-enter
  review. History is immutable and auditable.

## 5. Enforcement (technical)
- The data model makes provenance and licensing **first-class, non-null**
  fields (Technical Charter §1.4). An item cannot be persisted as active without
  them.
- The learning engine consumes **only** `cleared` items. Unverified or rejected
  content is structurally incapable of entering a study plan or daily assignment
  (Learning System §10).
- All license-status transitions are **audit-logged** (who, when, why) per the
  security baseline (Technical Charter §3).
- Bulk import tooling refuses records missing required metadata and never
  auto-clears; clearing is always an explicit human review action.

## 6. Attribution & takedown
- We honor attribution requirements recorded in `license_ref`.
- We maintain a takedown path: if any item's provenance is credibly challenged,
  it is immediately set to `in_review`/`rejected` and pulled from active use
  pending resolution.

## 7. Scope notes
- This policy applies equally across all course types, including **MPRE** when
  added (Product Brief §4) — the metadata schema is course-agnostic.
- This is a policy document; the enforcing schema and review tooling are built
  per the Technical Charter and validated in
  [Beta Acceptance Criteria](./BETA_ACCEPTANCE_CRITERIA.md).

## 8. Editorial lifecycle vs. licensing gate (CMS)
The platform separates two concerns:
- **`license_status`** — the *student-visibility gate*. Only `cleared` content is
  served to students; this is enforced structurally in every student-facing query.
- **`content_status`** — the *editorial lifecycle*
  (`draft → in_review → approved → published → archived`), managed in the admin CMS.

Publishing is the bridge: it is the **only** action that sets
`license_status = cleared`, and it is blocked unless the item is `approved` and
carries complete source/license metadata (source, provenance, jurisdiction,
author, and a reviewer distinct from the author). Archiving un-clears content.
All transitions are audit-logged and version-bumped. This makes "unapproved
content never reaches students" and "missing metadata blocks publication"
structural guarantees, not conventions.
