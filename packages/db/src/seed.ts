/**
 * Seed data for BarReady.
 *
 * IMPORTANT: every item here is ORIGINAL, fictional placeholder content authored
 * for development only. No real, released, or protected bar exam content is
 * included (Content & Licensing Policy §1). Provenance = `original`, fully
 * license-cleared, with reviewer ≠ author to exercise the workflow.
 */
import { randomBytes, scrypt as scryptCb } from "node:crypto";
import { promisify } from "node:util";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "./schema/index";

type AnyDb = PgDatabase<any, typeof schema, any>;

const scrypt = promisify(scryptCb);

/** Dev-only password for the seeded demo student (lets you log in and see data). */
export const DEMO_STUDENT_EMAIL = "demo.student@example.com";
export const DEMO_STUDENT_PASSWORD = "demo-password-123";

/** Produce a scrypt hash in the same `scrypt$salt$hash` format the API uses. */
async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function seed(db: AnyDb) {
  // --- Roles (idempotent: server startup also ensures these) ---
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

  // --- Users (student + author + reviewer-as-admin) ---
  const [student, author, reviewer, admin] = await db
    .insert(schema.users)
    .values([
      {
        email: DEMO_STUDENT_EMAIL,
        emailVerifiedAt: new Date(),
        passwordHash: await hashPassword(DEMO_STUDENT_PASSWORD),
      },
      { email: "demo.author@example.com", emailVerifiedAt: new Date() },
      { email: "demo.reviewer@example.com", emailVerifiedAt: new Date() },
      { email: "demo.admin@example.com", emailVerifiedAt: new Date() },
    ])
    .returning();

  await db.insert(schema.userRoles).values([
    { userId: student!.id, roleId: roleByKey["student"]! },
    { userId: author!.id, roleId: roleByKey["content_author"]! },
    { userId: reviewer!.id, roleId: roleByKey["content_reviewer"]! },
    { userId: admin!.id, roleId: roleByKey["admin"]! },
  ]);

  await db.insert(schema.profiles).values({
    userId: student!.id,
    displayName: "Demo Student",
    targetExamDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 70),
    weeklyTimeBudgetMinutes: "600",
    priorAttempts: "0",
    onboarding: {
      personas: ["first_time", "mbe_weak"],
      selfRated: { Evidence: 2 },
    },
  });

  await db.insert(schema.subscriptions).values({
    userId: student!.id,
    status: "active",
    plan: "beta_ube",
    entitlements: ["ube-2026"],
  });

  // --- Content source + license (original, cleared) ---
  const [source] = await db
    .insert(schema.contentSources)
    .values({
      name: "BarReady Original",
      provenance: "original",
      notes: "First-party authored content for development/demo.",
    })
    .returning();

  const [license] = await db
    .insert(schema.contentLicenses)
    .values({
      sourceId: source!.id,
      status: "cleared",
      licenseRef: "internal://original/work-for-hire",
      terms: "Owned outright; no external restrictions.",
      jurisdictionScope: "ube",
    })
    .returning();

  // Reusable license columns for cleared, original content (reviewer ≠ author).
  const lic = {
    sourceId: source!.id,
    licenseId: license!.id,
    provenance: "original" as const,
    licenseStatus: "cleared" as const,
    jurisdiction: "ube" as const,
    authorId: author!.id,
    reviewerId: reviewer!.id,
    version: 1,
    contentStatus: "published" as const,
  };

  // --- Course + taxonomy ---
  const [course] = await db
    .insert(schema.courses)
    .values({
      slug: "ube-2026",
      title: "Uniform Bar Exam — 2026",
      type: "ube",
      jurisdiction: "ube",
      description: "Beta UBE course: MBE + MEE essays + MPT.",
    })
    .returning();

  await db.insert(schema.enrollments).values({
    userId: student!.id,
    courseId: course!.id,
    status: "active",
  });

  const [evidence] = await db
    .insert(schema.subjects)
    .values([
      {
        courseId: course!.id,
        slug: "evidence",
        name: "Evidence",
        examWeight: 1,
        sortOrder: 1,
      },
      {
        courseId: course!.id,
        slug: "contracts",
        name: "Contracts",
        examWeight: 1,
        sortOrder: 2,
      },
    ])
    .returning();

  const [hearsay] = await db
    .insert(schema.subtopics)
    .values([
      {
        subjectId: evidence!.id,
        slug: "hearsay",
        name: "Hearsay",
        examWeight: 1.5,
        sortOrder: 1,
      },
      {
        subjectId: evidence!.id,
        slug: "relevance",
        name: "Relevance",
        examWeight: 1,
        sortOrder: 2,
      },
    ])
    .returning();

  const [pse, hearsayDef] = await db
    .insert(schema.issues)
    .values([
      {
        subtopicId: hearsay!.id,
        slug: "present-sense-impression",
        name: "Present sense impression",
        description:
          "A statement describing an event made while or immediately after perceiving it.",
        examWeight: 1.2,
      },
      {
        subtopicId: hearsay!.id,
        slug: "hearsay-definition",
        name: "Definition of hearsay",
        description:
          "An out-of-court statement offered to prove the truth of the matter asserted.",
        examWeight: 1,
      },
    ])
    .returning();

  await db.insert(schema.rules).values([
    {
      issueId: pse!.id,
      statement:
        "A present sense impression is a statement describing or explaining an event or condition, made while or immediately after the declarant perceived it; it is admissible as an exception to the rule against hearsay.",
      elements: [
        "describes/explains an event",
        "made during or immediately after perceiving",
        "by the declarant",
      ],
      mnemonic: "See it, say it (right away).",
    },
  ]);

  // --- MBE item (original, fictional) ---
  const [item] = await db
    .insert(schema.items)
    .values({
      subtopicId: hearsay!.id,
      primaryIssueId: pse!.id,
      stem: 'At a community fair, a bystander watching a hot-air balloon said aloud, as the basket tipped, "The left burner just cut out!" A spectator who overheard this later repeats it at trial to prove the burner failed. Over a hearsay objection, the statement is most likely:',
      difficulty: 0.55,
      ...lic,
    })
    .returning();

  const choices = await db
    .insert(schema.answerChoices)
    .values([
      {
        itemId: item!.id,
        label: "A",
        body: "Admissible as a present sense impression.",
        isCorrect: true,
        rationale:
          "The statement describes the event as the declarant perceived it, made contemporaneously — the present sense impression exception applies.",
        sortOrder: 1,
      },
      {
        itemId: item!.id,
        label: "B",
        body: "Inadmissible because it is hearsay not within any exception.",
        isCorrect: false,
        rationale:
          "It is hearsay, but a recognized exception (present sense impression) applies, so this is wrong.",
        sortOrder: 2,
      },
      {
        itemId: item!.id,
        label: "C",
        body: "Admissible because it is not offered for its truth.",
        isCorrect: false,
        rationale:
          "It IS offered for its truth (that the burner failed), so this rationale fails.",
        sortOrder: 3,
      },
      {
        itemId: item!.id,
        label: "D",
        body: "Inadmissible because the declarant is unidentified.",
        isCorrect: false,
        rationale:
          "An unidentified declarant does not defeat the present sense impression exception.",
        sortOrder: 4,
      },
    ])
    .returning();

  await db.insert(schema.explanations).values({
    itemId: item!.id,
    body: "The statement is an out-of-court statement offered for its truth, so it is hearsay. However, it describes an event (the burner cutting out) and was made while the declarant was perceiving it. That satisfies the present sense impression exception, so it is admissible. (A) is correct.",
  });

  await db.insert(schema.itemIssues).values([
    { itemId: item!.id, issueId: pse!.id },
    { itemId: item!.id, issueId: hearsayDef!.id },
  ]);

  // Two more original, cleared MBE items so exams have multiple questions.
  const extraItems = await db
    .insert(schema.items)
    .values([
      {
        subtopicId: hearsay!.id,
        primaryIssueId: hearsayDef!.id,
        stem: "A letter written by an absent witness is offered to prove the facts it asserts. The best objection is:",
        difficulty: 0.4,
        ...lic,
      },
      {
        subtopicId: hearsay!.id,
        primaryIssueId: hearsayDef!.id,
        stem: "Testimony repeating what a party's own agent said, offered against that party, is best characterized as:",
        difficulty: 0.5,
        ...lic,
      },
    ])
    .returning();

  for (const extra of extraItems) {
    await db.insert(schema.answerChoices).values([
      {
        itemId: extra.id,
        label: "A",
        body: "Hearsay",
        isCorrect: true,
        rationale: "Out-of-court statement offered for its truth.",
        sortOrder: 1,
      },
      {
        itemId: extra.id,
        label: "B",
        body: "Relevant non-hearsay",
        isCorrect: false,
        rationale: "It is offered for its truth, so it is hearsay.",
        sortOrder: 2,
      },
      {
        itemId: extra.id,
        label: "C",
        body: "Privileged",
        isCorrect: false,
        rationale: "No privilege is implicated.",
        sortOrder: 3,
      },
      {
        itemId: extra.id,
        label: "D",
        body: "Authentication failure",
        isCorrect: false,
        rationale: "Authentication is a separate issue.",
        sortOrder: 4,
      },
    ]);
    await db.insert(schema.explanations).values({
      itemId: extra.id,
      body: "The statement is offered to prove the truth of what it asserts, so the hearsay objection applies. (Original practice item.)",
    });
  }

  // --- Flashcard + SRS review ---
  const [card] = await db
    .insert(schema.flashcards)
    .values({
      issueId: pse!.id,
      front: "What are the elements of a present sense impression?",
      back: "(1) describes/explains an event or condition, (2) made while or immediately after the declarant perceived it.",
      ...lic,
    })
    .returning();

  await db.insert(schema.srsReviews).values({
    userId: student!.id,
    flashcardId: card!.id,
    issueId: pse!.id,
    stage: "recognize",
    intervalDays: 1,
    ease: 2.5,
    reps: 1,
    // Due now (slightly overdue) so the demo has a must-do review today.
    dueAt: new Date(Date.now() - 1000 * 60 * 60),
  });

  // --- Essay rubric + prompt ---
  const [rubric] = await db
    .insert(schema.essayRubrics)
    .values({
      name: "MEE Essay Rubric",
      description: "Standard essay scoring dimensions.",
    })
    .returning();

  await db.insert(schema.essayRubricCriteria).values([
    {
      rubricId: rubric!.id,
      dimension: "issue_spotting",
      description: "Identified the issues a model answer raises.",
      maxScore: 5,
      sortOrder: 1,
    },
    {
      rubricId: rubric!.id,
      dimension: "rule_statement",
      maxScore: 5,
      sortOrder: 2,
    },
    {
      rubricId: rubric!.id,
      dimension: "application",
      maxScore: 5,
      sortOrder: 3,
    },
    {
      rubricId: rubric!.id,
      dimension: "organization",
      maxScore: 5,
      sortOrder: 4,
    },
    {
      rubricId: rubric!.id,
      dimension: "time_management",
      maxScore: 5,
      sortOrder: 5,
    },
  ]);

  const [prompt] = await db
    .insert(schema.essayPrompts)
    .values({
      courseId: course!.id,
      subjectId: evidence!.id,
      rubricId: rubric!.id,
      prompt:
        "A witness seeks to testify about what a now-unavailable bystander shouted during an accident. Discuss whether the statement is admissible, addressing hearsay and any applicable exceptions. (Original practice prompt.)",
      modelAnswer:
        "Begin by defining hearsay, then analyze present sense impression and excited utterance exceptions, applying the facts to each element...",
      timeLimitMinutes: 30,
      ...lic,
    })
    .returning();

  await db.insert(schema.essayPromptIssues).values({
    essayPromptId: prompt!.id,
    issueId: pse!.id,
  });

  // --- Performance Test task (original, closed-universe placeholder) ---
  const [pt] = await db
    .insert(schema.ptTasks)
    .values({
      courseId: course!.id,
      rubricId: rubric!.id,
      title: "Drafting a Persuasive Memo (Original Closed-Universe PT)",
      instructions:
        "You are an associate at Fictional & Partners. Using ONLY the provided File and Library, draft a persuasive memorandum to the supervising partner advising whether the bystander's out-of-court statement is admissible.",
      expectedProduct: "Persuasive memorandum to the supervising partner",
      fileLibrary: {
        files: [
          {
            name: "client_intake_memo",
            title: "File: Client Intake Memo",
            body: "Our client, Dana Reyes, witnessed a hot-air balloon mishap at a county fair. A bystander shouted 'The left burner just cut out!' as the basket tipped. The bystander is now unavailable. Opposing counsel will object to any testimony repeating the shout. (All names and facts are fictional.)",
          },
          {
            name: "supervisor_task_memo",
            title: "File: Task Memo",
            body: "Draft a persuasive memo arguing the statement is admissible. Address hearsay and any applicable exception, applying the Library to our facts.",
          },
        ],
        library: [
          {
            name: "fictional_evidence_code",
            title: "Library: Fictional Evidence Code §80",
            body: "§80. Hearsay is an out-of-court statement offered to prove the truth of the matter asserted. §80.3 A present sense impression — a statement describing an event made while or immediately after perceiving it — is not excluded by the rule against hearsay. (Fictional code drafted for this exercise.)",
          },
        ],
      },
      modelWorkProduct:
        "MEMORANDUM\nTo: Supervising Partner\nRe: Admissibility of the bystander statement\n\nThe statement is hearsay under §80 because it is offered to prove the burner failed. However, under §80.3 it is a present sense impression — describing the event as the declarant perceived it — and is therefore admissible. Apply the File facts to each element... (original model product).",
      timeLimitMinutes: 90,
      ...lic,
    })
    .returning();

  await db.insert(schema.ptTaskIssues).values({
    ptTaskId: pt!.id,
    issueId: pse!.id,
  });

  // --- Course content: module → lessons → content blocks ---
  const [module] = await db
    .insert(schema.modules)
    .values({
      courseId: course!.id,
      title: "Evidence Foundations",
      sortOrder: 1,
    })
    .returning();

  const [hearsayLesson] = await db
    .insert(schema.lessons)
    .values({
      moduleId: module!.id,
      subtopicId: hearsay!.id,
      title: "Hearsay Basics",
      sortOrder: 1,
      ...lic,
    })
    .returning();

  await db.insert(schema.contentBlocks).values([
    {
      lessonId: hearsayLesson!.id,
      kind: "text",
      sortOrder: 1,
      body: {
        text: "Hearsay is an out-of-court statement offered to prove the truth of the matter asserted. If it is not offered for its truth, it is not hearsay.",
      },
    },
    {
      lessonId: hearsayLesson!.id,
      kind: "rule_statement",
      sortOrder: 2,
      body: {
        statement:
          "A statement is hearsay if (1) it was made out of court and (2) it is offered to prove the truth of the matter asserted.",
      },
    },
    {
      lessonId: hearsayLesson!.id,
      kind: "checklist",
      sortOrder: 3,
      body: {
        title: "Hearsay analysis steps",
        items: [
          "Is there a statement?",
          "Was it made out of court?",
          "Is it offered for its truth?",
          "Does an exception or exclusion apply?",
        ],
      },
    },
    {
      lessonId: hearsayLesson!.id,
      kind: "example",
      sortOrder: 4,
      body: {
        prompt: "Witness testifies: 'Sam told me the light was red.'",
        analysis:
          "Offered to prove the light was red → hearsay. Offered only to show Sam could speak → not hearsay.",
      },
    },
    {
      lessonId: hearsayLesson!.id,
      kind: "callout",
      sortOrder: 5,
      body: {
        variant: "warning",
        text: "Don't confuse a hearsay exception with non-hearsay. Exceptions admit hearsay; exclusions mean it was never hearsay.",
      },
    },
    {
      lessonId: hearsayLesson!.id,
      kind: "mini_quiz",
      sortOrder: 6,
      body: {
        question:
          "An out-of-court statement offered to prove the truth of what it asserts is:",
        choices: [
          "Never admissible",
          "Hearsay",
          "Always admissible",
          "Opinion",
        ],
        correctIndex: 1,
        explanation: "By definition that is hearsay (subject to exceptions).",
      },
    },
    {
      lessonId: hearsayLesson!.id,
      kind: "video",
      sortOrder: 7,
      body: { title: "Hearsay overview (placeholder)", durationSeconds: 0 },
    },
    {
      lessonId: hearsayLesson!.id,
      kind: "outline_download",
      sortOrder: 8,
      body: { title: "Evidence attack outline (placeholder)", fileRef: null },
    },
  ]);

  // A second lesson (kept minimal) to exercise multi-lesson modules.
  await db
    .insert(schema.lessons)
    .values({
      moduleId: module!.id,
      subtopicId: hearsay!.id,
      title: "Present Sense Impression",
      sortOrder: 2,
      ...lic,
    })
    .returning();

  // --- Exams: diagnostic + full-length ---
  const [diagnostic, fullLength] = await db
    .insert(schema.exams)
    .values([
      {
        courseId: course!.id,
        kind: "diagnostic",
        title: "UBE Diagnostic",
        config: { adaptive: true },
      },
      {
        courseId: course!.id,
        kind: "full_length",
        title: "UBE Full-Length Simulation #1",
        config: { sections: 3 },
      },
    ])
    .returning();

  await db.insert(schema.examSections).values([
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
      kind: "mee_essay",
      title: "MEE Essays",
      itemCount: 6,
      timeLimitMinutes: 180,
      sortOrder: 2,
    },
    {
      examId: fullLength!.id,
      kind: "mpt_performance_test",
      title: "MPT",
      itemCount: 2,
      timeLimitMinutes: 180,
      sortOrder: 3,
    },
    // A short MBE section on the diagnostic so it is takeable end-to-end.
    {
      examId: diagnostic!.id,
      kind: "mbe",
      title: "Diagnostic — MBE",
      itemCount: 10,
      timeLimitMinutes: 18,
      sortOrder: 1,
    },
  ]);

  // --- A realistic attempt: diagnostic sitting + one answered question ---
  const [examAttempt] = await db
    .insert(schema.examAttempts)
    .values({
      userId: student!.id,
      examId: diagnostic!.id,
      status: "submitted",
      mode: "diagnostic",
      completedAt: new Date(),
      rawScorePct: 0.62,
      pacing: { avgSecondsPerItem: 95, fatigueDropoffPct: 8 },
    })
    .returning();

  const wrongChoice = choices.find((c) => !c.isCorrect)!;
  const [qAttempt] = await db
    .insert(schema.questionAttempts)
    .values({
      userId: student!.id,
      itemId: item!.id,
      examAttemptId: examAttempt!.id,
      selectedChoiceId: wrongChoice.id,
      isCorrect: false,
      timeMs: 88000,
      mode: "diagnostic",
      positionInExam: 12,
    })
    .returning();

  await db.insert(schema.confidenceRatings).values({
    questionAttemptId: qAttempt!.id,
    level: "high", // confident + wrong => overconfidence signal (Design §13)
    wasCorrect: false,
  });

  await db.insert(schema.errorJournalEntries).values({
    userId: student!.id,
    questionAttemptId: qAttempt!.id,
    issueId: pse!.id,
    cause: "wrong_issue_spotted",
    note: "Thought it was offered not-for-truth; missed that it proves the burner failed.",
  });

  // --- Essay submission + self-assessment scores ---
  const [submission] = await db
    .insert(schema.essaySubmissions)
    .values({
      userId: student!.id,
      essayPromptId: prompt!.id,
      responseText:
        "The statement is hearsay but likely admissible as a present sense impression...",
      timeSpentSeconds: 1750,
      status: "submitted",
      submittedAt: new Date(),
    })
    .returning();

  await db.insert(schema.essayScores).values([
    {
      essaySubmissionId: submission!.id,
      dimension: "issue_spotting",
      score: 3,
      isSelfAssessment: true,
    },
    {
      essaySubmissionId: submission!.id,
      dimension: "application",
      score: 2,
      isSelfAssessment: true,
    },
  ]);

  await db.insert(schema.ptSubmissions).values({
    userId: student!.id,
    ptTaskId: pt!.id,
    responseText: "MEMORANDUM... (draft work product)",
    timeSpentSeconds: 4900,
    status: "submitted",
    submittedAt: new Date(),
  });

  // --- Progress snapshots at every grain ---
  await db.insert(schema.progressSnapshots).values([
    {
      userId: student!.id,
      courseId: course!.id,
      level: "overall",
      mastery: 0.58,
      confidence: 0.6,
      coverage: 0.7,
      recency: 0.8,
      readiness: 0.55,
    },
    {
      userId: student!.id,
      courseId: course!.id,
      level: "subject",
      refId: evidence!.id,
      mastery: 0.5,
      confidence: 0.6,
      coverage: 0.65,
    },
    {
      userId: student!.id,
      courseId: course!.id,
      level: "subtopic",
      refId: hearsay!.id,
      mastery: 0.4,
      confidence: 0.5,
      coverage: 0.6,
    },
    {
      userId: student!.id,
      courseId: course!.id,
      level: "issue",
      refId: pse!.id,
      mastery: 0.35,
      confidence: 0.45,
      coverage: 0.5,
    },
  ]);

  // --- Learning events ---
  await db.insert(schema.learningEvents).values([
    {
      userId: student!.id,
      type: "diagnostic_completed",
      payload: { examAttemptId: examAttempt!.id },
    },
    {
      userId: student!.id,
      type: "question_answered",
      payload: { itemId: item!.id, correct: false },
    },
    {
      userId: student!.id,
      type: "essay_submitted",
      payload: { submissionId: submission!.id },
    },
  ]);

  // --- Today's assignment (the daily contract) ---
  const today = new Date().toISOString().slice(0, 10);
  const [assignment] = await db
    .insert(schema.assignments)
    .values({
      userId: student!.id,
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
      refId: card!.id,
      reason: "Due review",
      estMinutes: 10,
      sortOrder: 1,
    },
    {
      assignmentId: assignment!.id,
      kind: "remediation",
      refType: "issue",
      refId: pse!.id,
      reason: "Weak issue: present sense impression",
      estMinutes: 25,
      sortOrder: 2,
    },
    {
      assignmentId: assignment!.id,
      kind: "essay_practice",
      refType: "essay_prompt",
      refId: prompt!.id,
      reason: "Build issue-spotting",
      estMinutes: 40,
      sortOrder: 3,
    },
  ]);

  // --- Audit log: record the content-clearing transition ---
  await db.insert(schema.auditLogs).values({
    actorId: reviewer!.id,
    action: "license_transition",
    entityType: "items",
    entityId: item!.id,
    before: { license_status: "in_review" },
    after: { license_status: "cleared" },
    reason: "Original content; provenance verified by reviewer (≠ author).",
  });

  return {
    courseId: course!.id,
    studentId: student!.id,
    itemId: item!.id,
    moduleId: module!.id,
    lessonId: hearsayLesson!.id,
    examIds: { diagnostic: diagnostic!.id, fullLength: fullLength!.id },
  };
}

// CLI entrypoint: seed the database at DATABASE_URL.
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required to seed");
  const sql = postgres(url, { max: 1 });
  const db = drizzle(sql, { schema, casing: "snake_case" });
  const result = await seed(db as unknown as AnyDb);
  console.log("seeded:", result);
  await sql.end();
}

// Only run when invoked directly (not when imported by tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
