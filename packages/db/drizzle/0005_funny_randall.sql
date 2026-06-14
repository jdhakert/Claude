ALTER TYPE "public"."assignment_block_kind" ADD VALUE 'question_set' BEFORE 'spaced_review';--> statement-breakpoint
ALTER TYPE "public"."assignment_block_kind" ADD VALUE 'flashcard_review' BEFORE 'remediation';--> statement-breakpoint
ALTER TYPE "public"."assignment_block_kind" ADD VALUE 'rule_review' BEFORE 'remediation';--> statement-breakpoint
ALTER TYPE "public"."assignment_block_kind" ADD VALUE 'error_journal_review' BEFORE 'essay_practice';