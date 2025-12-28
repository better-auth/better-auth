import { enterpriseSchema } from "./db-schema.default"
import { relations } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

export const user = enterpriseSchema.table("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires"),
  isAnonymous: boolean("is_anonymous").default(false),
  phoneNumber: text("phone_number").unique(),
  phoneNumberVerified: boolean("phone_number_verified"),
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
  actorType: text("actor_type").default("person"),
  actorId: text("actor_id"),
  userMetadata: jsonb("user_metadata"),
  appMetadata: jsonb("app_metadata"),
  invitedAt: timestamp("invited_at"),
  lastSignInAt: timestamp("last_sign_in_at"),
});

export const session = enterpriseSchema.table(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    impersonatedBy: text("impersonated_by"),
    activeOrganizationId: text("active_organization_id"),
    activeTeamId: text("active_team_id"),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = enterpriseSchema.table(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = enterpriseSchema.table(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const platformRole = enterpriseSchema.table("platform_role", {
  id: text("id").primaryKey(),
  role: text("role").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  metadata: jsonb("metadata"),
});

export const apikey = enterpriseSchema.table(
  "apikey",
  {
    id: text("id").primaryKey(),
    name: text("name"),
    start: text("start"),
    prefix: text("prefix"),
    key: text("key").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    refillInterval: integer("refill_interval"),
    refillAmount: integer("refill_amount"),
    lastRefillAt: timestamp("last_refill_at"),
    enabled: boolean("enabled").default(true),
    rateLimitEnabled: boolean("rate_limit_enabled").default(true),
    rateLimitTimeWindow: integer("rate_limit_time_window").default(86400000),
    rateLimitMax: integer("rate_limit_max").default(10),
    requestCount: integer("request_count").default(0),
    remaining: integer("remaining"),
    lastRequest: timestamp("last_request"),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
    permissions: text("permissions"),
    metadata: text("metadata"),
  },
  (table) => [
    index("apikey_key_idx").on(table.key),
    index("apikey_userId_idx").on(table.userId),
  ],
);

export const organization = enterpriseSchema.table("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  createdAt: timestamp("created_at").notNull(),
  metadata: text("metadata"),
});

export const member = enterpriseSchema.table(
  "member",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    index("member_organizationId_idx").on(table.organizationId),
    index("member_userId_idx").on(table.userId),
  ],
);

export const invitation = enterpriseSchema.table(
  "invitation",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    organizationRoles: jsonb("organization_roles"),
    teamRoles: jsonb("team_roles"),
    teamIds: text("team_ids"),
    status: text("status").default("pending").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    inviterId: text("inviter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("invitation_organizationId_idx").on(table.organizationId),
    index("invitation_email_idx").on(table.email),
  ],
);

export const organizationRole = enterpriseSchema.table(
  "organization_role",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    isBuiltIn: boolean("is_built_in").default(false).notNull(),
    permissions: jsonb("permissions"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").$onUpdate(
      () => /* @__PURE__ */ new Date(),
    ),
  },
  (table) => [
    index("organizationRole_organizationId_idx").on(table.organizationId),
    index("organizationRole_type_idx").on(table.type),
  ],
);

export const teamRole = enterpriseSchema.table(
  "team_role",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    isBuiltIn: boolean("is_built_in").default(false).notNull(),
    permissions: jsonb("permissions"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").$onUpdate(
      () => /* @__PURE__ */ new Date(),
    ),
  },
  (table) => [
    index("teamRole_teamId_idx").on(table.teamId),
    index("teamRole_type_idx").on(table.type),
  ],
);

export const memberOrganizationRole = enterpriseSchema.table(
  "member_organization_role",
  {
    id: text("id").primaryKey(),
    memberId: text("member_id")
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").notNull(),
    role: text("role").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("memberOrganizationRole_memberId_idx").on(table.memberId),
    index("memberOrganizationRole_organizationId_idx").on(table.organizationId),
    index("memberOrganizationRole_role_idx").on(table.role),
  ],
);

export const memberTeamRole = enterpriseSchema.table(
  "member_team_role",
  {
    id: text("id").primaryKey(),
    team_member_id: text("team_member_id")
      .notNull()
      .references(() => teamMember.id, { onDelete: "cascade" }),
    teamId: text("team_id").notNull(),
    role: text("role").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("memberTeamRole_team_member_id_idx").on(table.team_member_id),
    index("memberTeamRole_teamId_idx").on(table.teamId),
    index("memberTeamRole_role_idx").on(table.role),
  ],
);

export const team = enterpriseSchema.table(
  "team",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").$onUpdate(
      () => /* @__PURE__ */ new Date(),
    ),
  },
  (table) => [index("team_organizationId_idx").on(table.organizationId)],
);

export const teamMember = enterpriseSchema.table(
  "team_member",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    index("teamMember_teamId_idx").on(table.teamId),
    index("teamMember_userId_idx").on(table.userId),
  ],
);

export const oauthApplication = enterpriseSchema.table(
  "oauth_application",
  {
    id: text("id").primaryKey(),
    name: text("name"),
    icon: text("icon"),
    metadata: text("metadata"),
    clientId: text("client_id").unique(),
    clientSecret: text("client_secret"),
    redirectUrls: text("redirect_urls"),
    type: text("type"),
    disabled: boolean("disabled").default(false),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [index("oauthApplication_userId_idx").on(table.userId)],
);

export const oauthAccessToken = enterpriseSchema.table(
  "oauth_access_token",
  {
    id: text("id").primaryKey(),
    accessToken: text("access_token").unique(),
    refreshToken: text("refresh_token").unique(),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    clientId: text("client_id").references(() => oauthApplication.clientId, {
      onDelete: "cascade",
    }),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    scopes: text("scopes"),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [
    index("oauthAccessToken_clientId_idx").on(table.clientId),
    index("oauthAccessToken_userId_idx").on(table.userId),
  ],
);

export const oauthConsent = enterpriseSchema.table(
  "oauth_consent",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id").references(() => oauthApplication.clientId, {
      onDelete: "cascade",
    }),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    scopes: text("scopes"),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
    consentGiven: boolean("consent_given"),
  },
  (table) => [
    index("oauthConsent_clientId_idx").on(table.clientId),
    index("oauthConsent_userId_idx").on(table.userId),
  ],
);

export const twoFactor = enterpriseSchema.table(
  "two_factor",
  {
    id: text("id").primaryKey(),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("twoFactor_secret_idx").on(table.secret),
    index("twoFactor_userId_idx").on(table.userId),
  ],
);

export const person = enterpriseSchema.table("person", {
  id: text("id").primaryKey(),
  name: text("name"),
});

export const agent = enterpriseSchema.table("agent", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").default("custom").notNull(),
  status: text("status").default("active").notNull(),
  configuration: text("configuration"),
  ownerId: text("owner_id"),
  ownerType: text("owner_type").default("user").notNull(),
  organizationId: text("organization_id").references(() => organization.id, {
    onDelete: "set null",
  }),
  metadata: text("metadata"),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

export const assetType = enterpriseSchema.table(
  "asset_type",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").references(() => organization.id, {
      onDelete: "cascade",
    }),
    scope: text("scope").default("organization").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    metadata: jsonb("metadata"),
    source: text("source"),
    defaultVisibility: text("default_visibility").default("private").notNull(),
    allowedVisibilities: jsonb("allowed_visibilities").notNull(),
    isBuiltIn: boolean("is_built_in").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").$onUpdate(
      () => /* @__PURE__ */ new Date(),
    ),
  },
  (table) => [index("assetType_organizationId_idx").on(table.organizationId)],
);

export const asset = enterpriseSchema.table(
  "asset",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").references(() => organization.id, {
      onDelete: "cascade",
    }),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    assetTypeId: text("asset_type_id")
      .notNull()
      .references(() => assetType.id, { onDelete: "cascade" }),
    teamId: text("team_id").references(() => team.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    visibility: text("visibility").default("private").notNull(),
    visibilityLocked: boolean("visibility_locked").default(false).notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").$onUpdate(
      () => /* @__PURE__ */ new Date(),
    ),
  },
  (table) => [
    index("asset_organizationId_idx").on(table.organizationId),
    index("asset_ownerId_idx").on(table.ownerId),
    index("asset_assetTypeId_idx").on(table.assetTypeId),
    index("asset_teamId_idx").on(table.teamId),
  ],
);

export const assetRole = enterpriseSchema.table(
  "asset_role",
  {
    id: text("id").primaryKey(),
    assetTypeId: text("asset_type_id")
      .notNull()
      .references(() => assetType.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    isBuiltIn: boolean("is_built_in").default(false).notNull(),
    permissions: jsonb("permissions"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").$onUpdate(
      () => /* @__PURE__ */ new Date(),
    ),
  },
  (table) => [
    index("assetRole_assetTypeId_idx").on(table.assetTypeId),
    index("assetRole_type_idx").on(table.type),
  ],
);

export const memberAssetRole = enterpriseSchema.table(
  "member_asset_role",
  {
    id: text("id").primaryKey(),
    memberId: text("member_id").references(() => member.id, {
      onDelete: "cascade",
    }),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    assetId: text("asset_id")
      .notNull()
      .references(() => asset.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("memberAssetRole_memberId_idx").on(table.memberId),
    index("memberAssetRole_userId_idx").on(table.userId),
    index("memberAssetRole_assetId_idx").on(table.assetId),
    index("memberAssetRole_role_idx").on(table.role),
  ],
);

export const assetShare = enterpriseSchema.table(
  "asset_share",
  {
    id: text("id").primaryKey(),
    assetId: text("asset_id")
      .notNull()
      .references(() => asset.id, { onDelete: "cascade" }),
    grantType: text("grant_type").notNull(),
    memberId: text("member_id").references(() => member.id, {
      onDelete: "cascade",
    }),
    teamId: text("team_id").references(() => team.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").references(() => organization.id, {
      onDelete: "cascade",
    }),
    externalEmail: text("external_email"),
    role: text("role").notNull(),
    status: text("status").default("pending").notNull(),
    invitedByMemberId: text("invited_by_member_id").references(
      () => member.id,
      { onDelete: "cascade" },
    ),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").$onUpdate(
      () => /* @__PURE__ */ new Date(),
    ),
  },
  (table) => [
    index("assetShare_assetId_idx").on(table.assetId),
    index("assetShare_grantType_idx").on(table.grantType),
    index("assetShare_memberId_idx").on(table.memberId),
    index("assetShare_teamId_idx").on(table.teamId),
    index("assetShare_organizationId_idx").on(table.organizationId),
    index("assetShare_externalEmail_idx").on(table.externalEmail),
    index("assetShare_role_idx").on(table.role),
    index("assetShare_status_idx").on(table.status),
  ],
);

export const assetShareLink = enterpriseSchema.table(
  "asset_share_link",
  {
    id: text("id").primaryKey(),
    assetId: text("asset_id")
      .notNull()
      .references(() => asset.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    role: text("role").notNull(),
    linkVisibility: text("link_visibility").default("organization").notNull(),
    requiresAuth: boolean("requires_auth").default(true).notNull(),
    passwordHash: text("password_hash"),
    expiresAt: timestamp("expires_at"),
    createdByMemberId: text("created_by_member_id")
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("assetShareLink_assetId_idx").on(table.assetId),
    index("assetShareLink_tokenHash_idx").on(table.tokenHash),
  ],
);

export const object = enterpriseSchema.table("object", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  externalId: text("external_id"),
  externalType: text("external_type"),
  attributes: text("attributes"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at"),
});

export const relationship = enterpriseSchema.table("relationship", {
  id: text("id").primaryKey(),
  subjectId: text("subject_id")
    .notNull()
    .references(() => object.id, { onDelete: "cascade" }),
  subjectType: text("subject_type").notNull(),
  objectId: text("object_id")
    .notNull()
    .references(() => object.id, { onDelete: "cascade" }),
  objectType: text("object_type").notNull(),
  relationshipType: text("relationship_type").notNull(),
  attributes: text("attributes"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at"),
});

export const schemaDefinition = enterpriseSchema.table("schema_definition", {
  id: text("id").primaryKey(),
  version: text("version").notNull(),
  definition: text("definition").notNull(),
  isActive: boolean("is_active").default(true),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at"),
  createdBy: text("created_by").references(() => user.id, {
    onDelete: "set null",
  }),
});

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  apikeys: many(apikey),
  members: many(member),
  invitations: many(invitation),
  teamMembers: many(teamMember),
  oauthApplications: many(oauthApplication),
  oauthAccessTokens: many(oauthAccessToken),
  oauthConsents: many(oauthConsent),
  twoFactors: many(twoFactor),
  assets: many(asset),
  memberAssetRoles: many(memberAssetRole),
  schemaDefinitions: many(schemaDefinition),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const apikeyRelations = relations(apikey, ({ one }) => ({
  user: one(user, {
    fields: [apikey.userId],
    references: [user.id],
  }),
}));

export const organizationRelations = relations(organization, ({ many }) => ({
  members: many(member),
  invitations: many(invitation),
  organizationRoles: many(organizationRole),
  teams: many(team),
  agents: many(agent),
  assetTypes: many(assetType),
  assets: many(asset),
  assetShares: many(assetShare),
}));

export const memberRelations = relations(member, ({ one, many }) => ({
  organization: one(organization, {
    fields: [member.organizationId],
    references: [organization.id],
  }),
  user: one(user, {
    fields: [member.userId],
    references: [user.id],
  }),
  memberOrganizationRoles: many(memberOrganizationRole),
  memberAssetRoles: many(memberAssetRole),
  inviteeAssetShares: many(assetShare, { relationName: "invitee" }),
  inviterAssetShares: many(assetShare, { relationName: "inviter" }),
  assetShareLinks: many(assetShareLink),
}));

export const invitationRelations = relations(invitation, ({ one }) => ({
  organization: one(organization, {
    fields: [invitation.organizationId],
    references: [organization.id],
  }),
  user: one(user, {
    fields: [invitation.inviterId],
    references: [user.id],
  }),
}));

export const organizationRoleRelations = relations(
  organizationRole,
  ({ one }) => ({
    organization: one(organization, {
      fields: [organizationRole.organizationId],
      references: [organization.id],
    }),
  }),
);

export const teamRoleRelations = relations(teamRole, ({ one }) => ({
  team: one(team, {
    fields: [teamRole.teamId],
    references: [team.id],
  }),
}));

export const memberOrganizationRoleRelations = relations(
  memberOrganizationRole,
  ({ one }) => ({
    member: one(member, {
      fields: [memberOrganizationRole.memberId],
      references: [member.id],
    }),
  }),
);

export const memberTeamRoleRelations = relations(memberTeamRole, ({ one }) => ({
  teamMember: one(teamMember, {
    fields: [memberTeamRole.team_member_id],
    references: [teamMember.id],
  }),
}));

export const teamRelations = relations(team, ({ one, many }) => ({
  organization: one(organization, {
    fields: [team.organizationId],
    references: [organization.id],
  }),
  teamRoles: many(teamRole),
  teamMembers: many(teamMember),
  assets: many(asset),
  assetShares: many(assetShare),
}));

export const teamMemberRelations = relations(teamMember, ({ one, many }) => ({
  team: one(team, {
    fields: [teamMember.teamId],
    references: [team.id],
  }),
  user: one(user, {
    fields: [teamMember.userId],
    references: [user.id],
  }),
  memberTeamRoles: many(memberTeamRole),
}));

export const oauthApplicationRelations = relations(
  oauthApplication,
  ({ one, many }) => ({
    user: one(user, {
      fields: [oauthApplication.userId],
      references: [user.id],
    }),
    oauthAccessTokens: many(oauthAccessToken),
    oauthConsents: many(oauthConsent),
  }),
);

export const oauthAccessTokenRelations = relations(
  oauthAccessToken,
  ({ one }) => ({
    oauthApplication: one(oauthApplication, {
      fields: [oauthAccessToken.clientId],
      references: [oauthApplication.clientId],
    }),
    user: one(user, {
      fields: [oauthAccessToken.userId],
      references: [user.id],
    }),
  }),
);

export const oauthConsentRelations = relations(oauthConsent, ({ one }) => ({
  oauthApplication: one(oauthApplication, {
    fields: [oauthConsent.clientId],
    references: [oauthApplication.clientId],
  }),
  user: one(user, {
    fields: [oauthConsent.userId],
    references: [user.id],
  }),
}));

export const twoFactorRelations = relations(twoFactor, ({ one }) => ({
  user: one(user, {
    fields: [twoFactor.userId],
    references: [user.id],
  }),
}));

export const agentRelations = relations(agent, ({ one }) => ({
  organization: one(organization, {
    fields: [agent.organizationId],
    references: [organization.id],
  }),
}));

export const assetTypeRelations = relations(assetType, ({ one, many }) => ({
  organization: one(organization, {
    fields: [assetType.organizationId],
    references: [organization.id],
  }),
  assets: many(asset),
  assetRoles: many(assetRole),
}));

export const assetRelations = relations(asset, ({ one, many }) => ({
  organization: one(organization, {
    fields: [asset.organizationId],
    references: [organization.id],
  }),
  user: one(user, {
    fields: [asset.ownerId],
    references: [user.id],
  }),
  assetType: one(assetType, {
    fields: [asset.assetTypeId],
    references: [assetType.id],
  }),
  team: one(team, {
    fields: [asset.teamId],
    references: [team.id],
  }),
  memberAssetRoles: many(memberAssetRole),
  assetShares: many(assetShare),
  assetShareLinks: many(assetShareLink),
}));

export const assetRoleRelations = relations(assetRole, ({ one }) => ({
  assetType: one(assetType, {
    fields: [assetRole.assetTypeId],
    references: [assetType.id],
  }),
}));

export const memberAssetRoleRelations = relations(
  memberAssetRole,
  ({ one }) => ({
    member: one(member, {
      fields: [memberAssetRole.memberId],
      references: [member.id],
    }),
    user: one(user, {
      fields: [memberAssetRole.userId],
      references: [user.id],
    }),
    asset: one(asset, {
      fields: [memberAssetRole.assetId],
      references: [asset.id],
    }),
  }),
);

export const assetShareRelations = relations(assetShare, ({ one }) => ({
  asset: one(asset, {
    fields: [assetShare.assetId],
    references: [asset.id],
  }),
  invitee: one(member, {
    fields: [assetShare.memberId],
    references: [member.id],
    relationName: "invitee",
  }),
  team: one(team, {
    fields: [assetShare.teamId],
    references: [team.id],
  }),
  organization: one(organization, {
    fields: [assetShare.organizationId],
    references: [organization.id],
  }),
  inviter: one(member, {
    fields: [assetShare.invitedByMemberId],
    references: [member.id],
    relationName: "inviter",
  }),
}));

export const assetShareLinkRelations = relations(assetShareLink, ({ one }) => ({
  asset: one(asset, {
    fields: [assetShareLink.assetId],
    references: [asset.id],
  }),
  member: one(member, {
    fields: [assetShareLink.createdByMemberId],
    references: [member.id],
  }),
}));

export const objectRelations = relations(object, ({ many }) => ({
  subjectRelationships: many(relationship, { relationName: "subject" }),
  objectRelationships: many(relationship, { relationName: "object" }),
}));

export const relationshipRelations = relations(relationship, ({ one }) => ({
  subject: one(object, {
    fields: [relationship.subjectId],
    references: [object.id],
    relationName: "subject",
  }),
  object: one(object, {
    fields: [relationship.objectId],
    references: [object.id],
    relationName: "object",
  }),
}));

export const schemaDefinitionRelations = relations(
  schemaDefinition,
  ({ one }) => ({
    user: one(user, {
      fields: [schemaDefinition.createdBy],
      references: [user.id],
    }),
  }),
);
