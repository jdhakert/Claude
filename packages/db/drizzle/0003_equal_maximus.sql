ALTER TABLE "essay_submissions" ADD COLUMN "grader_id" uuid;--> statement-breakpoint
ALTER TABLE "essay_submissions" ADD COLUMN "graded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "essay_submissions" ADD COLUMN "feedback" text;--> statement-breakpoint
ALTER TABLE "essay_submissions" ADD COLUMN "grader_meta" jsonb;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "essay_submissions" ADD CONSTRAINT "essay_submissions_grader_id_users_id_fk" FOREIGN KEY ("grader_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
