CREATE TYPE "public"."exam_section_status" AS ENUM('pending', 'in_progress', 'paused', 'submitted', 'expired');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "exam_attempt_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_attempt_id" uuid NOT NULL,
	"exam_section_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"selected_choice_id" uuid,
	"is_correct" boolean,
	"change_count" integer DEFAULT 0 NOT NULL,
	"flagged" boolean DEFAULT false NOT NULL,
	"time_ms" integer DEFAULT 0 NOT NULL,
	"answered_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "exam_attempt_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_attempt_id" uuid NOT NULL,
	"exam_section_id" uuid NOT NULL,
	"status" "exam_section_status" DEFAULT 'pending' NOT NULL,
	"started_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"paused_at" timestamp with time zone,
	"paused_ms" integer DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exam_attempt_items" ADD CONSTRAINT "exam_attempt_items_exam_attempt_id_exam_attempts_id_fk" FOREIGN KEY ("exam_attempt_id") REFERENCES "public"."exam_attempts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exam_attempt_items" ADD CONSTRAINT "exam_attempt_items_exam_section_id_exam_sections_id_fk" FOREIGN KEY ("exam_section_id") REFERENCES "public"."exam_sections"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exam_attempt_items" ADD CONSTRAINT "exam_attempt_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exam_attempt_items" ADD CONSTRAINT "exam_attempt_items_selected_choice_id_answer_choices_id_fk" FOREIGN KEY ("selected_choice_id") REFERENCES "public"."answer_choices"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exam_attempt_sections" ADD CONSTRAINT "exam_attempt_sections_exam_attempt_id_exam_attempts_id_fk" FOREIGN KEY ("exam_attempt_id") REFERENCES "public"."exam_attempts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exam_attempt_sections" ADD CONSTRAINT "exam_attempt_sections_exam_section_id_exam_sections_id_fk" FOREIGN KEY ("exam_section_id") REFERENCES "public"."exam_sections"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "exam_attempt_items_unique" ON "exam_attempt_items" USING btree ("exam_attempt_id","item_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "exam_attempt_sections_unique" ON "exam_attempt_sections" USING btree ("exam_attempt_id","exam_section_id");