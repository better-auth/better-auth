import type { BetterAuthPluginDBSchema } from "@better-auth/core/db";
import type { Prettify } from "better-call";
import * as z from "zod";
import type { InferAdditionalFieldsFromPluginOptions } from "../../db";
import { generateId } from "../../utils";
import type { AssetOptions } from "./types";

const ASSET_VISIBILITIES = ["private", "internal", "public"] as const;
type AssetVisibility = (typeof ASSET_VISIBILITIES)[number];

type InferSchema<
	Schema extends BetterAuthPluginDBSchema,
	TableName extends string,
	DefaultFields,
> = {
	modelName: Schema[TableName] extends { modelName: infer M }
		? M extends string
			? M
			: string
		: string;
	fields: {
		[K in keyof DefaultFields]: DefaultFields[K];
	} & (Schema[TableName] extends { additionalFields: infer F } ? F : {});
};

interface AssetTypeDefaultFields {
	organizationId: {
		type: "string";
		required: false;
		references: {
			model: "organization";
			field: "id";
		};
		index: true;
	};
	scope: {
		type: "string";
		required: true;
		defaultValue: "organization";
	};
	name: {
		type: "string";
		required: true;
	};
	description: {
		type: "string";
		required: false;
	};
	metadata: {
		type: "json";
		required: false;
	};
	source: {
		type: "string";
		required: false;
	};
	defaultVisibility: {
		type: "string";
		required: true;
		defaultValue: "private";
	};
	allowedVisibilities: {
		type: "json";
		required: true;
	};
	isBuiltIn: {
		type: "boolean";
		required: true;
		defaultValue: false;
	};
	createdAt: {
		type: "date";
		required: true;
		defaultValue: Date;
	};
	updatedAt: {
		type: "date";
		required: false;
	};
}

interface AssetDefaultFields {
	organizationId: {
		type: "string";
		required: false;
		references: {
			model: "organization";
			field: "id";
		};
		index: true;
	};
	ownerId: {
		type: "string";
		required: true;
		references: {
			model: "user";
			field: "id";
		};
		index: true;
	};
	assetTypeId: {
		type: "string";
		required: true;
		references: {
			model: "assetType";
			field: "id";
		};
		index: true;
	};
	teamId: {
		type: "string";
		required: false;
		references: {
			model: "team";
			field: "id";
		};
		index: true;
	};
	name: {
		type: "string";
		required: true;
	};
	visibility: {
		type: "string";
		required: true;
		defaultValue: "private";
	};
	visibilityLocked: {
		type: "boolean";
		required: true;
		defaultValue: false;
	};
	metadata: {
		type: "json";
		required: false;
	};
	createdAt: {
		type: "date";
		required: true;
		defaultValue: Date;
	};
	updatedAt: {
		type: "date";
		required: false;
	};
}

interface AssetRoleDefaultFields {
	assetTypeId: {
		type: "string";
		required: true;
		references: {
			model: "assetType";
			field: "id";
		};
		index: true;
	};
	type: {
		type: "string";
		required: true;
		index: true;
	};
	name: {
		type: "string";
		required: true;
	};
	description: {
		type: "string";
		required: false;
	};
	isBuiltIn: {
		type: "boolean";
		required: true;
		defaultValue: false;
	};
	permissions: {
		type: "json";
		required: false;
	};
	createdAt: {
		type: "date";
		required: true;
		defaultValue: Date;
	};
	updatedAt: {
		type: "date";
		required: false;
	};
}

interface MemberAssetRoleDefaultFields {
	memberId: {
		type: "string";
		required: false;
		references: {
			model: "member";
			field: "id";
		};
		index: true;
	};
	userId: {
		type: "string";
		required: false;
		references: {
			model: "user";
			field: "id";
		};
		index: true;
	};
	assetId: {
		type: "string";
		required: true;
		references: {
			model: "asset";
			field: "id";
		};
		index: true;
	};
	role: {
		type: "string";
		required: true;
		index: true;
	};
	createdAt: {
		type: "date";
		required: true;
		defaultValue: Date;
	};
}

interface AssetShareDefaultFields {
	assetId: {
		type: "string";
		required: true;
		references: {
			model: "asset";
			field: "id";
		};
		index: true;
	};
	grantType: {
		type: "string";
		required: true;
		index: true;
	};
	memberId: {
		type: "string";
		required: false;
		references: {
			model: "member";
			field: "id";
			name: "invitee";
		};
		index: true;
	};
	teamId: {
		type: "string";
		required: false;
		references: {
			model: "team";
			field: "id";
		};
		index: true;
	};
	organizationId: {
		type: "string";
		required: false;
		references: {
			model: "organization";
			field: "id";
		};
		index: true;
	};
	externalEmail: {
		type: "string";
		required: false;
		index: true;
	};
	role: {
		type: "string";
		required: true;
		index: true;
	};
	status: {
		type: "string";
		required: true;
		defaultValue: "pending";
		index: true;
	};
	invitedByMemberId: {
		type: "string";
		required: false;
		references: {
			model: "member";
			field: "id";
			name: "inviter";
		};
	};
	expiresAt: {
		type: "date";
		required: false;
	};
	createdAt: {
		type: "date";
		required: true;
		defaultValue: Date;
	};
	updatedAt: {
		type: "date";
		required: false;
	};
}

interface AssetShareLinkDefaultFields {
	assetId: {
		type: "string";
		required: true;
		references: {
			model: "asset";
			field: "id";
		};
		index: true;
	};
	tokenHash: {
		type: "string";
		required: true;
		index: true;
	};
	role: {
		type: "string";
		required: true;
	};
	linkVisibility: {
		type: "string";
		required: true;
		defaultValue: "organization";
	};
	requiresAuth: {
		type: "boolean";
		required: true;
		defaultValue: true;
	};
	passwordHash: {
		type: "string";
		required: false;
	};
	expiresAt: {
		type: "date";
		required: false;
	};
	createdByMemberId: {
		type: "string";
		required: true;
		references: {
			model: "member";
			field: "id";
		};
	};
	revokedAt: {
		type: "date";
		required: false;
	};
	createdAt: {
		type: "date";
		required: true;
		defaultValue: Date;
	};
}

export type AssetSchema<O extends AssetOptions> = {
	assetType: InferSchema<
		O["schema"] extends BetterAuthPluginDBSchema ? O["schema"] : {},
		"assetType",
		AssetTypeDefaultFields
	>;
	asset: InferSchema<
		O["schema"] extends BetterAuthPluginDBSchema ? O["schema"] : {},
		"asset",
		AssetDefaultFields
	>;
	assetRole: InferSchema<
		O["schema"] extends BetterAuthPluginDBSchema ? O["schema"] : {},
		"assetRole",
		AssetRoleDefaultFields
	>;
	memberAssetRole: InferSchema<
		O["schema"] extends BetterAuthPluginDBSchema ? O["schema"] : {},
		"memberAssetRole",
		MemberAssetRoleDefaultFields
	>;
	assetShare: InferSchema<
		O["schema"] extends BetterAuthPluginDBSchema ? O["schema"] : {},
		"assetShare",
		AssetShareDefaultFields
	>;
	assetShareLink: InferSchema<
		O["schema"] extends BetterAuthPluginDBSchema ? O["schema"] : {},
		"assetShareLink",
		AssetShareLinkDefaultFields
	>;
};

export const assetTypeSchema = z
	.object({
		id: z.string().default(generateId),
		organizationId: z.string().nullable().optional(),
		scope: z.enum(["organization", "global"]).default("organization"),
		name: z.string(),
		description: z.string().optional(),
		metadata: z.record(z.string(), z.unknown()).optional(),
		source: z.string().optional(),
		defaultVisibility: z.enum(ASSET_VISIBILITIES).default("private"),
		allowedVisibilities: z
			.array(z.enum(ASSET_VISIBILITIES))
			.nonempty()
			.default(["private", "internal"]),
		isBuiltIn: z.boolean().default(false),
		createdAt: z.date().default(() => new Date()),
		updatedAt: z.date().optional(),
	})
	.refine(
		(data) => {
			// If scope is "organization", organizationId must be set
			if (data.scope === "organization" && !data.organizationId) {
				return false;
			}
			// If scope is "global", organizationId must be null
			if (data.scope === "global" && data.organizationId !== null) {
				return false;
			}
			return true;
		},
		{
			message:
				"organizationId must be set for organization-scoped types, and null for global types",
		},
	)
	.refine(
		(data) =>
			data.allowedVisibilities.includes(
				data.defaultVisibility as AssetVisibility,
			),
		{
			message:
				"defaultVisibility must be a member of allowedVisibilities for the asset type",
		},
	);

export const assetSchema = z.object({
	id: z.string().default(generateId),
	organizationId: z.string().optional(),
	ownerId: z.string(),
	assetTypeId: z.string(),
	teamId: z.string().optional(),
	name: z.string(),
	metadata: z.record(z.string(), z.unknown()).optional(),
	visibility: z.enum(ASSET_VISIBILITIES).default("private"),
	visibilityLocked: z.boolean().default(false),
	createdAt: z.date().default(() => new Date()),
	updatedAt: z.date().optional(),
});

export const assetRoleSchema = z.object({
	id: z.string().default(generateId),
	assetTypeId: z.string(),
	type: z.string(),
	name: z.string(),
	description: z.string().optional(),
	isBuiltIn: z.boolean().default(false),
	permissions: z.record(z.string(), z.unknown()).optional(),
	createdAt: z.date().default(() => new Date()),
	updatedAt: z.date().optional(),
});

export const memberAssetRoleSchema = z
	.object({
		id: z.string().default(generateId),
		memberId: z.string().optional(),
		userId: z.string().optional(),
		assetId: z.string(),
		role: z.string(),
		createdAt: z.date().default(() => new Date()),
	})
	.refine(
		(data) => {
			// Either memberId or userId must be set, but not both
			return (data.memberId !== undefined) !== (data.userId !== undefined);
		},
		{
			message: "Either memberId or userId must be set, but not both",
		},
	);

export const assetShareSchema = z
	.object({
		id: z.string().default(generateId),
		assetId: z.string(),
		grantType: z.enum([
			"member",
			"team",
			"organization",
			"external_email",
		] as const),
		memberId: z.string().optional(),
		teamId: z.string().optional(),
		organizationId: z.string().optional(),
		externalEmail: z.string().email().optional(),
		role: z.string(),
		status: z
			.enum(["pending", "active", "revoked", "expired"])
			.default("pending"),
		invitedByMemberId: z.string().optional(),
		expiresAt: z.date().optional(),
		createdAt: z.date().default(() => new Date()),
		updatedAt: z.date().optional(),
	})
	.superRefine((data, ctx) => {
		switch (data.grantType) {
			case "member":
				if (!data.memberId) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: "memberId is required when grantType = member",
						path: ["memberId"],
					});
				}
				break;
			case "team":
				if (!data.teamId) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: "teamId is required when grantType = team",
						path: ["teamId"],
					});
				}
				break;
			case "organization":
				if (!data.organizationId) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: "organizationId is required when grantType = organization",
						path: ["organizationId"],
					});
				}
				break;
			case "external_email":
				if (!data.externalEmail) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message:
							"externalEmail is required when grantType = external_email",
						path: ["externalEmail"],
					});
				}
				break;
		}
	});

export const assetShareLinkSchema = z
	.object({
		id: z.string().default(generateId),
		assetId: z.string(),
		tokenHash: z.string(),
		role: z.string(),
		linkVisibility: z
			.enum(["organization", "anyone"] as const)
			.default("organization"),
		requiresAuth: z.boolean().default(true),
		passwordHash: z.string().optional(),
		expiresAt: z.date().optional(),
		createdByMemberId: z.string(),
		revokedAt: z.date().optional(),
		createdAt: z.date().default(() => new Date()),
	})
	.refine(
		(data) => data.linkVisibility === "anyone" || data.requiresAuth === true,
		{
			message:
				"organization-scoped links must require auth; disable requiresAuth only when linkVisibility = anyone",
		},
	);

export type AssetType = z.infer<typeof assetTypeSchema>;
export type Asset = z.infer<typeof assetSchema>;
export type AssetRole = z.infer<typeof assetRoleSchema>;
export type MemberAssetRole = z.infer<typeof memberAssetRoleSchema>;
export type AssetShare = z.infer<typeof assetShareSchema>;
export type AssetShareLink = z.infer<typeof assetShareLinkSchema>;

export type AssetTypeInput = z.input<typeof assetTypeSchema>;
export type AssetInput = z.input<typeof assetSchema>;
export type AssetRoleInput = z.input<typeof assetRoleSchema>;
export type MemberAssetRoleInput = z.input<typeof memberAssetRoleSchema>;
export type AssetShareInput = z.input<typeof assetShareSchema>;
export type AssetShareLinkInput = z.input<typeof assetShareLinkSchema>;

export type InferAssetType<
	O extends AssetOptions,
	isClientSide extends boolean = true,
> = Prettify<
	AssetType &
		InferAdditionalFieldsFromPluginOptions<"assetType", O, isClientSide>
>;

export type InferAsset<
	O extends AssetOptions,
	isClientSide extends boolean = true,
> = Prettify<
	Asset & InferAdditionalFieldsFromPluginOptions<"asset", O, isClientSide>
>;

export type InferAssetRole<
	O extends AssetOptions,
	isClientSide extends boolean = true,
> = Prettify<
	AssetRole &
		InferAdditionalFieldsFromPluginOptions<"assetRole", O, isClientSide>
>;

export type InferMemberAssetRole<
	O extends AssetOptions,
	isClientSide extends boolean = true,
> = Prettify<
	MemberAssetRole &
		InferAdditionalFieldsFromPluginOptions<"memberAssetRole", O, isClientSide>
>;

export type InferAssetShare<
	O extends AssetOptions,
	isClientSide extends boolean = true,
> = Prettify<
	AssetShare &
		InferAdditionalFieldsFromPluginOptions<"assetShare", O, isClientSide>
>;

export type InferAssetShareLink<
	O extends AssetOptions,
	isClientSide extends boolean = true,
> = Prettify<
	AssetShareLink &
		InferAdditionalFieldsFromPluginOptions<"assetShareLink", O, isClientSide>
>;
