CREATE TABLE "enterprise"."agent" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'custom' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"configuration" text,
	"owner_id" text,
	"owner_type" text DEFAULT 'user' NOT NULL,
	"organization_id" text,
	"metadata" text,
	"created_at" timestamp,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "enterprise"."person" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text
);
--> statement-breakpoint
ALTER TABLE "enterprise"."agent" ADD CONSTRAINT "agent_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "enterprise"."organization"("id") ON DELETE set null ON UPDATE no action;