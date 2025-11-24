import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "better-call";
import * as z from "zod";
import { getSessionFromCtx, sessionMiddleware } from "../../../api";
import type { InferAdditionalFieldsFromPluginOptions } from "../../../db";
import { toZodSchema } from "../../../db";
import { getAssetAdapter } from "../adapter";
import { ASSET_ERROR_CODES } from "../error-codes";
import type { AssetInput } from "../schema";
import type { AssetOptions } from "../types";
import { withTransaction } from "@better-auth/core/context";
import { orgMiddleware, orgSessionMiddleware } from "../../organization/call";

const ASSET_VISIBILITY_VALUES = ["private", "internal", "public"] as const;
const assetVisibilityEnum = z.enum(ASSET_VISIBILITY_VALUES);
type AssetVisibility = (typeof ASSET_VISIBILITY_VALUES)[number];
const fallbackAllowedVisibilities: AssetVisibility[] = ["private", "internal"];
const isAssetVisibility = (value: unknown): value is AssetVisibility =>
	typeof value === "string" &&
	ASSET_VISIBILITY_VALUES.includes(value as AssetVisibility);
const normalizeAllowedVisibilityInput = (
	value?: AssetVisibility[],
): AssetVisibility[] =>
	value && value.length > 0 ? value : [...fallbackAllowedVisibilities];
const normalizeStoredAllowedVisibilities = (
	value: unknown,
): AssetVisibility[] => {
	if (!Array.isArray(value)) {
		return [...fallbackAllowedVisibilities];
	}
	const filtered = value.filter(isAssetVisibility);
	return filtered.length > 0 ? filtered : [...fallbackAllowedVisibilities];
};
const resolveVisibilityWithAllowed = (
	value: unknown,
	allowedVisibilities: AssetVisibility[],
): AssetVisibility => {
	if (isAssetVisibility(value) && allowedVisibilities.includes(value)) {
		return value;
	}
	return allowedVisibilities[0] ?? "private";
};

const assetShareGrantEnum = z.enum([
	"member",
	"team",
	"organization",
	"external_email",
] as const);

// Asset Type Endpoints

export const createAssetType = <O extends AssetOptions>(
	options?: O | undefined,
) => {
	const additionalFieldsSchema = toZodSchema({
		fields: options?.schema?.assetType?.additionalFields || {},
		isClientSide: true,
	});
	const baseSchema = z.object({
		name: z.string().min(1),
		description: z.string().optional(),
		scope: z.enum(["organization", "global"]).default("organization"),
		organizationId: z.string().optional(),
		metadata: z.record(z.string(), z.any()).optional(),
		source: z.string().optional(),
		defaultVisibility: assetVisibilityEnum.optional(),
		allowedVisibilities: z.array(assetVisibilityEnum).optional(),
	});

	type Body = InferAdditionalFieldsFromPluginOptions<"assetType", O> &
		z.infer<typeof baseSchema>;

	return createAuthEndpoint(
		"/assets/create-asset-type",
		{
			method: "POST",
			body: z.object({
				...baseSchema.shape,
				...additionalFieldsSchema.shape,
			}),
			middleware: [sessionMiddleware, orgMiddleware, orgSessionMiddleware],
			metadata: {
				$Infer: {
					body: {} as Body,
				},
			},
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session) {
				throw new APIError("UNAUTHORIZED");
			}

			const adapter = getAssetAdapter(ctx.context, options);
			const organizationId =
				ctx.body.organizationId || session.session.activeOrganizationId;

			// Validate scope and organizationId
			if (ctx.body.scope === "organization" && !organizationId) {
				throw new APIError("BAD_REQUEST", {
					message: ASSET_ERROR_CODES.ORGANIZATION_REQUIRED,
				});
			}

			const allowedVisibilities = normalizeAllowedVisibilityInput(
				ctx.body.allowedVisibilities,
			);
			const defaultVisibility: AssetVisibility =
				ctx.body.defaultVisibility ?? allowedVisibilities[0] ?? "private";

			if (!allowedVisibilities.includes(defaultVisibility)) {
				throw new APIError("BAD_REQUEST", {
					message:
						"defaultVisibility must exist within allowedVisibilities for the asset type",
				});
			}

			const assetType = await adapter.createAssetType({
				assetType: {
					...ctx.body,
					defaultVisibility,
					allowedVisibilities,
					organizationId: ctx.body.scope === "global" ? null : organizationId,
				},
			});

			return ctx.json(assetType);
		},
	);
};

export const listAssetTypes = <O extends AssetOptions>(
	options?: O | undefined,
) =>
	createAuthEndpoint(
		"/assets/list-asset-types",
		{
			method: "GET",
			query: z.object({
				organizationId: z.string().optional(),
				scope: z.enum(["organization", "global"]).optional(),
				limit: z.coerce.number().optional(),
				offset: z.coerce.number().optional(),
			}),
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			const adapter = getAssetAdapter(ctx.context, options);

			const organizationId =
				ctx.query.organizationId || session?.session.activeOrganizationId;

			const assetTypes = await adapter.listAssetTypes({
				organizationId,
				scope: ctx.query.scope,
				limit: ctx.query.limit,
				offset: ctx.query.offset,
			});

			return ctx.json(assetTypes);
		},
	);

export const updateAssetType = <O extends AssetOptions>(
	options?: O | undefined,
) => {
	const additionalFieldsSchema = toZodSchema({
		fields: options?.schema?.assetType?.additionalFields || {},
		isClientSide: true,
	});
	type Body = {
		data: {
			name?: string | undefined;
			description?: string | undefined;
			metadata?: Record<string, any> | undefined;
			defaultVisibility?: z.infer<typeof assetVisibilityEnum>;
			allowedVisibilities?: z.infer<typeof assetVisibilityEnum>[];
		} & Partial<InferAdditionalFieldsFromPluginOptions<"assetType", O>>;
		id: string;
	};
	return createAuthEndpoint(
		"/assets/update-asset-type",
		{
			method: "POST",
			body: z.object({
				data: z
					.object({
						...additionalFieldsSchema.shape,
						name: z
							.string()
							.min(1)
							.meta({
								description: "The name of the asset type",
							})
							.optional(),
						description: z
							.string()
							.meta({
								description: "The description of the asset type",
							})
							.optional(),
						metadata: z
							.record(z.string(), z.any())
							.meta({
								description: "The metadata of the asset type",
							})
							.optional(),
						defaultVisibility: assetVisibilityEnum.optional(),
						allowedVisibilities: z.array(assetVisibilityEnum).min(1).optional(),
					})
					.partial(),
				id: z.string().meta({
					description: 'The asset type ID. Eg: "asset-type-id"',
				}),
			}),
			requireHeaders: true,
			use: [orgMiddleware, orgSessionMiddleware],
			metadata: {
				$Infer: {
					body: {} as Body,
				},
				openapi: {
					description: "Update an asset type",
					responses: {
						"200": {
							description: "Success",
							content: {
								"application/json": {
									schema: {
										type: "object",
										description: "The updated asset type",
										$ref: "#/components/schemas/AssetType",
									},
								},
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session) {
				throw new APIError("UNAUTHORIZED", {
					message: "User not found",
				});
			}

			const adapter = getAssetAdapter(ctx.context, options);
			const { id, data } = ctx.body;

			const existing = await adapter.findAssetTypeById(id);
			if (!existing) {
				throw new APIError("NOT_FOUND", {
					message: ASSET_ERROR_CODES.ASSET_TYPE_NOT_FOUND,
				});
			}

			const existingAllowed = normalizeStoredAllowedVisibilities(
				existing.allowedVisibilities,
			);
			const nextAllowed =
				data.allowedVisibilities && data.allowedVisibilities.length > 0
					? normalizeAllowedVisibilityInput(data.allowedVisibilities)
					: existingAllowed;
			const nextDefault = resolveVisibilityWithAllowed(
				data.defaultVisibility ?? existing.defaultVisibility,
				nextAllowed,
			);

			if (
				data.defaultVisibility &&
				!nextAllowed.includes(data.defaultVisibility)
			) {
				throw new APIError("BAD_REQUEST", {
					message:
						"defaultVisibility must exist within allowedVisibilities for the asset type",
				});
			}

			// Type assertion needed because adapter expects metadata as string,
			// but we accept Record<string, any> and the adapter converts it
			const updated = await adapter.updateAssetType(id, {
				...data,
				defaultVisibility: nextDefault,
				allowedVisibilities:
					data.allowedVisibilities !== undefined ? nextAllowed : undefined,
			} as any);
			if (!updated) {
				throw new APIError("NOT_FOUND", {
					message: ASSET_ERROR_CODES.ASSET_TYPE_NOT_FOUND,
				});
			}

			return ctx.json(updated);
		},
	);
};

export const deleteAssetType = <O extends AssetOptions>(
	options?: O | undefined,
) =>
	createAuthEndpoint(
		"/assets/delete-asset-type",
		{
			method: "POST",
			body: z.object({
				id: z.string(),
			}),
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session) {
				throw new APIError("UNAUTHORIZED");
			}

			const adapter = getAssetAdapter(ctx.context, options);
			await adapter.deleteAssetType(ctx.body.id);

			return ctx.json({ success: true });
		},
	);

// Asset Endpoints

export const createAsset = <O extends AssetOptions>(
	options?: O | undefined,
) => {
	const additionalFieldsSchema = toZodSchema({
		fields: options?.schema?.asset?.additionalFields || {},
		isClientSide: true,
	});
	const baseSchema = z.object({
		name: z.string().min(1),
		assetTypeId: z.string(),
		organizationId: z.string().optional(),
		teamId: z.string().optional(),
		metadata: z.record(z.string(), z.any()).optional(),
		visibility: assetVisibilityEnum.optional(),
	});

	type Body = InferAdditionalFieldsFromPluginOptions<"asset", O> &
		z.infer<typeof baseSchema>;

	return createAuthEndpoint(
		"/assets/create",
		{
			method: "POST",
			body: z.object({
				...baseSchema.shape,
				...additionalFieldsSchema.shape,
			}),
			metadata: {
				$Infer: {
					body: {} as Body,
				},
			},
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session) {
				throw new APIError("UNAUTHORIZED");
			}

			const adapter = getAssetAdapter(ctx.context, options);
			const organizationId =
				ctx.body.organizationId || session.session.activeOrganizationId;

			const assetType = await adapter.findAssetTypeById(ctx.body.assetTypeId);
			if (!assetType) {
				throw new APIError("BAD_REQUEST", {
					message: ASSET_ERROR_CODES.ASSET_TYPE_NOT_FOUND,
				});
			}

			const allowedVisibilities: AssetVisibility[] =
				(assetType.allowedVisibilities as AssetVisibility[] | undefined) ??
				fallbackAllowedVisibilities;
			const requestedVisibility: AssetVisibility =
				ctx.body.visibility ??
				(assetType.defaultVisibility as AssetVisibility | undefined) ??
				"private";

			if (!allowedVisibilities.includes(requestedVisibility)) {
				throw new APIError("BAD_REQUEST", {
					message: "Requested visibility is not allowed for this asset type",
				});
			}

			if (
				(requestedVisibility === "internal" ||
					requestedVisibility === "public") &&
				!organizationId
			) {
				throw new APIError("BAD_REQUEST", {
					message:
						"organizationId is required for internal or public asset visibility",
				});
			}

			const asset = await adapter.createAsset({
				asset: {
					...ctx.body,
					visibility: requestedVisibility,
					ownerId: session.user.id,
					organizationId,
				},
			});

			return ctx.json(asset);
		},
	);
};

export const listAssets = <O extends AssetOptions>(options?: O | undefined) =>
	createAuthEndpoint(
		"/assets/list",
		{
			method: "GET",
			query: z.object({
				organizationId: z.string().optional(),
				ownerId: z.string().optional(),
				assetTypeId: z.string().optional(),
				teamId: z.string().optional(),
				limit: z.coerce.number().optional(),
				offset: z.coerce.number().optional(),
			}),
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			const adapter = getAssetAdapter(ctx.context, options);

			const organizationId =
				ctx.query.organizationId || session?.session.activeOrganizationId;

			const assets = await adapter.listAssets({
				organizationId,
				ownerId: ctx.query.ownerId,
				assetTypeId: ctx.query.assetTypeId,
				teamId: ctx.query.teamId,
				limit: ctx.query.limit,
				offset: ctx.query.offset,
			});

			return ctx.json(assets);
		},
	);

export const getAsset = <O extends AssetOptions>(options?: O | undefined) =>
	createAuthEndpoint(
		"/assets/get",
		{
			method: "GET",
			query: z.object({
				id: z.string(),
			}),
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session) {
				throw new APIError("UNAUTHORIZED");
			}

			const adapter = getAssetAdapter(ctx.context, options);
			const asset = await adapter.findAssetById(ctx.query.id);

			if (!asset) {
				throw new APIError("NOT_FOUND", {
					message: ASSET_ERROR_CODES.ASSET_NOT_FOUND,
				});
			}

			return ctx.json(asset);
		},
	);

export const updateAsset = <O extends AssetOptions>(
	options?: O | undefined,
) => {
	const additionalFieldsSchema = toZodSchema({
		fields: options?.schema?.asset?.additionalFields || {},
		isClientSide: true,
	});
	type Body = {
		data: {
			name?: string | undefined;
			metadata?: Record<string, any> | undefined;
			visibility?: z.infer<typeof assetVisibilityEnum>;
			visibilityLocked?: boolean;
		} & Partial<InferAdditionalFieldsFromPluginOptions<"asset", O>>;
		id: string;
	};
	return createAuthEndpoint(
		"/assets/update",
		{
			method: "POST",
			body: z.object({
				data: z
					.object({
						...additionalFieldsSchema.shape,
						name: z
							.string()
							.min(1)
							.meta({
								description: "The name of the asset",
							})
							.optional(),
						metadata: z
							.record(z.string(), z.any())
							.meta({
								description: "The metadata of the asset",
							})
							.optional(),
						visibility: assetVisibilityEnum
							.meta({
								description: "Desired asset visibility",
							})
							.optional(),
						visibilityLocked: z
							.boolean()
							.meta({
								description:
									"Lock flag preventing editors from changing visibility",
							})
							.optional(),
					})
					.partial(),
				id: z.string().meta({
					description: 'The asset ID. Eg: "asset-id"',
				}),
			}),
			requireHeaders: true,
			use: [orgMiddleware, orgSessionMiddleware],
			metadata: {
				$Infer: {
					body: {} as Body,
				},
				openapi: {
					description: "Update an asset",
					responses: {
						"200": {
							description: "Success",
							content: {
								"application/json": {
									schema: {
										type: "object",
										description: "The updated asset",
										$ref: "#/components/schemas/Asset",
									},
								},
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session) {
				throw new APIError("UNAUTHORIZED", {
					message: "User not found",
				});
			}

			const adapter = getAssetAdapter(ctx.context, options);
			const { id, data } = ctx.body;

			const existingAsset = await adapter.findAssetById(id);
			if (!existingAsset) {
				throw new APIError("NOT_FOUND", {
					message: ASSET_ERROR_CODES.ASSET_NOT_FOUND,
				});
			}

			if (existingAsset.visibilityLocked && data.visibility !== undefined) {
				throw new APIError("FORBIDDEN", {
					message: "Visibility is locked for this asset",
				});
			}

			let nextVisibility: AssetVisibility =
				(existingAsset.visibility as AssetVisibility | undefined) ?? "private";
			if (data.visibility !== undefined) {
				nextVisibility = data.visibility as AssetVisibility;
			}

			if (nextVisibility) {
				const assetType = await adapter.findAssetTypeById(
					existingAsset.assetTypeId,
				);
				if (!assetType) {
					throw new APIError("BAD_REQUEST", {
						message: ASSET_ERROR_CODES.ASSET_TYPE_NOT_FOUND,
					});
				}

				const allowedVisibilities: AssetVisibility[] =
					(assetType.allowedVisibilities as AssetVisibility[] | undefined) ??
					fallbackAllowedVisibilities;

				if (!allowedVisibilities.includes(nextVisibility)) {
					throw new APIError("BAD_REQUEST", {
						message: "Requested visibility is not allowed for this asset type",
					});
				}

				if (
					(nextVisibility === "internal" || nextVisibility === "public") &&
					!existingAsset.organizationId
				) {
					throw new APIError("BAD_REQUEST", {
						message:
							"organizationId is required for internal or public asset visibility",
					});
				}
			}

			const { visibility, ...restData } = data;
			const updatePayload: Partial<AssetInput> = {
				...(restData as Partial<AssetInput>),
				...(visibility !== undefined ? { visibility } : {}),
			};

			const updated = await adapter.updateAsset(id, updatePayload);
			if (!updated) {
				throw new APIError("NOT_FOUND", {
					message: ASSET_ERROR_CODES.ASSET_NOT_FOUND,
				});
			}

			return ctx.json(updated);
		},
	);
};

export const deleteAsset = <O extends AssetOptions>(options?: O | undefined) =>
	createAuthEndpoint(
		"/assets/delete",
		{
			method: "POST",
			body: z.object({
				id: z.string(),
			}),
		},
		withTransaction(async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session) {
				throw new APIError("UNAUTHORIZED");
			}

			const adapter = getAssetAdapter(ctx.context, options);
			await adapter.deleteAsset(ctx.body.id);

			return ctx.json({ success: true });
		}),
	);

// Asset Role Endpoints

export const createAssetRole = <O extends AssetOptions>(
	options?: O | undefined,
) => {
	const additionalFieldsSchema = toZodSchema({
		fields: options?.schema?.assetRole?.additionalFields || {},
		isClientSide: true,
	});
	const baseSchema = z.object({
		assetTypeId: z.string(),
		type: z.string(),
		name: z.string(),
		description: z.string().optional(),
		permissions: z.record(z.string(), z.any()).optional(),
	});

	return createAuthEndpoint(
		"/assets/create-asset-role",
		{
			method: "POST",
			body: z.object({
				...baseSchema.shape,
				...additionalFieldsSchema.shape,
			}),
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session) {
				throw new APIError("UNAUTHORIZED");
			}

			const adapter = getAssetAdapter(ctx.context, options);
			const assetRole = await adapter.createAssetRole({
				assetRole: ctx.body,
			});

			return ctx.json(assetRole);
		},
	);
};

export const listAssetRoles = <O extends AssetOptions>(
	options?: O | undefined,
) =>
	createAuthEndpoint(
		"/assets/list-asset-roles",
		{
			method: "GET",
			query: z.object({
				assetTypeId: z.string(),
			}),
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session) {
				throw new APIError("UNAUTHORIZED");
			}

			const adapter = getAssetAdapter(ctx.context, options);
			const roles = await adapter.getAssetRolesByAssetType(
				ctx.query.assetTypeId,
			);

			return ctx.json(roles);
		},
	);

export const updateAssetRole = <O extends AssetOptions>(
	options?: O | undefined,
) => {
	const additionalFieldsSchema = toZodSchema({
		fields: options?.schema?.assetRole?.additionalFields || {},
		isClientSide: true,
	});
	type Body = {
		data: {
			name?: string | undefined;
			description?: string | undefined;
			permissions?: Record<string, any> | undefined;
		} & Partial<InferAdditionalFieldsFromPluginOptions<"assetRole", O>>;
		id: string;
	};
	return createAuthEndpoint(
		"/assets/update-asset-role",
		{
			method: "POST",
			body: z.object({
				data: z
					.object({
						...additionalFieldsSchema.shape,
						name: z
							.string()
							.meta({
								description: "The name of the asset role",
							})
							.optional(),
						description: z
							.string()
							.meta({
								description: "The description of the asset role",
							})
							.optional(),
						permissions: z
							.record(z.string(), z.any())
							.meta({
								description: "The permissions of the asset role",
							})
							.optional(),
					})
					.partial(),
				id: z.string().meta({
					description: 'The asset role ID. Eg: "asset-role-id"',
				}),
			}),
			requireHeaders: true,
			use: [orgMiddleware, orgSessionMiddleware],
			metadata: {
				$Infer: {
					body: {} as Body,
				},
				openapi: {
					description: "Update an asset role",
					responses: {
						"200": {
							description: "Success",
							content: {
								"application/json": {
									schema: {
										type: "object",
										description: "The updated asset role",
										$ref: "#/components/schemas/AssetRole",
									},
								},
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session) {
				throw new APIError("UNAUTHORIZED", {
					message: "User not found",
				});
			}

			const adapter = getAssetAdapter(ctx.context, options);
			const { id, data } = ctx.body;

			const updated = await adapter.updateAssetRole(id, data);
			if (!updated) {
				throw new APIError("NOT_FOUND", {
					message: ASSET_ERROR_CODES.ASSET_ROLE_NOT_FOUND,
				});
			}

			return ctx.json(updated);
		},
	);
};

export const deleteAssetRole = <O extends AssetOptions>(
	options?: O | undefined,
) =>
	createAuthEndpoint(
		"/assets/delete-asset-role",
		{
			method: "POST",
			body: z.object({
				id: z.string(),
			}),
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session) {
				throw new APIError("UNAUTHORIZED");
			}

			const adapter = getAssetAdapter(ctx.context, options);
			await adapter.deleteAssetRole(ctx.body.id);

			return ctx.json({ success: true });
		},
	);

// Member Asset Role Endpoints

export const assignAssetRoles = <O extends AssetOptions>(
	options?: O | undefined,
) =>
	createAuthEndpoint(
		"/assets/assign-roles",
		{
			method: "POST",
			body: z.object({
				assetId: z.string(),
				roles: z.array(z.string()),
				memberId: z.string().optional(),
				userId: z.string().optional(),
			}),
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session) {
				throw new APIError("UNAUTHORIZED");
			}

			const adapter = getAssetAdapter(ctx.context, options);
			await adapter.assignAssetRolesToMember(
				ctx.body.memberId,
				ctx.body.userId,
				ctx.body.assetId,
				ctx.body.roles,
			);

			return ctx.json({ success: true });
		},
	);

export const removeAssetRoles = <O extends AssetOptions>(
	options?: O | undefined,
) =>
	createAuthEndpoint(
		"/assets/remove-roles",
		{
			method: "POST",
			body: z.object({
				assetId: z.string(),
				roles: z.array(z.string()),
				memberId: z.string().optional(),
				userId: z.string().optional(),
			}),
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session) {
				throw new APIError("UNAUTHORIZED");
			}

			const adapter = getAssetAdapter(ctx.context, options);
			await adapter.removeAssetRolesFromMember(
				ctx.body.memberId,
				ctx.body.userId,
				ctx.body.assetId,
				ctx.body.roles,
			);

			return ctx.json({ success: true });
		},
	);

export const getAssetMembers = <O extends AssetOptions>(
	options?: O | undefined,
) =>
	createAuthEndpoint(
		"/assets/get-members",
		{
			method: "GET",
			query: z.object({
				assetId: z.string(),
			}),
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session) {
				throw new APIError("UNAUTHORIZED");
			}

			const adapter = getAssetAdapter(ctx.context, options);
			const members = await adapter.getAssetMembers(ctx.query.assetId);

			return ctx.json(members);
		},
	);

const shareAssetSchema = z
	.object({
		assetId: z.string(),
		role: z.string(),
		grantType: assetShareGrantEnum,
		memberId: z.string().optional(),
		teamId: z.string().optional(),
		organizationId: z.string().optional(),
		externalEmail: z.string().email().optional(),
		expiresAt: z.coerce.date().optional(),
	})
	.superRefine((value, ctx) => {
		switch (value.grantType) {
			case "member":
				if (!value.memberId) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: "memberId is required when grantType is member",
						path: ["memberId"],
					});
				}
				break;
			case "team":
				if (!value.teamId) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: "teamId is required when grantType is team",
						path: ["teamId"],
					});
				}
				break;
			case "organization":
				if (!value.organizationId) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message:
							"organizationId is required when grantType is organization",
						path: ["organizationId"],
					});
				}
				break;
			case "external_email":
				if (!value.externalEmail) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message:
							"externalEmail is required when grantType is external_email",
						path: ["externalEmail"],
					});
				}
				break;
		}
	});

export const shareAsset = <O extends AssetOptions>(options?: O | undefined) =>
	createAuthEndpoint(
		"/assets/share",
		{
			method: "POST",
			body: shareAssetSchema,
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session) {
				throw new APIError("UNAUTHORIZED");
			}

			const adapter = getAssetAdapter(ctx.context, options);
			const asset = await adapter.findAssetById(ctx.body.assetId);

			if (!asset) {
				throw new APIError("NOT_FOUND", {
					message: ASSET_ERROR_CODES.ASSET_NOT_FOUND,
				});
			}

			const matchingRoles = await adapter.getAssetRolesByTypes(
				asset.assetTypeId,
				[ctx.body.role],
			);

			if (!matchingRoles.length) {
				throw new APIError("BAD_REQUEST", {
					message: ASSET_ERROR_CODES.ASSET_ROLE_NOT_FOUND,
				});
			}

			const share = await adapter.createAssetShare({
				share: {
					...ctx.body,
					status: "active",
				},
			});

			if (ctx.body.grantType === "member" && ctx.body.memberId) {
				const existingMemberRoles = await adapter.getMemberAssetRoles(
					ctx.body.memberId,
					undefined,
					ctx.body.assetId,
				);
				const nextRoles = Array.from(
					new Set([...(existingMemberRoles || []), ctx.body.role]),
				);
				await adapter.assignAssetRolesToMember(
					ctx.body.memberId,
					undefined,
					ctx.body.assetId,
					nextRoles,
				);
			}

			return ctx.json(share);
		},
	);

export const listAssetShares = <O extends AssetOptions>(
	options?: O | undefined,
) =>
	createAuthEndpoint(
		"/assets/list-shares",
		{
			method: "GET",
			query: z.object({
				assetId: z.string(),
			}),
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session) {
				throw new APIError("UNAUTHORIZED");
			}

			const adapter = getAssetAdapter(ctx.context, options);
			const shares = await adapter.listAssetShares(ctx.query.assetId);

			return ctx.json(shares);
		},
	);

export const revokeAssetShare = <O extends AssetOptions>(
	options?: O | undefined,
) =>
	createAuthEndpoint(
		"/assets/revoke-share",
		{
			method: "POST",
			body: z.object({
				id: z.string(),
			}),
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session) {
				throw new APIError("UNAUTHORIZED");
			}

			const adapter = getAssetAdapter(ctx.context, options);
			const share = await adapter.findAssetShareById(ctx.body.id);

			if (!share) {
				throw new APIError("NOT_FOUND", {
					message: "Asset share not found",
				});
			}

			await adapter.updateAssetShareStatus(ctx.body.id, "revoked");

			if (share.grantType === "member" && share.memberId) {
				await adapter.removeAssetRolesFromMember(
					share.memberId,
					undefined,
					share.assetId,
					[share.role],
				);
			}

			return ctx.json({ success: true });
		},
	);
