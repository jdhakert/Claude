CREATE TYPE "public"."assignment_block_kind" AS ENUM('new_learning', 'spaced_review', 'remediation', 'essay_practice', 'pt_practice', 'full_length_simulation');--> statement-breakpoint
CREATE TYPE "public"."assignment_status" AS ENUM('pending', 'in_progress', 'completed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."attempt_status" AS ENUM('in_progress', 'submitted', 'abandoned', 'expired');--> statement-breakpoint
CREATE TYPE "public"."audit_action" AS ENUM('create', 'update', 'delete', 'license_transition', 'role_change', 'login');--> statement-breakpoint
CREATE TYPE "public"."confidence_level" AS ENUM('guessing', 'low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."content_block_kind" AS ENUM('text', 'rule_statement', 'example', 'video', 'callout');--> statement-breakpoint
CREATE TYPE "public"."course_type" AS ENUM('ube', 'california', 'mbe_only', 'essay_only', 'mpre');--> statement-breakpoint
CREATE TYPE "public"."enrollment_status" AS ENUM('active', 'paused', 'completed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."error_cause" AS ENUM('didnt_know_rule', 'misread_facts', 'wrong_issue_spotted', 'rule_misapplied', 'timing_rushed', 'careless', 'trap_distractor');--> statement-breakpoint
CREATE TYPE "public"."exam_kind" AS ENUM('diagnostic', 'full_length', 'sectional', 'periodic', 'custom');--> statement-breakpoint
CREATE TYPE "public"."exam_section_kind" AS ENUM('mbe', 'mee_essay', 'mpt_performance_test', 'california_essay', 'california_pt');--> statement-breakpoint
CREATE TYPE "public"."item_kind" AS ENUM('mbe_single_best_answer');--> statement-breakpoint
CREATE TYPE "public"."jurisdiction" AS ENUM('ube', 'california', 'mbe', 'mpre', 'federal', 'general');--> statement-breakpoint
CREATE TYPE "public"."learning_event_type" AS ENUM('lesson_viewed', 'question_answered', 'exam_started', 'exam_completed', 'essay_submitted', 'pt_submitted', 'review_completed', 'assignment_completed', 'diagnostic_completed', 'remediation_started', 'remediation_verified');--> statement-breakpoint
CREATE TYPE "public"."license_status" AS ENUM('unverified', 'in_review', 'cleared', 'rejected', 'expired');--> statement-breakpoint
CREATE TYPE "public"."practice_mode" AS ENUM('tutor', 'timed', 'exam', 'diagnostic');--> statement-breakpoint
CREATE TYPE "public"."progress_level" AS ENUM('overall', 'subject', 'subtopic', 'issue');--> statement-breakpoint
CREATE TYPE "public"."provenance" AS ENUM('original', 'licensed', 'public_domain', 'user_supplied');--> statement-breakpoint
CREATE TYPE "public"."recall_stage" AS ENUM('recognize', 'cloze', 'free_recall', 'apply');--> statement-breakpoint
CREATE TYPE "public"."role_key" AS ENUM('student', 'instructor', 'grader', 'content_author', 'content_reviewer', 'admin');--> statement-breakpoint
CREATE TYPE "public"."srs_rating" AS ENUM('again', 'hard', 'good', 'easy');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('trialing', 'active', 'past_due', 'canceled', 'incomplete');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"display_name" text,
	"target_exam_date" timestamp with time zone,
	"weekly_time_budget_minutes" text,
	"prior_attempts" text,
	"onboarding" jsonb,
	"organization_id" uuid,
	"cohort_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" "role_key" NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_roles" (
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_roles_user_id_role_id_pk" PRIMARY KEY("user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"email_verified_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "subscription_status" DEFAULT 'trialing' NOT NULL,
	"plan" text NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"entitlements" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"current_period_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"type" "course_type" NOT NULL,
	"jurisdiction" "jurisdiction" NOT NULL,
	"description" text,
	"is_beta" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"status" "enrollment_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subtopic_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"exam_weight" real DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issue_id" uuid NOT NULL,
	"statement" text NOT NULL,
	"elements" text[],
	"mnemonic" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"exam_weight" real DEFAULT 1 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subtopics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"exam_weight" real DEFAULT 1 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "answer_choices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"label" text NOT NULL,
	"body" text NOT NULL,
	"is_correct" boolean DEFAULT false NOT NULL,
	"rationale" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "content_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_id" uuid NOT NULL,
	"kind" "content_block_kind" DEFAULT 'text' NOT NULL,
	"body" jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "content_licenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"status" "license_status" DEFAULT 'unverified' NOT NULL,
	"license_ref" text,
	"terms" text,
	"jurisdiction_scope" "jurisdiction",
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "content_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"provenance" "provenance" NOT NULL,
	"url" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "essay_prompt_issues" (
	"essay_prompt_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	CONSTRAINT "essay_prompt_issues_essay_prompt_id_issue_id_pk" PRIMARY KEY("essay_prompt_id","issue_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "essay_prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"subject_id" uuid,
	"rubric_id" uuid,
	"prompt" text NOT NULL,
	"model_answer" text,
	"time_limit_minutes" integer DEFAULT 30 NOT NULL,
	"source_id" uuid NOT NULL,
	"license_id" uuid,
	"provenance" "provenance" NOT NULL,
	"license_status" "license_status" DEFAULT 'unverified' NOT NULL,
	"jurisdiction" "jurisdiction" NOT NULL,
	"author_id" uuid NOT NULL,
	"reviewer_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "essay_rubric_criteria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rubric_id" uuid NOT NULL,
	"dimension" text NOT NULL,
	"description" text,
	"max_score" integer DEFAULT 5 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "essay_rubrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "explanations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "flashcards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issue_id" uuid,
	"front" text NOT NULL,
	"back" text NOT NULL,
	"source_id" uuid NOT NULL,
	"license_id" uuid,
	"provenance" "provenance" NOT NULL,
	"license_status" "license_status" DEFAULT 'unverified' NOT NULL,
	"jurisdiction" "jurisdiction" NOT NULL,
	"author_id" uuid NOT NULL,
	"reviewer_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "item_issues" (
	"item_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	CONSTRAINT "item_issues_item_id_issue_id_pk" PRIMARY KEY("item_id","issue_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "item_kind" DEFAULT 'mbe_single_best_answer' NOT NULL,
	"subtopic_id" uuid NOT NULL,
	"primary_issue_id" uuid,
	"stem" text NOT NULL,
	"difficulty" real DEFAULT 0.5 NOT NULL,
	"source_id" uuid NOT NULL,
	"license_id" uuid,
	"provenance" "provenance" NOT NULL,
	"license_status" "license_status" DEFAULT 'unverified' NOT NULL,
	"jurisdiction" "jurisdiction" NOT NULL,
	"author_id" uuid NOT NULL,
	"reviewer_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module_id" uuid NOT NULL,
	"subtopic_id" uuid,
	"title" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"source_id" uuid NOT NULL,
	"license_id" uuid,
	"provenance" "provenance" NOT NULL,
	"license_status" "license_status" DEFAULT 'unverified' NOT NULL,
	"jurisdiction" "jurisdiction" NOT NULL,
	"author_id" uuid NOT NULL,
	"reviewer_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "modules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"title" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pt_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"rubric_id" uuid,
	"title" text NOT NULL,
	"instructions" text NOT NULL,
	"file_library" jsonb,
	"model_work_product" text,
	"time_limit_minutes" integer DEFAULT 90 NOT NULL,
	"source_id" uuid NOT NULL,
	"license_id" uuid,
	"provenance" "provenance" NOT NULL,
	"license_status" "license_status" DEFAULT 'unverified' NOT NULL,
	"jurisdiction" "jurisdiction" NOT NULL,
	"author_id" uuid NOT NULL,
	"reviewer_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "confidence_ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_attempt_id" uuid NOT NULL,
	"level" "confidence_level" NOT NULL,
	"was_correct" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "essay_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"essay_submission_id" uuid NOT NULL,
	"criterion_id" uuid,
	"dimension" text NOT NULL,
	"score" integer NOT NULL,
	"is_self_assessment" boolean DEFAULT true NOT NULL,
	"grader_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "essay_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"essay_prompt_id" uuid NOT NULL,
	"exam_attempt_id" uuid,
	"response_text" text DEFAULT '' NOT NULL,
	"time_spent_seconds" integer,
	"status" "attempt_status" DEFAULT 'in_progress' NOT NULL,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "exam_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"exam_id" uuid NOT NULL,
	"status" "attempt_status" DEFAULT 'in_progress' NOT NULL,
	"mode" "practice_mode" DEFAULT 'exam' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"raw_score_pct" real,
	"scaled_score" real,
	"pacing" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "exam_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_id" uuid NOT NULL,
	"kind" "exam_section_kind" NOT NULL,
	"title" text NOT NULL,
	"item_count" integer DEFAULT 0 NOT NULL,
	"time_limit_minutes" integer DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "exams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"kind" "exam_kind" NOT NULL,
	"title" text NOT NULL,
	"config" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pt_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"pt_task_id" uuid NOT NULL,
	"exam_attempt_id" uuid,
	"response_text" text DEFAULT '' NOT NULL,
	"time_spent_seconds" integer,
	"status" "attempt_status" DEFAULT 'in_progress' NOT NULL,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "question_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"exam_attempt_id" uuid,
	"exam_section_id" uuid,
	"selected_choice_id" uuid,
	"is_correct" boolean DEFAULT false NOT NULL,
	"time_ms" integer,
	"mode" "practice_mode" DEFAULT 'tutor' NOT NULL,
	"position_in_exam" integer,
	"flagged" boolean DEFAULT false NOT NULL,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "assignment_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"kind" "assignment_block_kind" NOT NULL,
	"ref_type" text,
	"ref_id" uuid,
	"reason" text NOT NULL,
	"est_minutes" integer DEFAULT 0 NOT NULL,
	"status" "assignment_status" DEFAULT 'pending' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"for_date" date NOT NULL,
	"status" "assignment_status" DEFAULT 'pending' NOT NULL,
	"est_minutes" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "error_journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"question_attempt_id" uuid,
	"issue_id" uuid,
	"cause" "error_cause" NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "learning_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "learning_event_type" NOT NULL,
	"payload" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "progress_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"level" "progress_level" NOT NULL,
	"ref_id" uuid,
	"mastery" real,
	"confidence" real,
	"coverage" real,
	"recency" real,
	"readiness" real,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "srs_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"flashcard_id" uuid,
	"issue_id" uuid,
	"stage" "recall_stage" DEFAULT 'recognize' NOT NULL,
	"interval_days" real DEFAULT 0 NOT NULL,
	"ease" real DEFAULT 2.5 NOT NULL,
	"reps" integer DEFAULT 0 NOT NULL,
	"lapses" integer DEFAULT 0 NOT NULL,
	"due_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_rating" "srs_rating",
	"last_reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" "audit_action" NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"before" jsonb,
	"after" jsonb,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "issues" ADD CONSTRAINT "issues_subtopic_id_subtopics_id_fk" FOREIGN KEY ("subtopic_id") REFERENCES "public"."subtopics"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rules" ADD CONSTRAINT "rules_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subjects" ADD CONSTRAINT "subjects_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subtopics" ADD CONSTRAINT "subtopics_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "answer_choices" ADD CONSTRAINT "answer_choices_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "content_blocks" ADD CONSTRAINT "content_blocks_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "content_licenses" ADD CONSTRAINT "content_licenses_source_id_content_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."content_sources"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "essay_prompt_issues" ADD CONSTRAINT "essay_prompt_issues_essay_prompt_id_essay_prompts_id_fk" FOREIGN KEY ("essay_prompt_id") REFERENCES "public"."essay_prompts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "essay_prompt_issues" ADD CONSTRAINT "essay_prompt_issues_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "essay_prompts" ADD CONSTRAINT "essay_prompts_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "essay_prompts" ADD CONSTRAINT "essay_prompts_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "essay_prompts" ADD CONSTRAINT "essay_prompts_rubric_id_essay_rubrics_id_fk" FOREIGN KEY ("rubric_id") REFERENCES "public"."essay_rubrics"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "essay_prompts" ADD CONSTRAINT "essay_prompts_source_id_content_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."content_sources"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "essay_prompts" ADD CONSTRAINT "essay_prompts_license_id_content_licenses_id_fk" FOREIGN KEY ("license_id") REFERENCES "public"."content_licenses"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "essay_prompts" ADD CONSTRAINT "essay_prompts_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "essay_prompts" ADD CONSTRAINT "essay_prompts_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "essay_rubric_criteria" ADD CONSTRAINT "essay_rubric_criteria_rubric_id_essay_rubrics_id_fk" FOREIGN KEY ("rubric_id") REFERENCES "public"."essay_rubrics"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "explanations" ADD CONSTRAINT "explanations_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "flashcards" ADD CONSTRAINT "flashcards_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "flashcards" ADD CONSTRAINT "flashcards_source_id_content_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."content_sources"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "flashcards" ADD CONSTRAINT "flashcards_license_id_content_licenses_id_fk" FOREIGN KEY ("license_id") REFERENCES "public"."content_licenses"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "flashcards" ADD CONSTRAINT "flashcards_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "flashcards" ADD CONSTRAINT "flashcards_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "item_issues" ADD CONSTRAINT "item_issues_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "item_issues" ADD CONSTRAINT "item_issues_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "items" ADD CONSTRAINT "items_subtopic_id_subtopics_id_fk" FOREIGN KEY ("subtopic_id") REFERENCES "public"."subtopics"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "items" ADD CONSTRAINT "items_primary_issue_id_issues_id_fk" FOREIGN KEY ("primary_issue_id") REFERENCES "public"."issues"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "items" ADD CONSTRAINT "items_source_id_content_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."content_sources"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "items" ADD CONSTRAINT "items_license_id_content_licenses_id_fk" FOREIGN KEY ("license_id") REFERENCES "public"."content_licenses"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "items" ADD CONSTRAINT "items_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "items" ADD CONSTRAINT "items_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lessons" ADD CONSTRAINT "lessons_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lessons" ADD CONSTRAINT "lessons_subtopic_id_subtopics_id_fk" FOREIGN KEY ("subtopic_id") REFERENCES "public"."subtopics"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lessons" ADD CONSTRAINT "lessons_source_id_content_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."content_sources"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lessons" ADD CONSTRAINT "lessons_license_id_content_licenses_id_fk" FOREIGN KEY ("license_id") REFERENCES "public"."content_licenses"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lessons" ADD CONSTRAINT "lessons_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lessons" ADD CONSTRAINT "lessons_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "modules" ADD CONSTRAINT "modules_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pt_tasks" ADD CONSTRAINT "pt_tasks_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pt_tasks" ADD CONSTRAINT "pt_tasks_rubric_id_essay_rubrics_id_fk" FOREIGN KEY ("rubric_id") REFERENCES "public"."essay_rubrics"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pt_tasks" ADD CONSTRAINT "pt_tasks_source_id_content_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."content_sources"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pt_tasks" ADD CONSTRAINT "pt_tasks_license_id_content_licenses_id_fk" FOREIGN KEY ("license_id") REFERENCES "public"."content_licenses"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pt_tasks" ADD CONSTRAINT "pt_tasks_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pt_tasks" ADD CONSTRAINT "pt_tasks_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "confidence_ratings" ADD CONSTRAINT "confidence_ratings_question_attempt_id_question_attempts_id_fk" FOREIGN KEY ("question_attempt_id") REFERENCES "public"."question_attempts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "essay_scores" ADD CONSTRAINT "essay_scores_essay_submission_id_essay_submissions_id_fk" FOREIGN KEY ("essay_submission_id") REFERENCES "public"."essay_submissions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "essay_scores" ADD CONSTRAINT "essay_scores_criterion_id_essay_rubric_criteria_id_fk" FOREIGN KEY ("criterion_id") REFERENCES "public"."essay_rubric_criteria"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "essay_scores" ADD CONSTRAINT "essay_scores_grader_id_users_id_fk" FOREIGN KEY ("grader_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "essay_submissions" ADD CONSTRAINT "essay_submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "essay_submissions" ADD CONSTRAINT "essay_submissions_essay_prompt_id_essay_prompts_id_fk" FOREIGN KEY ("essay_prompt_id") REFERENCES "public"."essay_prompts"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "essay_submissions" ADD CONSTRAINT "essay_submissions_exam_attempt_id_exam_attempts_id_fk" FOREIGN KEY ("exam_attempt_id") REFERENCES "public"."exam_attempts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exam_attempts" ADD CONSTRAINT "exam_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exam_attempts" ADD CONSTRAINT "exam_attempts_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exam_sections" ADD CONSTRAINT "exam_sections_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exams" ADD CONSTRAINT "exams_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pt_submissions" ADD CONSTRAINT "pt_submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pt_submissions" ADD CONSTRAINT "pt_submissions_pt_task_id_pt_tasks_id_fk" FOREIGN KEY ("pt_task_id") REFERENCES "public"."pt_tasks"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pt_submissions" ADD CONSTRAINT "pt_submissions_exam_attempt_id_exam_attempts_id_fk" FOREIGN KEY ("exam_attempt_id") REFERENCES "public"."exam_attempts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "question_attempts" ADD CONSTRAINT "question_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "question_attempts" ADD CONSTRAINT "question_attempts_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "question_attempts" ADD CONSTRAINT "question_attempts_exam_attempt_id_exam_attempts_id_fk" FOREIGN KEY ("exam_attempt_id") REFERENCES "public"."exam_attempts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "question_attempts" ADD CONSTRAINT "question_attempts_exam_section_id_exam_sections_id_fk" FOREIGN KEY ("exam_section_id") REFERENCES "public"."exam_sections"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "question_attempts" ADD CONSTRAINT "question_attempts_selected_choice_id_answer_choices_id_fk" FOREIGN KEY ("selected_choice_id") REFERENCES "public"."answer_choices"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assignment_items" ADD CONSTRAINT "assignment_items_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assignments" ADD CONSTRAINT "assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assignments" ADD CONSTRAINT "assignments_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "error_journal_entries" ADD CONSTRAINT "error_journal_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "error_journal_entries" ADD CONSTRAINT "error_journal_entries_question_attempt_id_question_attempts_id_fk" FOREIGN KEY ("question_attempt_id") REFERENCES "public"."question_attempts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "error_journal_entries" ADD CONSTRAINT "error_journal_entries_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "learning_events" ADD CONSTRAINT "learning_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "progress_snapshots" ADD CONSTRAINT "progress_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "progress_snapshots" ADD CONSTRAINT "progress_snapshots_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "srs_reviews" ADD CONSTRAINT "srs_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "srs_reviews" ADD CONSTRAINT "srs_reviews_flashcard_id_flashcards_id_fk" FOREIGN KEY ("flashcard_id") REFERENCES "public"."flashcards"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "srs_reviews" ADD CONSTRAINT "srs_reviews_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "roles_key_unique" ON "roles" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sessions_token_unique" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "courses_slug_unique" ON "courses" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "enrollments_user_course_unique" ON "enrollments" USING btree ("user_id","course_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "issues_subtopic_slug_unique" ON "issues" USING btree ("subtopic_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "subjects_course_slug_unique" ON "subjects" USING btree ("course_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "subtopics_subject_slug_unique" ON "subtopics" USING btree ("subject_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "answer_choices_item_label_unique" ON "answer_choices" USING btree ("item_id","label");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "explanations_item_unique" ON "explanations" USING btree ("item_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "confidence_ratings_attempt_unique" ON "confidence_ratings" USING btree ("question_attempt_id");