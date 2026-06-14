/**
 * FULL-LENGTH BETA DEMO DATASET for BarReady (Phase 21).
 *
 * Goal: let a beta tester understand the *entire* product from seeded data
 * alone — multiple subjects, modules, lessons, a 50+ item MBE bank, essays, a
 * performance test, diagnostic/periodic/full-length exams, six demo personas,
 * and enough attempts/progress that every analytics dashboard is populated.
 *
 * IMPORTANT — LICENSING (Content & Licensing Policy §1):
 * EVERYTHING here is ORIGINAL, FICTIONAL, PLACEHOLDER content authored for the
 * demo. No real, released, or otherwise protected bar-exam content is included.
 * All scenarios, names, "codes", and rules are invented for this exercise.
 * Provenance = `original`, license `cleared`, reviewer ≠ author.
 *
 * This is SEPARATE from `seed.ts` (the lean seed used by the test suite). Run it
 * with `pnpm db:seed:demo` against a real DATABASE_URL.
 */
import { randomBytes, scrypt as scryptCb } from "node:crypto";
import { promisify } from "node:util";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "./schema/index";

type AnyDb = PgDatabase<any, typeof schema, any>;

const scrypt = promisify(scryptCb);

/** Shared dev password for every demo persona (so testers can log in as any). */
export const DEMO_PASSWORD = "demo-password-123";

/** The six demo personas the beta walkthrough is built around. */
export const DEMO_USERS = {
  newStudent: "new.student@example.com",
  activeStudent: "active.student@example.com",
  mbeWeakStudent: "mbe.weak@example.com",
  essayWeakStudent: "essay.weak@example.com",
  admin: "admin@example.com",
  grader: "grader@example.com",
} as const;

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

/** Deterministic PRNG (mulberry32) so the demo dataset is stable run-to-run. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
const daysFromNow = (n: number) => new Date(Date.now() + n * 86_400_000);

/**
 * A "concept kit" describes one subtopic well enough to generate a batch of
 * original MBE-style items: a correct concept, three sibling distractors, and a
 * bank of fictional scenarios to vary the stem. All invented for the demo.
 */
interface ConceptKit {
  subjectSlug: string;
  subtopic: { slug: string; name: string };
  issues: { slug: string; name: string; description: string }[];
  rule: { statement: string; elements: string[]; mnemonic: string };
  scenarios: string[];
  correct: { body: string; rationale: string };
  distractors: { body: string; rationale: string }[];
  explanation: string;
  flashcard: { front: string; back: string };
}

export async function seedDemo(db: AnyDb) {
  const rand = rng(20260614);

  // --- Roles (idempotent) ---
  await db
    .insert(schema.roles)
    .values([
      { key: "student", description: "Studies for the bar exam" },
      { key: "instructor", description: "Mentors assigned students" },
      { key: "grader", description: "Grades essays and PTs" },
      { key: "content_author", description: "Authors content drafts" },
      { key: "content_reviewer", description: "Reviews and clears content" },
      { key: "admin", description: "Administers the platform" },
    ])
    .onConflictDoNothing({ target: schema.roles.key });
  const roleRows = await db.select().from(schema.roles);
  const roleByKey = Object.fromEntries(roleRows.map((r) => [r.key, r.id]));

  // --- Demo users (6 personas + a content author utility user) ---
  const pw = await hashPassword(DEMO_PASSWORD);
  const [newStudent, activeStudent, mbeWeak, essayWeak, admin, grader, author] =
    await db
      .insert(schema.users)
      .values([
        {
          email: DEMO_USERS.newStudent,
          emailVerifiedAt: new Date(),
          passwordHash: pw,
          betaAccess: true,
        },
        {
          email: DEMO_USERS.activeStudent,
          emailVerifiedAt: new Date(),
          passwordHash: pw,
          betaAccess: true,
        },
        {
          email: DEMO_USERS.mbeWeakStudent,
          emailVerifiedAt: new Date(),
          passwordHash: pw,
          betaAccess: true,
        },
        {
          email: DEMO_USERS.essayWeakStudent,
          emailVerifiedAt: new Date(),
          passwordHash: pw,
          betaAccess: true,
        },
        {
          email: DEMO_USERS.admin,
          emailVerifiedAt: new Date(),
          passwordHash: pw,
          betaAccess: true,
        },
        {
          email: DEMO_USERS.grader,
          emailVerifiedAt: new Date(),
          passwordHash: pw,
          betaAccess: true,
        },
        {
          email: "content.author@example.com",
          emailVerifiedAt: new Date(),
          passwordHash: pw,
          betaAccess: true,
        },
      ])
      .returning();

  await db.insert(schema.userRoles).values([
    { userId: newStudent!.id, roleId: roleByKey["student"]! },
    { userId: activeStudent!.id, roleId: roleByKey["student"]! },
    { userId: mbeWeak!.id, roleId: roleByKey["student"]! },
    { userId: essayWeak!.id, roleId: roleByKey["student"]! },
    { userId: admin!.id, roleId: roleByKey["admin"]! },
    // Admin also clears content as reviewer (reviewer ≠ author below).
    { userId: admin!.id, roleId: roleByKey["content_reviewer"]! },
    { userId: grader!.id, roleId: roleByKey["grader"]! },
    { userId: author!.id, roleId: roleByKey["content_author"]! },
  ]);

  // Profiles describe each persona so dashboards/onboarding render meaningfully.
  await db.insert(schema.profiles).values([
    {
      userId: newStudent!.id,
      displayName: "Nora Newbie (Demo)",
      targetExamDate: daysFromNow(120),
      weeklyTimeBudgetMinutes: "480",
      priorAttempts: "0",
      onboarding: { personas: ["first_time"], selfRated: {} },
    },
    {
      userId: activeStudent!.id,
      displayName: "Avery Active (Demo)",
      targetExamDate: daysFromNow(63),
      weeklyTimeBudgetMinutes: "900",
      priorAttempts: "0",
      onboarding: {
        personas: ["first_time"],
        selfRated: { Evidence: 4, Contracts: 3 },
      },
    },
    {
      userId: mbeWeak!.id,
      displayName: "Marco MBE-Weak (Demo)",
      targetExamDate: daysFromNow(70),
      weeklyTimeBudgetMinutes: "720",
      priorAttempts: "1",
      onboarding: {
        personas: ["retaker", "mbe_weak"],
        selfRated: { Evidence: 2, Torts: 2 },
      },
    },
    {
      userId: essayWeak!.id,
      displayName: "Elle Essay-Weak (Demo)",
      targetExamDate: daysFromNow(70),
      weeklyTimeBudgetMinutes: "720",
      priorAttempts: "1",
      onboarding: {
        personas: ["retaker", "essay_weak"],
        selfRated: { Contracts: 4 },
      },
    },
  ]);

  // Active subscriptions so billing/entitlement surfaces look real.
  await db.insert(schema.subscriptions).values(
    [newStudent, activeStudent, mbeWeak, essayWeak].map((u) => ({
      userId: u!.id,
      status: "active" as const,
      plan: "beta_ube",
      entitlements: ["ube-demo"],
    })),
  );

  // --- Content provenance: original, cleared (reviewer ≠ author) ---
  const [source] = await db
    .insert(schema.contentSources)
    .values({
      name: "BarReady Demo (Original Placeholder)",
      provenance: "original",
      notes:
        "First-party, fictional placeholder content authored solely for the beta demo. Contains NO real or protected bar-exam material.",
    })
    .returning();

  const [license] = await db
    .insert(schema.contentLicenses)
    .values({
      sourceId: source!.id,
      status: "cleared",
      licenseRef: "internal://original/demo-placeholder",
      terms: "Owned outright; original demo content; no external restrictions.",
      jurisdictionScope: "ube",
    })
    .returning();

  const lic = {
    sourceId: source!.id,
    licenseId: license!.id,
    provenance: "original" as const,
    licenseStatus: "cleared" as const,
    jurisdiction: "ube" as const,
    authorId: author!.id,
    reviewerId: admin!.id, // reviewer ≠ author
    version: 1,
    contentStatus: "published" as const,
  };

  // --- Course + enrollments ---
  const [course] = await db
    .insert(schema.courses)
    .values({
      slug: "ube-demo",
      title: "UBE Demo Course — Original Placeholder Content",
      type: "ube",
      jurisdiction: "ube",
      description:
        "DEMO COURSE. Every lesson, question, essay, and PT here is original, fictional placeholder content for exploring BarReady — not real bar material.",
    })
    .returning();

  await db.insert(schema.enrollments).values(
    [newStudent, activeStudent, mbeWeak, essayWeak].map((u) => ({
      userId: u!.id,
      courseId: course!.id,
      status: "active" as const,
    })),
  );

  // --- Taxonomy + concept kits (drive subjects/subtopics/issues/items) ---
  const kits = conceptKits();
  const subjectMeta: Record<
    string,
    { name: string; weight: number; order: number }
  > = {
    evidence: { name: "Evidence", weight: 1.2, order: 1 },
    contracts: { name: "Contracts", weight: 1.1, order: 2 },
    torts: { name: "Torts", weight: 1, order: 3 },
  };

  const subjectIdBySlug: Record<string, string> = {};
  for (const [slug, meta] of Object.entries(subjectMeta)) {
    const [row] = await db
      .insert(schema.subjects)
      .values({
        courseId: course!.id,
        slug,
        name: meta.name,
        examWeight: meta.weight,
        sortOrder: meta.order,
      })
      .returning();
    subjectIdBySlug[slug] = row!.id;
  }

  // Build subtopics, issues, rules, items, choices, explanations, flashcards.
  interface BuiltSubtopic {
    kit: ConceptKit;
    subtopicId: string;
    subjectSlug: string;
    primaryIssueId: string;
    issueIds: string[];
    itemIds: string[];
    flashcardId: string;
  }
  const built: BuiltSubtopic[] = [];
  const sortInSubject: Record<string, number> = {};

  for (const kit of kits) {
    const order = (sortInSubject[kit.subjectSlug] =
      (sortInSubject[kit.subjectSlug] ?? 0) + 1);
    const [subtopic] = await db
      .insert(schema.subtopics)
      .values({
        subjectId: subjectIdBySlug[kit.subjectSlug]!,
        slug: kit.subtopic.slug,
        name: kit.subtopic.name,
        examWeight: 1,
        sortOrder: order,
      })
      .returning();

    const issueRows = await db
      .insert(schema.issues)
      .values(
        kit.issues.map((is, i) => ({
          subtopicId: subtopic!.id,
          slug: is.slug,
          name: is.name,
          description: is.description,
          examWeight: 1 + i * 0.1,
        })),
      )
      .returning();
    const primaryIssueId = issueRows[0]!.id;

    await db.insert(schema.rules).values({
      issueId: primaryIssueId,
      statement: kit.rule.statement,
      elements: kit.rule.elements,
      mnemonic: kit.rule.mnemonic,
    });

    // ~8 original MBE-style items per subtopic → 56 total across 7 kits.
    const itemIds: string[] = [];
    for (let i = 0; i < 8; i++) {
      const scenario = kit.scenarios[i % kit.scenarios.length]!;
      const [item] = await db
        .insert(schema.items)
        .values({
          subtopicId: subtopic!.id,
          primaryIssueId,
          stem: `(Demo item ${i + 1}) ${scenario} Over objection, the best answer is:`,
          difficulty: 0.3 + ((i * 7) % 10) / 20, // 0.3–0.75, varied
          ...lic,
        })
        .returning();
      itemIds.push(item!.id);

      // Rotate the correct choice position so it's not always "A".
      const correctPos = i % 4;
      const distractorPool = [...kit.distractors];
      const labels = ["A", "B", "C", "D"];
      const values = labels.map((label, pos) => {
        if (pos === correctPos) {
          return {
            itemId: item!.id,
            label,
            body: kit.correct.body,
            isCorrect: true,
            rationale: kit.correct.rationale,
            sortOrder: pos + 1,
          };
        }
        const d = distractorPool.shift()!;
        return {
          itemId: item!.id,
          label,
          body: d.body,
          isCorrect: false,
          rationale: d.rationale,
          sortOrder: pos + 1,
        };
      });
      await db.insert(schema.answerChoices).values(values);
      await db.insert(schema.explanations).values({
        itemId: item!.id,
        body: `${kit.explanation} (Original demo explanation.)`,
      });
      await db
        .insert(schema.itemIssues)
        .values({ itemId: item!.id, issueId: primaryIssueId });
    }

    const [card] = await db
      .insert(schema.flashcards)
      .values({
        issueId: primaryIssueId,
        front: kit.flashcard.front,
        back: kit.flashcard.back,
        ...lic,
      })
      .returning();

    built.push({
      kit,
      subtopicId: subtopic!.id,
      subjectSlug: kit.subjectSlug,
      primaryIssueId,
      issueIds: issueRows.map((r) => r.id),
      itemIds,
      flashcardId: card!.id,
    });
  }

  const allItemIds = built.flatMap((b) => b.itemIds);

  // --- Modules → lessons → content blocks (≥5 modules, ≥10 lessons) ---
  const modulePlan: { title: string; subtopics: string[] }[] = [
    {
      title: "Evidence Foundations (Demo)",
      subtopics: ["hearsay", "relevance"],
    },
    {
      title: "Evidence: Witnesses & Impeachment (Demo)",
      subtopics: ["impeachment"],
    },
    { title: "Contract Formation (Demo)", subtopics: ["formation"] },
    { title: "Contract Defenses (Demo)", subtopics: ["defenses"] },
    {
      title: "Torts: Negligence & Intentional (Demo)",
      subtopics: ["negligence", "intentional-torts"],
    },
  ];
  const bySubtopicSlug = Object.fromEntries(
    built.map((b) => [b.kit.subtopic.slug, b]),
  );
  let lessonCount = 0;

  for (let m = 0; m < modulePlan.length; m++) {
    const plan = modulePlan[m]!;
    const [module] = await db
      .insert(schema.modules)
      .values({ courseId: course!.id, title: plan.title, sortOrder: m + 1 })
      .returning();

    // Each module gets at least two lessons (pad from its subtopics).
    const lessonSubtopics =
      plan.subtopics.length >= 2
        ? plan.subtopics
        : [plan.subtopics[0]!, plan.subtopics[0]!];
    for (let l = 0; l < lessonSubtopics.length; l++) {
      const b = bySubtopicSlug[lessonSubtopics[l]!]!;
      const [lesson] = await db
        .insert(schema.lessons)
        .values({
          moduleId: module!.id,
          subtopicId: b.subtopicId,
          title: `${b.kit.subtopic.name} — ${l === 0 ? "Core Rules" : "Application & Traps"} (Demo)`,
          sortOrder: l + 1,
          ...lic,
        })
        .returning();
      lessonCount++;

      await db.insert(schema.contentBlocks).values([
        {
          lessonId: lesson!.id,
          kind: "callout",
          sortOrder: 1,
          body: {
            variant: "info",
            text: "Demo lesson — original placeholder content for exploring BarReady.",
          },
        },
        {
          lessonId: lesson!.id,
          kind: "text",
          sortOrder: 2,
          body: { text: b.kit.issues[0]!.description },
        },
        {
          lessonId: lesson!.id,
          kind: "rule_statement",
          sortOrder: 3,
          body: { statement: b.kit.rule.statement },
        },
        {
          lessonId: lesson!.id,
          kind: "checklist",
          sortOrder: 4,
          body: {
            title: `${b.kit.subtopic.name} analysis steps`,
            items: b.kit.rule.elements,
          },
        },
        {
          lessonId: lesson!.id,
          kind: "mini_quiz",
          sortOrder: 5,
          body: {
            question: b.kit.flashcard.front,
            choices: [
              b.kit.correct.body,
              ...b.kit.distractors.slice(0, 3).map((d) => d.body),
            ],
            correctIndex: 0,
            explanation: b.kit.explanation,
          },
        },
      ]);
    }
  }

  // --- Rubrics (essay + PT) ---
  const [essayRubric] = await db
    .insert(schema.essayRubrics)
    .values({
      name: "MEE-style Essay Rubric (Demo)",
      description: "Original demo scoring dimensions.",
    })
    .returning();
  const essayDims = [
    "issue_spotting",
    "rule_statement",
    "application",
    "organization",
    "time_management",
  ];
  await db.insert(schema.essayRubricCriteria).values(
    essayDims.map((dimension, i) => ({
      rubricId: essayRubric!.id,
      dimension,
      maxScore: 5,
      sortOrder: i + 1,
    })),
  );

  // --- Essay prompts (≥3, one per subject) ---
  const essayPromptIds: { id: string; subjectSlug: string }[] = [];
  const essaySpecs = [
    {
      subjectSlug: "evidence",
      prompt:
        "At a fictional county fair, a witness wants to repeat an absent bystander's shout during a mishap. Discuss admissibility, addressing hearsay and any exceptions. (Demo prompt.)",
      issueSubtopic: "hearsay",
    },
    {
      subjectSlug: "contracts",
      prompt:
        "Two invented small businesses exchange a series of emails about supplying widgets. Analyze whether an enforceable contract formed, addressing offer, acceptance, and consideration. (Demo prompt.)",
      issueSubtopic: "formation",
    },
    {
      subjectSlug: "torts",
      prompt:
        "A fictional pedestrian is injured when a delivery robot swerves. Analyze the delivery company's liability in negligence, addressing duty, breach, causation, and damages. (Demo prompt.)",
      issueSubtopic: "negligence",
    },
  ];
  for (const spec of essaySpecs) {
    const b = bySubtopicSlug[spec.issueSubtopic]!;
    const [p] = await db
      .insert(schema.essayPrompts)
      .values({
        courseId: course!.id,
        subjectId: subjectIdBySlug[spec.subjectSlug]!,
        rubricId: essayRubric!.id,
        prompt: spec.prompt,
        modelAnswer:
          "Model answer (demo): define the governing rule, raise each sub-issue, apply the fictional facts element-by-element, and conclude. Original placeholder text.",
        timeLimitMinutes: 30,
        ...lic,
      })
      .returning();
    await db
      .insert(schema.essayPromptIssues)
      .values({ essayPromptId: p!.id, issueId: b.primaryIssueId });
    essayPromptIds.push({ id: p!.id, subjectSlug: spec.subjectSlug });
  }

  // --- Performance Test task (≥1, closed-universe, fully fictional) ---
  const [pt] = await db
    .insert(schema.ptTasks)
    .values({
      courseId: course!.id,
      rubricId: essayRubric!.id,
      title: "Persuasive Memo — Fictional Closed-Universe PT (Demo)",
      instructions:
        "You are an associate at the fictional firm Quill & Hart. Using ONLY the provided File and Library, draft a persuasive memorandum advising whether the bystander's out-of-court statement is admissible.",
      expectedProduct: "Persuasive memorandum to the supervising partner",
      fileLibrary: {
        files: [
          {
            name: "intake_memo",
            title: "File: Client Intake Memo",
            body: "Client Dana Reyes witnessed a hot-air balloon mishap at the (fictional) Maple County Fair. A bystander shouted 'The left burner just cut out!' as the basket tipped. The bystander is unavailable. (All facts fictional.)",
          },
          {
            name: "task_memo",
            title: "File: Task Memo",
            body: "Draft a persuasive memo arguing the statement is admissible; address hearsay and any applicable exception, applying the Library to our facts.",
          },
        ],
        library: [
          {
            name: "fictional_code",
            title: "Library: Fictional Evidence Code §80",
            body: "§80 Hearsay is an out-of-court statement offered for its truth. §80.3 A present sense impression — describing an event while or immediately after perceiving it — is admissible. (Fictional code drafted for this exercise.)",
          },
        ],
      },
      modelWorkProduct:
        "MEMORANDUM (demo)\nThe statement is hearsay under §80 but admissible under §80.3 as a present sense impression. Apply each element to the File facts... (original model product).",
      timeLimitMinutes: 90,
      ...lic,
    })
    .returning();
  await db.insert(schema.ptTaskIssues).values({
    ptTaskId: pt!.id,
    issueId: bySubtopicSlug["hearsay"]!.primaryIssueId,
  });

  // --- Exams: diagnostic + periodic + full-length ---
  const [diagnostic, periodic, fullLength] = await db
    .insert(schema.exams)
    .values([
      {
        courseId: course!.id,
        kind: "diagnostic",
        title: "UBE Demo Diagnostic",
        config: { adaptive: true },
      },
      {
        courseId: course!.id,
        kind: "periodic",
        title: "Progress Exam — Month 1 (Demo)",
        config: { sections: 1 },
      },
      {
        courseId: course!.id,
        kind: "full_length",
        title: "UBE Full-Length Simulation #1 (Demo)",
        config: { sections: 4 },
      },
    ])
    .returning();

  await db.insert(schema.examSections).values([
    // Diagnostic: one short, takeable MBE section.
    {
      examId: diagnostic!.id,
      kind: "mbe",
      title: "Diagnostic — MBE",
      itemCount: 12,
      timeLimitMinutes: 22,
      sortOrder: 1,
    },
    // Periodic progress check.
    {
      examId: periodic!.id,
      kind: "mbe",
      title: "Progress — MBE",
      itemCount: 25,
      timeLimitMinutes: 45,
      sortOrder: 1,
    },
    // Full-length: realistic UBE-shaped structure (MBE AM/PM + MEE + MPT).
    {
      examId: fullLength!.id,
      kind: "mbe",
      title: "MBE — Morning",
      itemCount: 100,
      timeLimitMinutes: 180,
      sortOrder: 1,
    },
    {
      examId: fullLength!.id,
      kind: "mbe",
      title: "MBE — Afternoon",
      itemCount: 100,
      timeLimitMinutes: 180,
      sortOrder: 2,
    },
    {
      examId: fullLength!.id,
      kind: "mee_essay",
      title: "MEE Essays",
      itemCount: 6,
      timeLimitMinutes: 180,
      sortOrder: 3,
    },
    {
      examId: fullLength!.id,
      kind: "mpt_performance_test",
      title: "MPT",
      itemCount: 2,
      timeLimitMinutes: 180,
      sortOrder: 4,
    },
  ]);

  // --- Helper: lay down practice attempts for a student at a target accuracy ---
  async function layAttempts(
    userId: string,
    opts: {
      count: number;
      accuracy: number;
      subjectSlugs?: string[];
      daysBack: number;
      mode?: "tutor" | "timed";
    },
  ) {
    const pool = opts.subjectSlugs
      ? built.filter((b) => opts.subjectSlugs!.includes(b.subjectSlug))
      : built;
    const choicesByItem = new Map<
      string,
      { id: string; isCorrect: boolean }[]
    >();
    const itemIds = pool.flatMap((b) => b.itemIds);
    const rows = await db
      .select({
        id: schema.answerChoices.id,
        itemId: schema.answerChoices.itemId,
        isCorrect: schema.answerChoices.isCorrect,
      })
      .from(schema.answerChoices);
    for (const r of rows) {
      if (!choicesByItem.has(r.itemId)) choicesByItem.set(r.itemId, []);
      choicesByItem.get(r.itemId)!.push({ id: r.id, isCorrect: r.isCorrect });
    }
    for (let i = 0; i < opts.count; i++) {
      const itemId = itemIds[Math.floor(rand() * itemIds.length)]!;
      const choices = choicesByItem.get(itemId)!;
      const correct = choices.find((c) => c.isCorrect)!;
      const wrong = choices.find((c) => !c.isCorrect)!;
      const isCorrect = rand() < opts.accuracy;
      const [qa] = await db
        .insert(schema.questionAttempts)
        .values({
          userId,
          itemId,
          selectedChoiceId: isCorrect ? correct.id : wrong.id,
          isCorrect,
          timeMs: 40_000 + Math.floor(rand() * 80_000),
          mode: opts.mode ?? "tutor",
          answeredAt: daysAgo(Math.floor(rand() * opts.daysBack)),
        })
        .returning();
      // Calibration signal: weak-MBE persona is often confident-but-wrong.
      const level = isCorrect
        ? rand() < 0.6
          ? "high"
          : "medium"
        : opts.accuracy < 0.45 && rand() < 0.5
          ? "high"
          : "low";
      await db
        .insert(schema.confidenceRatings)
        .values({ questionAttemptId: qa!.id, level, wasCorrect: isCorrect });
      // Wrong answers occasionally get an error-journal tag (drives patterns).
      if (!isCorrect && rand() < 0.6) {
        const causes = [
          "didnt_know_rule",
          "misread_facts",
          "wrong_issue_spotted",
          "rule_misapplied",
          "timing_rushed",
          "trap_distractor",
        ] as const;
        const issueId = pool.find((b) =>
          b.itemIds.includes(itemId),
        )!.primaryIssueId;
        await db.insert(schema.errorJournalEntries).values({
          userId,
          questionAttemptId: qa!.id,
          issueId,
          cause: causes[Math.floor(rand() * causes.length)]!,
          note: "Demo error-journal note.",
        });
      }
    }
  }

  // --- ACTIVE STUDENT: broad, balanced progress ---
  await layAttempts(activeStudent!.id, {
    count: 60,
    accuracy: 0.72,
    daysBack: 21,
    mode: "timed",
  });
  // SRS reviews: some due now, some scheduled — exercises the review queue.
  for (let i = 0; i < built.length; i++) {
    const b = built[i]!;
    await db.insert(schema.srsReviews).values({
      userId: activeStudent!.id,
      flashcardId: b.flashcardId,
      issueId: b.primaryIssueId,
      stage: i % 2 === 0 ? "recognize" : "cloze",
      intervalDays: i % 2 === 0 ? 1 : 4,
      ease: 2.4 + (i % 3) * 0.1,
      reps: 1 + (i % 4),
      dueAt: i < 3 ? daysAgo(1) : daysFromNow(2 + i),
    });
  }
  // A submitted diagnostic with a pacing report.
  const [activeDiag] = await db
    .insert(schema.examAttempts)
    .values({
      userId: activeStudent!.id,
      examId: diagnostic!.id,
      status: "submitted",
      mode: "diagnostic",
      completedAt: daysAgo(18),
      rawScorePct: 0.68,
      scaledScore: 142,
      pacing: { avgSecondsPerItem: 92, fatigueDropoffPct: 9 },
    })
    .returning();
  // A graded essay (grader-scored) so the grading loop is visible.
  const [activeEssay] = await db
    .insert(schema.essaySubmissions)
    .values({
      userId: activeStudent!.id,
      essayPromptId: essayPromptIds.find((e) => e.subjectSlug === "evidence")!
        .id,
      responseText:
        "The statement is hearsay but likely admissible as a present sense impression... (demo response).",
      timeSpentSeconds: 1720,
      status: "submitted",
      submittedAt: daysAgo(10),
      graderId: grader!.id,
      gradedAt: daysAgo(9),
      feedback:
        "Strong issue-spotting; tighten rule application. (Demo feedback.)",
    })
    .returning();
  await db.insert(schema.essayScores).values(
    [
      ["issue_spotting", 4],
      ["rule_statement", 4],
      ["application", 3],
      ["organization", 4],
      ["time_management", 3],
    ].map(([dimension, score]) => ({
      essaySubmissionId: activeEssay!.id,
      dimension: dimension as string,
      score: score as number,
      isSelfAssessment: false,
      graderId: grader!.id,
    })),
  );
  // A graded PT submission.
  const [activePt] = await db
    .insert(schema.ptSubmissions)
    .values({
      userId: activeStudent!.id,
      ptTaskId: pt!.id,
      responseText: "MEMORANDUM... persuasive draft applying §80.3 (demo).",
      timeSpentSeconds: 4800,
      status: "submitted",
      submittedAt: daysAgo(7),
      graderId: grader!.id,
      gradedAt: daysAgo(6),
      feedback:
        "Good use of the File; cite the Library more explicitly. (Demo.)",
    })
    .returning();
  await db.insert(schema.ptScores).values(
    [
      ["format", 4],
      ["rule_extraction", 3],
      ["fact_use", 4],
      ["persuasiveness", 3],
    ].map(([dimension, score]) => ({
      ptSubmissionId: activePt!.id,
      dimension: dimension as string,
      score: score as number,
      isSelfAssessment: false,
      graderId: grader!.id,
    })),
  );

  // --- MBE-WEAK STUDENT: lots of MBE attempts, low accuracy ---
  await layAttempts(mbeWeak!.id, {
    count: 70,
    accuracy: 0.38,
    daysBack: 24,
    mode: "timed",
  });
  await db.insert(schema.examAttempts).values({
    userId: mbeWeak!.id,
    examId: diagnostic!.id,
    status: "submitted",
    mode: "diagnostic",
    completedAt: daysAgo(20),
    rawScorePct: 0.41,
    scaledScore: 118,
    pacing: { avgSecondsPerItem: 71, fatigueDropoffPct: 22 },
  });

  // --- ESSAY-WEAK STUDENT: decent MBE, weak essays ---
  await layAttempts(essayWeak!.id, {
    count: 35,
    accuracy: 0.66,
    daysBack: 20,
    mode: "timed",
  });
  for (const subjectSlug of ["evidence", "contracts", "torts"]) {
    const promptId = essayPromptIds.find(
      (e) => e.subjectSlug === subjectSlug,
    )!.id;
    const [sub] = await db
      .insert(schema.essaySubmissions)
      .values({
        userId: essayWeak!.id,
        essayPromptId: promptId,
        responseText:
          "Demo response with thin analysis and a missed sub-issue...",
        timeSpentSeconds: 2100,
        status: "submitted",
        submittedAt: daysAgo(8),
        graderId: grader!.id,
        gradedAt: daysAgo(7),
        feedback:
          "Issues spotted but rule application is conclusory; budget time per call. (Demo.)",
      })
      .returning();
    await db.insert(schema.essayScores).values(
      [
        ["issue_spotting", 2],
        ["rule_statement", 2],
        ["application", 1],
        ["organization", 2],
        ["time_management", 2],
      ].map(([dimension, score]) => ({
        essaySubmissionId: sub!.id,
        dimension: dimension as string,
        score: score as number,
        isSelfAssessment: false,
        graderId: grader!.id,
      })),
    );
  }

  // --- Progress snapshots so readiness dashboards render for each student ---
  async function snapshotsFor(
    userId: string,
    profile: { overall: number; bySubject: Record<string, number> },
  ) {
    const rows: (typeof schema.progressSnapshots.$inferInsert)[] = [
      {
        userId,
        courseId: course!.id,
        level: "overall",
        mastery: profile.overall,
        confidence: profile.overall - 0.03,
        coverage: 0.6,
        recency: 0.75,
        readiness: Math.max(0, profile.overall - 0.05),
      },
    ];
    for (const [slug, m] of Object.entries(profile.bySubject)) {
      rows.push({
        userId,
        courseId: course!.id,
        level: "subject",
        refId: subjectIdBySlug[slug]!,
        mastery: m,
        confidence: m - 0.05,
        coverage: 0.55,
      });
    }
    // Subtopic- and issue-grain so drill-downs AND "weakest issues" populate.
    for (const b of built) {
      const base = profile.bySubject[b.subjectSlug] ?? profile.overall;
      const subtopicMastery = Math.min(
        0.95,
        Math.max(0.1, base + (rand() - 0.5) * 0.2),
      );
      rows.push({
        userId,
        courseId: course!.id,
        level: "subtopic",
        refId: b.subtopicId,
        mastery: subtopicMastery,
        confidence: 0.5,
        coverage: 0.5,
      });
      for (const issueId of b.issueIds) {
        rows.push({
          userId,
          courseId: course!.id,
          level: "issue",
          refId: issueId,
          mastery: Math.min(
            0.95,
            Math.max(0.08, subtopicMastery + (rand() - 0.5) * 0.25),
          ),
          confidence: 0.5,
          coverage: 0.5,
        });
      }
    }
    await db.insert(schema.progressSnapshots).values(rows);
  }
  await snapshotsFor(activeStudent!.id, {
    overall: 0.66,
    bySubject: { evidence: 0.72, contracts: 0.64, torts: 0.6 },
  });
  await snapshotsFor(mbeWeak!.id, {
    overall: 0.42,
    bySubject: { evidence: 0.38, contracts: 0.45, torts: 0.4 },
  });
  await snapshotsFor(essayWeak!.id, {
    overall: 0.55,
    bySubject: { evidence: 0.6, contracts: 0.66, torts: 0.52 },
  });

  // --- Learning events (activity feeds) ---
  await db.insert(schema.learningEvents).values([
    {
      userId: activeStudent!.id,
      type: "diagnostic_completed",
      payload: { examAttemptId: activeDiag!.id },
    },
    {
      userId: activeStudent!.id,
      type: "essay_submitted",
      payload: { submissionId: activeEssay!.id },
    },
    {
      userId: activeStudent!.id,
      type: "pt_submitted",
      payload: { ptSubmissionId: activePt!.id },
    },
    { userId: activeStudent!.id, type: "review_completed", payload: {} },
    { userId: mbeWeak!.id, type: "diagnostic_completed", payload: {} },
    {
      userId: mbeWeak!.id,
      type: "question_answered",
      payload: { correct: false },
    },
    { userId: essayWeak!.id, type: "essay_submitted", payload: {} },
  ]);

  // --- Today's assignment (the daily contract) for the active + weak students ---
  const today = new Date().toISOString().slice(0, 10);
  for (const [student, weakSubtopic] of [
    [activeStudent!, "relevance"],
    [mbeWeak!, "hearsay"],
    [essayWeak!, "negligence"],
  ] as const) {
    const wb = bySubtopicSlug[weakSubtopic]!;
    const [assignment] = await db
      .insert(schema.assignments)
      .values({
        userId: student.id,
        courseId: course!.id,
        forDate: today,
        status: "pending",
        estMinutes: 75,
      })
      .returning();
    await db.insert(schema.assignmentItems).values([
      {
        assignmentId: assignment!.id,
        kind: "spaced_review",
        refType: "flashcard",
        refId: wb.flashcardId,
        reason: "Due reviews",
        estMinutes: 10,
        sortOrder: 1,
      },
      {
        assignmentId: assignment!.id,
        kind: "remediation",
        refType: "issue",
        refId: wb.primaryIssueId,
        reason: `Weak area: ${wb.kit.subtopic.name}`,
        estMinutes: 25,
        sortOrder: 2,
      },
      {
        assignmentId: assignment!.id,
        kind: "question_set",
        refType: "subtopic",
        refId: wb.subtopicId,
        reason: "Targeted practice",
        estMinutes: 40,
        sortOrder: 3,
      },
    ]);
  }

  // --- Audit log: record the content-clearing transition ---
  await db.insert(schema.auditLogs).values({
    actorId: admin!.id,
    action: "license_transition",
    entityType: "courses",
    entityId: course!.id,
    before: { license_status: "in_review" },
    after: { license_status: "cleared" },
    reason:
      "Original demo content; provenance verified by reviewer (≠ author).",
  });

  return {
    courseId: course!.id,
    counts: {
      users: 7,
      subjects: Object.keys(subjectMeta).length,
      modules: modulePlan.length,
      lessons: lessonCount,
      mbeItems: allItemIds.length,
      essayPrompts: essayPromptIds.length,
      ptTasks: 1,
      exams: 3,
    },
    users: DEMO_USERS,
  };
}

/**
 * Original concept kits used to generate the taxonomy + item bank. Every field
 * is invented placeholder content. 7 kits × 8 items = 56 original MBE items.
 */
function conceptKits(): ConceptKit[] {
  return [
    {
      subjectSlug: "evidence",
      subtopic: { slug: "hearsay", name: "Hearsay" },
      issues: [
        {
          slug: "hearsay-definition",
          name: "Definition of hearsay",
          description:
            "An out-of-court statement offered to prove the truth of the matter asserted is hearsay.",
        },
        {
          slug: "present-sense-impression",
          name: "Present sense impression",
          description:
            "A statement describing an event made while or immediately after perceiving it.",
        },
      ],
      rule: {
        statement:
          "A statement is hearsay if (1) made out of court and (2) offered to prove the truth of the matter asserted; recognized exceptions may still admit it.",
        elements: [
          "a statement",
          "made out of court",
          "offered for its truth",
          "no exception/exclusion applies",
        ],
        mnemonic: "Out-of-court + for-its-truth = hearsay.",
      },
      scenarios: [
        "A witness repeats what an absent neighbor said about a fire to prove the fire started in the kitchen.",
        "A letter from a missing supplier is offered to prove the goods were defective.",
        "A spectator testifies to a stranger's shout 'the brakes failed!' to prove the brakes failed.",
        "An employee recounts a co-worker's text to prove a delivery was late.",
      ],
      correct: {
        body: "Hearsay, unless an exception applies.",
        rationale: "It is an out-of-court statement offered for its truth.",
      },
      distractors: [
        {
          body: "Not hearsay because it was written down.",
          rationale: "Writing does not change hearsay status.",
        },
        {
          body: "Not hearsay because the declarant is unavailable.",
          rationale: "Unavailability does not by itself remove hearsay status.",
        },
        {
          body: "Admissible non-hearsay offered to show its effect on the listener.",
          rationale: "Here it is offered for its truth, so this is wrong.",
        },
      ],
      explanation:
        "An out-of-court statement offered to prove the truth of what it asserts is hearsay; analyze exceptions next.",
      flashcard: {
        front: "When is a statement hearsay?",
        back: "When made out of court AND offered to prove the truth of the matter asserted.",
      },
    },
    {
      subjectSlug: "evidence",
      subtopic: { slug: "relevance", name: "Relevance" },
      issues: [
        {
          slug: "logical-relevance",
          name: "Logical relevance",
          description:
            "Evidence is relevant if it has any tendency to make a material fact more or less probable.",
        },
        {
          slug: "unfair-prejudice",
          name: "Rule 403 balancing",
          description:
            "Relevant evidence may be excluded if its probative value is substantially outweighed by unfair prejudice.",
        },
      ],
      rule: {
        statement:
          "Relevant evidence is admissible unless its probative value is substantially outweighed by the danger of unfair prejudice, confusion, or waste of time.",
        elements: [
          "any tendency to prove a material fact",
          "weigh probative value",
          "against unfair prejudice",
          "substantially outweighed → exclude",
        ],
        mnemonic: "Relevant in; substantially-prejudicial out.",
      },
      scenarios: [
        "A gruesome photo is offered when the injury is undisputed, risking inflaming the jury.",
        "Evidence of a party's wealth is offered on a contract-formation question.",
        "A defendant's unrelated prior bad act is offered to suggest bad character.",
        "A detailed but cumulative diagram is offered after the point is conceded.",
      ],
      correct: {
        body: "Exclude if probative value is substantially outweighed by unfair prejudice.",
        rationale: "Rule 403 balancing governs even relevant evidence.",
      },
      distractors: [
        {
          body: "Admit automatically because it is relevant.",
          rationale:
            "Relevance is necessary but not sufficient; 403 still applies.",
        },
        {
          body: "Exclude because all prejudicial evidence is barred.",
          rationale:
            "Only unfair prejudice that substantially outweighs probative value is barred.",
        },
        {
          body: "Admit because the parties stipulated to relevance.",
          rationale: "Stipulation does not defeat 403 balancing.",
        },
      ],
      explanation:
        "Even relevant evidence is subject to Rule 403 balancing against unfair prejudice.",
      flashcard: {
        front: "Standard for excluding relevant evidence under Rule 403?",
        back: "Probative value substantially outweighed by unfair prejudice, confusion, or waste of time.",
      },
    },
    {
      subjectSlug: "evidence",
      subtopic: { slug: "impeachment", name: "Impeachment" },
      issues: [
        {
          slug: "prior-inconsistent-statement",
          name: "Prior inconsistent statement",
          description:
            "A witness may be impeached with a prior statement inconsistent with current testimony.",
        },
        {
          slug: "character-for-truthfulness",
          name: "Character for truthfulness",
          description:
            "A witness's character for truthfulness may be attacked, subject to limits.",
        },
      ],
      rule: {
        statement:
          "A witness may be impeached by a prior inconsistent statement; if made under oath at a prior proceeding it may also be substantive evidence.",
        elements: [
          "prior statement",
          "inconsistent with testimony",
          "witness given chance to explain",
          "oath → substantive use",
        ],
        mnemonic: "Catch the change; oath makes it substance.",
      },
      scenarios: [
        "A witness now says the light was green but told police it was red.",
        "A witness's deposition contradicts trial testimony about a meeting date.",
        "A bystander's signed statement conflicts with their account on the stand.",
        "A party's earlier sworn affidavit differs from current testimony.",
      ],
      correct: {
        body: "Admissible to impeach by prior inconsistent statement.",
        rationale: "Prior inconsistent statements are classic impeachment.",
      },
      distractors: [
        {
          body: "Inadmissible because impeachment requires extrinsic documents only.",
          rationale: "Impeachment is not limited to documents.",
        },
        {
          body: "Inadmissible because witnesses may never be contradicted.",
          rationale: "Witnesses may be impeached; this is wrong.",
        },
        {
          body: "Admissible only to prove the matter asserted.",
          rationale:
            "It impeaches credibility; substantive use needs a prior oath.",
        },
      ],
      explanation:
        "A prior inconsistent statement impeaches credibility; with a prior oath it can also be substantive.",
      flashcard: {
        front:
          "What makes a prior inconsistent statement substantive evidence?",
        back: "If it was made under oath at a prior trial, hearing, or deposition.",
      },
    },
    {
      subjectSlug: "contracts",
      subtopic: { slug: "formation", name: "Contract Formation" },
      issues: [
        {
          slug: "offer-acceptance",
          name: "Offer and acceptance",
          description:
            "A contract requires a valid offer and an acceptance matching its terms.",
        },
        {
          slug: "consideration",
          name: "Consideration",
          description:
            "A bargained-for exchange of legal value supports enforceability.",
        },
      ],
      rule: {
        statement:
          "Formation requires mutual assent (offer + acceptance) and consideration — a bargained-for exchange of legal value.",
        elements: [
          "offer",
          "acceptance",
          "bargained-for exchange",
          "legal value on both sides",
        ],
        mnemonic: "Offer + Accept + Consideration = deal.",
      },
      scenarios: [
        "Two fictional shops exchange emails agreeing on price and quantity of widgets.",
        "A party promises a gift with nothing requested in return.",
        "An offeree purports to accept but adds a new material term.",
        "A party performs exactly what the offer requested before any revocation.",
      ],
      correct: {
        body: "Enforceable only if offer, acceptance, and consideration are present.",
        rationale: "All three formation elements must be satisfied.",
      },
      distractors: [
        {
          body: "Enforceable because the parties were friendly.",
          rationale: "Friendliness is not a formation element.",
        },
        {
          body: "Enforceable as a gift promise without consideration.",
          rationale: "Gratuitous promises generally lack consideration.",
        },
        {
          body: "Unenforceable because contracts require a signed writing.",
          rationale:
            "Many contracts need no writing absent the Statute of Frauds.",
        },
      ],
      explanation:
        "Check mutual assent and consideration; a missing element defeats formation.",
      flashcard: {
        front: "Three core elements of contract formation?",
        back: "Offer, acceptance, and consideration (bargained-for exchange).",
      },
    },
    {
      subjectSlug: "contracts",
      subtopic: { slug: "defenses", name: "Contract Defenses" },
      issues: [
        {
          slug: "statute-of-frauds",
          name: "Statute of Frauds",
          description:
            "Certain contracts are unenforceable unless evidenced by a signed writing.",
        },
        {
          slug: "misrepresentation",
          name: "Misrepresentation",
          description:
            "A material misrepresentation inducing assent can void or avoid a contract.",
        },
      ],
      rule: {
        statement:
          "Under the Statute of Frauds, contracts within its categories (e.g., over one year, sale of goods ≥ $500) require a signed writing to be enforceable.",
        elements: [
          "contract within a SoF category",
          "no signed writing",
          "no exception (part performance, etc.)",
          "→ unenforceable",
        ],
        mnemonic: "MY LEGS contracts need a writing.",
      },
      scenarios: [
        "An oral two-year fictional services deal is disputed.",
        "An oral sale of goods for $900 is contested.",
        "A party claims an oral land-sale agreement.",
        "A party asserts an oral promise to answer another's debt.",
      ],
      correct: {
        body: "Unenforceable absent a signed writing if within the Statute of Frauds.",
        rationale: "SoF categories require a signed writing.",
      },
      distractors: [
        {
          body: "Enforceable because oral contracts are always valid.",
          rationale: "SoF carves out exceptions to oral enforceability.",
        },
        {
          body: "Unenforceable because all oral contracts fail.",
          rationale: "Only SoF categories require a writing.",
        },
        {
          body: "Enforceable because consideration cures the writing requirement.",
          rationale:
            "Consideration does not satisfy the SoF writing requirement.",
        },
      ],
      explanation:
        "Identify whether the contract falls within a Statute of Frauds category before requiring a writing.",
      flashcard: {
        front: "What does the Statute of Frauds require for covered contracts?",
        back: "A writing signed by the party to be charged (subject to exceptions).",
      },
    },
    {
      subjectSlug: "torts",
      subtopic: { slug: "negligence", name: "Negligence" },
      issues: [
        {
          slug: "duty-breach",
          name: "Duty and breach",
          description:
            "A defendant owing a duty breaches by failing to act as a reasonable person.",
        },
        {
          slug: "causation",
          name: "Causation",
          description:
            "Liability requires both actual and proximate causation of the harm.",
        },
      ],
      rule: {
        statement:
          "Negligence requires duty, breach, causation (actual and proximate), and damages.",
        elements: [
          "duty of care",
          "breach (unreasonable conduct)",
          "actual + proximate cause",
          "damages",
        ],
        mnemonic: "Duty–Breach–Causation–Damages.",
      },
      scenarios: [
        "A fictional delivery robot swerves and injures a pedestrian.",
        "A store leaves a spill unmarked and a customer slips.",
        "A driver texts and rear-ends a cyclist.",
        "A landlord ignores a known broken stair and a tenant falls.",
      ],
      correct: {
        body: "Liable only if duty, breach, causation, and damages are all shown.",
        rationale: "All four negligence elements must be proven.",
      },
      distractors: [
        {
          body: "Liable because an accident occurred.",
          rationale:
            "Negligence is not strict liability; fault elements are required.",
        },
        {
          body: "Not liable because intent is required.",
          rationale: "Negligence does not require intent.",
        },
        {
          body: "Liable based on duty and breach alone.",
          rationale: "Causation and damages are also required.",
        },
      ],
      explanation:
        "Walk through duty, breach, causation, and damages; a missing element defeats the claim.",
      flashcard: {
        front: "Four elements of negligence?",
        back: "Duty, breach, causation (actual + proximate), and damages.",
      },
    },
    {
      subjectSlug: "torts",
      subtopic: { slug: "intentional-torts", name: "Intentional Torts" },
      issues: [
        {
          slug: "battery",
          name: "Battery",
          description:
            "Intentional harmful or offensive contact with another's person.",
        },
        {
          slug: "false-imprisonment",
          name: "False imprisonment",
          description:
            "Intentional confinement of another within fixed boundaries without lawful privilege.",
        },
      ],
      rule: {
        statement:
          "Battery is an intentional act causing harmful or offensive contact with the plaintiff's person.",
        elements: [
          "intent to cause contact",
          "harmful or offensive contact",
          "with plaintiff's person",
          "causation",
        ],
        mnemonic: "Intent + offensive touch = battery.",
      },
      scenarios: [
        "A fictional patron deliberately knocks a hat off another's head.",
        "A prankster pulls a chair as someone sits.",
        "A person spits on another in anger.",
        "A bystander shoves through a crowd, striking someone intentionally.",
      ],
      correct: {
        body: "Battery, because intentional harmful or offensive contact occurred.",
        rationale:
          "Offensive contact intended by the defendant satisfies battery.",
      },
      distractors: [
        {
          body: "No tort because there was no physical injury.",
          rationale: "Offensive contact suffices; injury is not required.",
        },
        {
          body: "Negligence only, because intent is irrelevant.",
          rationale:
            "Intentional contact makes this battery, not mere negligence.",
        },
        {
          body: "Assault but never battery.",
          rationale:
            "Completed offensive contact is battery, not just assault.",
        },
      ],
      explanation:
        "Intentional harmful or offensive contact with the plaintiff's person is battery, even without injury.",
      flashcard: {
        front: "Elements of battery?",
        back: "Intent to cause, and causing, harmful or offensive contact with the plaintiff's person.",
      },
    },
  ];
}

// CLI entrypoint: seed the FULL demo dataset at DATABASE_URL.
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url)
    throw new Error("DATABASE_URL is required to seed the demo dataset");
  const sql = postgres(url, { max: 1 });
  const db = drizzle(sql, { schema, casing: "snake_case" });
  const result = await seedDemo(db as unknown as AnyDb);
  console.log("seeded demo dataset:", JSON.stringify(result, null, 2));
  await sql.end();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
