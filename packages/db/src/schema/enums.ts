import { pgEnum } from "drizzle-orm/pg-core";

// --- Identity & access ---
export const roleKeyEnum = pgEnum("role_key", [
  "student",
  "instructor",
  "grader",
  "content_author",
  "content_reviewer",
  "admin",
]);

// --- Billing ---
export const betaInviteStatusEnum = pgEnum("beta_invite_status", [
  "active",
  "redeemed",
  "revoked",
]);

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "trialing",
  "active",
  "past_due",
  "canceled",
  "incomplete",
]);

// --- Catalog / taxonomy ---
export const courseTypeEnum = pgEnum("course_type", [
  "ube",
  "california",
  "mbe_only",
  "essay_only",
  "mpre", // post-beta, modeled now (no migration needed later)
]);

export const jurisdictionEnum = pgEnum("jurisdiction", [
  "ube",
  "california",
  "mbe",
  "mpre",
  "federal",
  "general",
]);

export const enrollmentStatusEnum = pgEnum("enrollment_status", [
  "active",
  "paused",
  "completed",
  "expired",
]);

// --- Content & licensing ---
export const provenanceEnum = pgEnum("provenance", [
  "original",
  "licensed",
  "public_domain",
  "user_supplied",
]);

export const licenseStatusEnum = pgEnum("license_status", [
  "unverified",
  "in_review",
  "cleared",
  "rejected",
  "expired",
]);

// Editorial lifecycle, distinct from the licensing gate. Only `published`
// content has its license_status set to `cleared` (student-visible).
export const contentStatusEnum = pgEnum("content_status", [
  "draft",
  "in_review",
  "approved",
  "published",
  "archived",
]);

export const itemKindEnum = pgEnum("item_kind", ["mbe_single_best_answer"]);

export const contentBlockKindEnum = pgEnum("content_block_kind", [
  "text",
  "checklist",
  "rule_statement",
  "example",
  "mini_quiz",
  "video",
  "outline_download",
  "callout",
]);

// --- Assessment ---
export const examKindEnum = pgEnum("exam_kind", [
  "diagnostic",
  "full_length",
  "sectional",
  "periodic",
  "custom",
]);

export const examSectionKindEnum = pgEnum("exam_section_kind", [
  "mbe",
  "mee_essay",
  "mpt_performance_test",
  "california_essay",
  "california_pt",
]);

export const attemptStatusEnum = pgEnum("attempt_status", [
  "in_progress",
  "submitted",
  "abandoned",
  "expired",
]);

export const examSectionStatusEnum = pgEnum("exam_section_status", [
  "pending",
  "in_progress",
  "paused",
  "submitted",
  "expired",
]);

export const practiceModeEnum = pgEnum("practice_mode", [
  "tutor",
  "timed",
  "exam",
  "diagnostic",
]);

export const confidenceLevelEnum = pgEnum("confidence_level", [
  "guessing",
  "low",
  "medium",
  "high",
]);

// --- Learning system ---
export const progressLevelEnum = pgEnum("progress_level", [
  "overall",
  "subject",
  "subtopic",
  "issue",
]);

export const lessonProgressStatusEnum = pgEnum("lesson_progress_status", [
  "not_started",
  "in_progress",
  "completed",
]);

export const learningEventTypeEnum = pgEnum("learning_event_type", [
  "lesson_viewed",
  "lesson_started",
  "lesson_completed",
  "question_answered",
  "exam_started",
  "exam_completed",
  "essay_submitted",
  "pt_submitted",
  "review_completed",
  "assignment_completed",
  "diagnostic_completed",
  "remediation_started",
  "remediation_verified",
]);

export const assignmentStatusEnum = pgEnum("assignment_status", [
  "pending",
  "in_progress",
  "completed",
  "skipped",
]);

export const assignmentBlockKindEnum = pgEnum("assignment_block_kind", [
  "new_learning",
  "question_set",
  "spaced_review",
  "flashcard_review",
  "rule_review",
  "remediation",
  "error_journal_review",
  "essay_practice",
  "pt_practice",
  "full_length_simulation",
]);

export const srsRatingEnum = pgEnum("srs_rating", [
  "again",
  "hard",
  "good",
  "easy",
]);

export const recallStageEnum = pgEnum("recall_stage", [
  "recognize",
  "cloze",
  "free_recall",
  "apply",
]);

export const errorCauseEnum = pgEnum("error_cause", [
  "didnt_know_rule",
  "misread_facts",
  "wrong_issue_spotted",
  "rule_misapplied",
  "timing_rushed",
  "careless",
  "trap_distractor",
]);

// --- Audit ---
export const auditActionEnum = pgEnum("audit_action", [
  "create",
  "update",
  "delete",
  "license_transition",
  "role_change",
  "login",
]);
