ALTER TABLE "enterprise"."user" ADD COLUMN "is_anonymous" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "enterprise"."user" ADD COLUMN "phone_number" text;--> statement-breakpoint
ALTER TABLE "enterprise"."user" ADD COLUMN "phone_number_verified" boolean;--> statement-breakpoint
ALTER TABLE "enterprise"."user" ADD COLUMN "user_metadata" jsonb;--> statement-breakpoint
ALTER TABLE "enterprise"."user" ADD COLUMN "app_metadata" jsonb;--> statement-breakpoint
ALTER TABLE "enterprise"."user" ADD COLUMN "invited_at" timestamp;--> statement-breakpoint
ALTER TABLE "enterprise"."user" ADD COLUMN "last_sign_in_at" timestamp;--> statement-breakpoint
ALTER TABLE "enterprise"."user" ADD CONSTRAINT "user_phone_number_unique" UNIQUE("phone_number");