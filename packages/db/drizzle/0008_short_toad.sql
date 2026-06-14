CREATE TYPE "public"."beta_invite_status" AS ENUM('active', 'redeemed', 'revoked');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "beta_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"email" text,
	"note" text,
	"status" "beta_invite_status" DEFAULT 'active' NOT NULL,
	"created_by" uuid,
	"redeemed_by" uuid,
	"redeemed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "notification_prefs" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "beta_access" boolean DEFAULT false NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "beta_invites" ADD CONSTRAINT "beta_invites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "beta_invites" ADD CONSTRAINT "beta_invites_redeemed_by_users_id_fk" FOREIGN KEY ("redeemed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "beta_invites_code_unique" ON "beta_invites" USING btree ("code");