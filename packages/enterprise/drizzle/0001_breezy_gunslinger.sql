CREATE TABLE "enterprise"."asset" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"owner_id" text NOT NULL,
	"asset_type_id" text NOT NULL,
	"team_id" text,
	"name" text NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"visibility_locked" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "enterprise"."asset_role" (
	"id" text PRIMARY KEY NOT NULL,
	"asset_type_id" text NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_built_in" boolean DEFAULT false NOT NULL,
	"permissions" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "enterprise"."asset_share" (
	"id" text PRIMARY KEY NOT NULL,
	"asset_id" text NOT NULL,
	"grant_type" text NOT NULL,
	"member_id" text,
	"team_id" text,
	"organization_id" text,
	"external_email" text,
	"role" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"invited_by_member_id" text,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "enterprise"."asset_share_link" (
	"id" text PRIMARY KEY NOT NULL,
	"asset_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"role" text NOT NULL,
	"link_visibility" text DEFAULT 'organization' NOT NULL,
	"requires_auth" boolean DEFAULT true NOT NULL,
	"password_hash" text,
	"expires_at" timestamp,
	"created_by_member_id" text NOT NULL,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enterprise"."asset_type" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"scope" text DEFAULT 'organization' NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"metadata" jsonb,
	"source" text,
	"default_visibility" text DEFAULT 'private' NOT NULL,
	"allowed_visibilities" jsonb NOT NULL,
	"is_built_in" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "enterprise"."member_asset_role" (
	"id" text PRIMARY KEY NOT NULL,
	"member_id" text,
	"user_id" text,
	"asset_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enterprise"."member_organization_role" (
	"id" text PRIMARY KEY NOT NULL,
	"member_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enterprise"."member_team_role" (
	"id" text PRIMARY KEY NOT NULL,
	"team_member_id" text NOT NULL,
	"team_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enterprise"."organization_role" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_built_in" boolean DEFAULT false NOT NULL,
	"permissions" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "enterprise"."team_role" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_built_in" boolean DEFAULT false NOT NULL,
	"permissions" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "enterprise"."invitation" RENAME COLUMN "role" TO "organization_roles";--> statement-breakpoint
ALTER TABLE "enterprise"."invitation" RENAME COLUMN "team_id" TO "team_ids";--> statement-breakpoint
ALTER TABLE "enterprise"."invitation" ADD COLUMN "team_roles" jsonb;--> statement-breakpoint
ALTER TABLE "enterprise"."platform_role" ADD COLUMN "role" text NOT NULL;--> statement-breakpoint
ALTER TABLE "enterprise"."platform_role" ADD COLUMN "description" text NOT NULL;--> statement-breakpoint
ALTER TABLE "enterprise"."platform_role" ADD COLUMN "metadata" jsonb;--> statement-breakpoint
ALTER TABLE "enterprise"."asset" ADD CONSTRAINT "asset_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "enterprise"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise"."asset" ADD CONSTRAINT "asset_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "enterprise"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise"."asset" ADD CONSTRAINT "asset_asset_type_id_asset_type_id_fk" FOREIGN KEY ("asset_type_id") REFERENCES "enterprise"."asset_type"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise"."asset" ADD CONSTRAINT "asset_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "enterprise"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise"."asset_role" ADD CONSTRAINT "asset_role_asset_type_id_asset_type_id_fk" FOREIGN KEY ("asset_type_id") REFERENCES "enterprise"."asset_type"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise"."asset_share" ADD CONSTRAINT "asset_share_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "enterprise"."asset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise"."asset_share" ADD CONSTRAINT "asset_share_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "enterprise"."member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise"."asset_share" ADD CONSTRAINT "asset_share_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "enterprise"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise"."asset_share" ADD CONSTRAINT "asset_share_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "enterprise"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise"."asset_share" ADD CONSTRAINT "asset_share_invited_by_member_id_member_id_fk" FOREIGN KEY ("invited_by_member_id") REFERENCES "enterprise"."member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise"."asset_share_link" ADD CONSTRAINT "asset_share_link_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "enterprise"."asset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise"."asset_share_link" ADD CONSTRAINT "asset_share_link_created_by_member_id_member_id_fk" FOREIGN KEY ("created_by_member_id") REFERENCES "enterprise"."member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise"."asset_type" ADD CONSTRAINT "asset_type_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "enterprise"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise"."member_asset_role" ADD CONSTRAINT "member_asset_role_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "enterprise"."member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise"."member_asset_role" ADD CONSTRAINT "member_asset_role_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "enterprise"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise"."member_asset_role" ADD CONSTRAINT "member_asset_role_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "enterprise"."asset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise"."member_organization_role" ADD CONSTRAINT "member_organization_role_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "enterprise"."member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise"."member_team_role" ADD CONSTRAINT "member_team_role_team_member_id_team_member_id_fk" FOREIGN KEY ("team_member_id") REFERENCES "enterprise"."team_member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise"."organization_role" ADD CONSTRAINT "organization_role_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "enterprise"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise"."team_role" ADD CONSTRAINT "team_role_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "enterprise"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asset_organizationId_idx" ON "enterprise"."asset" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "asset_ownerId_idx" ON "enterprise"."asset" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "asset_assetTypeId_idx" ON "enterprise"."asset" USING btree ("asset_type_id");--> statement-breakpoint
CREATE INDEX "asset_teamId_idx" ON "enterprise"."asset" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "assetRole_assetTypeId_idx" ON "enterprise"."asset_role" USING btree ("asset_type_id");--> statement-breakpoint
CREATE INDEX "assetRole_type_idx" ON "enterprise"."asset_role" USING btree ("type");--> statement-breakpoint
CREATE INDEX "assetShare_assetId_idx" ON "enterprise"."asset_share" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "assetShare_grantType_idx" ON "enterprise"."asset_share" USING btree ("grant_type");--> statement-breakpoint
CREATE INDEX "assetShare_memberId_idx" ON "enterprise"."asset_share" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "assetShare_teamId_idx" ON "enterprise"."asset_share" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "assetShare_organizationId_idx" ON "enterprise"."asset_share" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "assetShare_externalEmail_idx" ON "enterprise"."asset_share" USING btree ("external_email");--> statement-breakpoint
CREATE INDEX "assetShare_role_idx" ON "enterprise"."asset_share" USING btree ("role");--> statement-breakpoint
CREATE INDEX "assetShare_status_idx" ON "enterprise"."asset_share" USING btree ("status");--> statement-breakpoint
CREATE INDEX "assetShareLink_assetId_idx" ON "enterprise"."asset_share_link" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "assetShareLink_tokenHash_idx" ON "enterprise"."asset_share_link" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "assetType_organizationId_idx" ON "enterprise"."asset_type" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "memberAssetRole_memberId_idx" ON "enterprise"."member_asset_role" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "memberAssetRole_userId_idx" ON "enterprise"."member_asset_role" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "memberAssetRole_assetId_idx" ON "enterprise"."member_asset_role" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "memberAssetRole_role_idx" ON "enterprise"."member_asset_role" USING btree ("role");--> statement-breakpoint
CREATE INDEX "memberOrganizationRole_memberId_idx" ON "enterprise"."member_organization_role" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "memberOrganizationRole_organizationId_idx" ON "enterprise"."member_organization_role" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "memberOrganizationRole_role_idx" ON "enterprise"."member_organization_role" USING btree ("role");--> statement-breakpoint
CREATE INDEX "memberTeamRole_team_member_id_idx" ON "enterprise"."member_team_role" USING btree ("team_member_id");--> statement-breakpoint
CREATE INDEX "memberTeamRole_teamId_idx" ON "enterprise"."member_team_role" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "memberTeamRole_role_idx" ON "enterprise"."member_team_role" USING btree ("role");--> statement-breakpoint
CREATE INDEX "organizationRole_organizationId_idx" ON "enterprise"."organization_role" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "organizationRole_type_idx" ON "enterprise"."organization_role" USING btree ("type");--> statement-breakpoint
CREATE INDEX "teamRole_teamId_idx" ON "enterprise"."team_role" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "teamRole_type_idx" ON "enterprise"."team_role" USING btree ("type");--> statement-breakpoint
ALTER TABLE "enterprise"."member" DROP COLUMN "role";--> statement-breakpoint
ALTER TABLE "enterprise"."user" DROP COLUMN "role";