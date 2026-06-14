CREATE TABLE IF NOT EXISTS "pt_task_issues" (
	"pt_task_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	CONSTRAINT "pt_task_issues_pt_task_id_issue_id_pk" PRIMARY KEY("pt_task_id","issue_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pt_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pt_submission_id" uuid NOT NULL,
	"dimension" text NOT NULL,
	"score" integer NOT NULL,
	"is_self_assessment" boolean DEFAULT true NOT NULL,
	"grader_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pt_tasks" ADD COLUMN "expected_product" text;--> statement-breakpoint
ALTER TABLE "pt_submissions" ADD COLUMN "grader_id" uuid;--> statement-breakpoint
ALTER TABLE "pt_submissions" ADD COLUMN "graded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pt_submissions" ADD COLUMN "feedback" text;--> statement-breakpoint
ALTER TABLE "pt_submissions" ADD COLUMN "grader_meta" jsonb;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pt_task_issues" ADD CONSTRAINT "pt_task_issues_pt_task_id_pt_tasks_id_fk" FOREIGN KEY ("pt_task_id") REFERENCES "public"."pt_tasks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pt_task_issues" ADD CONSTRAINT "pt_task_issues_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pt_scores" ADD CONSTRAINT "pt_scores_pt_submission_id_pt_submissions_id_fk" FOREIGN KEY ("pt_submission_id") REFERENCES "public"."pt_submissions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pt_scores" ADD CONSTRAINT "pt_scores_grader_id_users_id_fk" FOREIGN KEY ("grader_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pt_submissions" ADD CONSTRAINT "pt_submissions_grader_id_users_id_fk" FOREIGN KEY ("grader_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
