CREATE TYPE "public"."content_status" AS ENUM('draft', 'in_review', 'approved', 'published', 'archived');--> statement-breakpoint
ALTER TABLE "essay_prompts" ADD COLUMN "content_status" "content_status" DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "flashcards" ADD COLUMN "content_status" "content_status" DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "content_status" "content_status" DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "content_status" "content_status" DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "pt_tasks" ADD COLUMN "content_status" "content_status" DEFAULT 'draft' NOT NULL;