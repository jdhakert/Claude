CREATE TYPE "public"."lesson_progress_status" AS ENUM('not_started', 'in_progress', 'completed');--> statement-breakpoint
ALTER TYPE "public"."content_block_kind" ADD VALUE 'checklist' BEFORE 'rule_statement';--> statement-breakpoint
ALTER TYPE "public"."content_block_kind" ADD VALUE 'mini_quiz' BEFORE 'video';--> statement-breakpoint
ALTER TYPE "public"."content_block_kind" ADD VALUE 'outline_download' BEFORE 'callout';--> statement-breakpoint
ALTER TYPE "public"."learning_event_type" ADD VALUE 'lesson_started' BEFORE 'question_answered';--> statement-breakpoint
ALTER TYPE "public"."learning_event_type" ADD VALUE 'lesson_completed' BEFORE 'question_answered';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lesson_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"status" "lesson_progress_status" DEFAULT 'not_started' NOT NULL,
	"time_spent_seconds" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"last_viewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lesson_progress_user_lesson_unique" ON "lesson_progress" USING btree ("user_id","lesson_id");