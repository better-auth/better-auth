CREATE SCHEMA IF NOT EXISTS "enterprise";
--> statement-breakpoint
CREATE TABLE "enterprise"."account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enterprise"."apikey" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"start" text,
	"prefix" text,
	"key" text NOT NULL,
	"user_id" text NOT NULL,
	"refill_interval" integer,
	"refill_amount" integer,
	"last_refill_at" timestamp,
	"enabled" boolean DEFAULT true,
	"rate_limit_enabled" boolean DEFAULT true,
	"rate_limit_time_window" integer DEFAULT 86400000,
	"rate_limit_max" integer DEFAULT 10,
	"request_count" integer DEFAULT 0,
	"remaining" integer,
	"last_request" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"permissions" text,
	"metadata" text
);
--> statement-breakpoint
CREATE TABLE "enterprise"."invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"team_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"inviter_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enterprise"."member" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enterprise"."oauth_access_token" (
	"id" text PRIMARY KEY NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"client_id" text,
	"user_id" text,
	"scopes" text,
	"created_at" timestamp,
	"updated_at" timestamp,
	CONSTRAINT "oauth_access_token_access_token_unique" UNIQUE("access_token"),
	CONSTRAINT "oauth_access_token_refresh_token_unique" UNIQUE("refresh_token")
);
--> statement-breakpoint
CREATE TABLE "enterprise"."oauth_application" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"icon" text,
	"metadata" text,
	"client_id" text,
	"client_secret" text,
	"redirect_urls" text,
	"type" text,
	"disabled" boolean DEFAULT false,
	"user_id" text,
	"created_at" timestamp,
	"updated_at" timestamp,
	CONSTRAINT "oauth_application_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "enterprise"."oauth_consent" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text,
	"user_id" text,
	"scopes" text,
	"created_at" timestamp,
	"updated_at" timestamp,
	"consent_given" boolean
);
--> statement-breakpoint
CREATE TABLE "enterprise"."object" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"external_id" text,
	"external_type" text,
	"attributes" text,
	"metadata" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "enterprise"."organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"created_at" timestamp NOT NULL,
	"metadata" text,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "enterprise"."platform_role" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enterprise"."relationship" (
	"id" text PRIMARY KEY NOT NULL,
	"subject_id" text NOT NULL,
	"subject_type" text NOT NULL,
	"object_id" text NOT NULL,
	"object_type" text NOT NULL,
	"relationship_type" text NOT NULL,
	"attributes" text,
	"metadata" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "enterprise"."schema_definition" (
	"id" text PRIMARY KEY NOT NULL,
	"version" text NOT NULL,
	"definition" text NOT NULL,
	"is_active" boolean DEFAULT true,
	"metadata" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp,
	"created_by" text
);
--> statement-breakpoint
CREATE TABLE "enterprise"."session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"impersonated_by" text,
	"active_organization_id" text,
	"active_team_id" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "enterprise"."team" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"organization_id" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "enterprise"."team_member" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "enterprise"."two_factor" (
	"id" text PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enterprise"."user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"role" text,
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp,
	"two_factor_enabled" boolean DEFAULT false,
	"actor_type" text DEFAULT 'person',
	"actor_id" text,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "enterprise"."verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "enterprise"."account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "enterprise"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise"."apikey" ADD CONSTRAINT "apikey_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "enterprise"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise"."invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "enterprise"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise"."invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "enterprise"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise"."member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "enterprise"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise"."member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "enterprise"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise"."oauth_access_token" ADD CONSTRAINT "oauth_access_token_client_id_oauth_application_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "enterprise"."oauth_application"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise"."oauth_access_token" ADD CONSTRAINT "oauth_access_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "enterprise"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise"."oauth_application" ADD CONSTRAINT "oauth_application_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "enterprise"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise"."oauth_consent" ADD CONSTRAINT "oauth_consent_client_id_oauth_application_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "enterprise"."oauth_application"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise"."oauth_consent" ADD CONSTRAINT "oauth_consent_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "enterprise"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise"."relationship" ADD CONSTRAINT "relationship_subject_id_object_id_fk" FOREIGN KEY ("subject_id") REFERENCES "enterprise"."object"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise"."relationship" ADD CONSTRAINT "relationship_object_id_object_id_fk" FOREIGN KEY ("object_id") REFERENCES "enterprise"."object"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise"."schema_definition" ADD CONSTRAINT "schema_definition_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "enterprise"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise"."session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "enterprise"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise"."team" ADD CONSTRAINT "team_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "enterprise"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise"."team_member" ADD CONSTRAINT "team_member_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "enterprise"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise"."team_member" ADD CONSTRAINT "team_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "enterprise"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise"."two_factor" ADD CONSTRAINT "two_factor_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "enterprise"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "enterprise"."account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "apikey_key_idx" ON "enterprise"."apikey" USING btree ("key");--> statement-breakpoint
CREATE INDEX "apikey_userId_idx" ON "enterprise"."apikey" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "invitation_organizationId_idx" ON "enterprise"."invitation" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "enterprise"."invitation" USING btree ("email");--> statement-breakpoint
CREATE INDEX "member_organizationId_idx" ON "enterprise"."member" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "member_userId_idx" ON "enterprise"."member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "oauthAccessToken_clientId_idx" ON "enterprise"."oauth_access_token" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "oauthAccessToken_userId_idx" ON "enterprise"."oauth_access_token" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "oauthApplication_userId_idx" ON "enterprise"."oauth_application" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "oauthConsent_clientId_idx" ON "enterprise"."oauth_consent" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "oauthConsent_userId_idx" ON "enterprise"."oauth_consent" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "enterprise"."session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "team_organizationId_idx" ON "enterprise"."team" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "teamMember_teamId_idx" ON "enterprise"."team_member" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "teamMember_userId_idx" ON "enterprise"."team_member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "twoFactor_secret_idx" ON "enterprise"."two_factor" USING btree ("secret");--> statement-breakpoint
CREATE INDEX "twoFactor_userId_idx" ON "enterprise"."two_factor" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "enterprise"."verification" USING btree ("identifier");