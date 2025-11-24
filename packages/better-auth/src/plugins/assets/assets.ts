import type { AuthContext, BetterAuthPlugin } from "@better-auth/core";
import type { BetterAuthPluginDBSchema } from "@better-auth/core/db";
import { ASSET_ERROR_CODES } from "./error-codes";
import {
	assignAssetRoles,
	createAsset,
	createAssetRole,
	createAssetType,
	deleteAsset,
	deleteAssetRole,
	deleteAssetType,
	getAsset,
	getAssetMembers,
	listAssetRoles,
	listAssetTypes,
	listAssets,
	listAssetShares,
	removeAssetRoles,
	revokeAssetShare,
	shareAsset,
	updateAsset,
	updateAssetRole,
	updateAssetType,
} from "./routes/crud-assets";
import type {
	AssetRoleInput,
	AssetSchema,
	AssetTypeInput,
	InferAsset,
	InferAssetRole,
	InferAssetType,
} from "./schema";
import type { AssetOptions } from "./types";
import { getCurrentAdapter } from "@better-auth/core/context";

const BUILTIN_ASSET_VISIBILITIES = ["private", "internal", "public"] as const;
type BuiltinAssetVisibility = (typeof BUILTIN_ASSET_VISIBILITIES)[number];
const normalizeAllowedVisibilities = (
	value?: string[],
): BuiltinAssetVisibility[] => {
	if (!Array.isArray(value) || value.length === 0) {
		return ["private", "internal"];
	}
	const valid = value.filter(
		(visibility): visibility is BuiltinAssetVisibility =>
			BUILTIN_ASSET_VISIBILITIES.includes(visibility as BuiltinAssetVisibility),
	);
	return valid.length > 0 ? valid : ["private", "internal"];
};

export type AssetEndpoints<O extends AssetOptions> = {
	createAssetType: ReturnType<typeof createAssetType<O>>;
	listAssetTypes: ReturnType<typeof listAssetTypes<O>>;
	updateAssetType: ReturnType<typeof updateAssetType<O>>;
	deleteAssetType: ReturnType<typeof deleteAssetType<O>>;
	create: ReturnType<typeof createAsset<O>>;
	list: ReturnType<typeof listAssets<O>>;
	get: ReturnType<typeof getAsset<O>>;
	update: ReturnType<typeof updateAsset<O>>;
	delete: ReturnType<typeof deleteAsset<O>>;
	createAssetRole: ReturnType<typeof createAssetRole<O>>;
	listAssetRoles: ReturnType<typeof listAssetRoles<O>>;
	updateAssetRole: ReturnType<typeof updateAssetRole<O>>;
	deleteAssetRole: ReturnType<typeof deleteAssetRole<O>>;
	assignRoles: ReturnType<typeof assignAssetRoles<O>>;
	removeRoles: ReturnType<typeof removeAssetRoles<O>>;
	getMembers: ReturnType<typeof getAssetMembers<O>>;
	share: ReturnType<typeof shareAsset<O>>;
	listShares: ReturnType<typeof listAssetShares<O>>;
	revokeShare: ReturnType<typeof revokeAssetShare<O>>;
};

export type AssetPlugin<O extends AssetOptions> = {
	id: "assets";
	endpoints: AssetEndpoints<O>;
	schema: AssetSchema<O>;
	$Infer: {
		Asset: InferAsset<O>;
		AssetType: InferAssetType<O>;
		AssetRole: InferAssetRole<O>;
	};
	$ERROR_CODES: typeof ASSET_ERROR_CODES;
	options: O;
	init: (ctx: AuthContext) => Promise<AuthContext>;
};

/**
 * Assets plugin for Better Auth. Assets allow you to create typed resources
 * with granular access control via asset roles.
 *
 * @example
 * ```ts
 * const auth = betterAuth({
 *  plugins: [
 *    organization({
 *      // organization options
 *    }),
 *    assets({
 *      defaultAssetTypes: [
 *        {
 *          name: "Project",
 *          scope: "global",
 *          builtInRoles: [
 *            { type: "manager", name: "Manager", description: "..." },
 *          ],
 *        },
 *      ],
 *    }),
 *  ],
 * });
 * ```
 */
export function assets<O extends AssetOptions>(
	options?: O | undefined,
): AssetPlugin<O> {
	const endpoints = {
		createAssetType: createAssetType(options as O),
		listAssetTypes: listAssetTypes(options as O),
		updateAssetType: updateAssetType(options as O),
		deleteAssetType: deleteAssetType(options as O),
		create: createAsset(options as O),
		list: listAssets(options as O),
		get: getAsset(options as O),
		update: updateAsset(options as O),
		delete: deleteAsset(options as O),
		createAssetRole: createAssetRole(options as O),
		listAssetRoles: listAssetRoles(options as O),
		updateAssetRole: updateAssetRole(options as O),
		deleteAssetRole: deleteAssetRole(options as O),
		assignRoles: assignAssetRoles(options as O),
		removeRoles: removeAssetRoles(options as O),
		getMembers: getAssetMembers(options as O),
		share: shareAsset(options as O),
		listShares: listAssetShares(options as O),
		revokeShare: revokeAssetShare(options as O),
	};

	const assetTypeSchema = {
		assetType: {
			fields: {
				organizationId: {
					type: "string",
					required: false,
					references: {
						model: "organization",
						field: "id",
					},
					fieldName: options?.schema?.assetType?.fields?.organizationId,
					index: true,
				},
				scope: {
					type: "string",
					required: true,
					defaultValue: "organization",
					fieldName: options?.schema?.assetType?.fields?.scope,
				},
				name: {
					type: "string",
					required: true,
					fieldName: options?.schema?.assetType?.fields?.name,
				},
				description: {
					type: "string",
					required: false,
					fieldName: options?.schema?.assetType?.fields?.description,
				},
				metadata: {
					type: "json",
					required: false,
					fieldName: options?.schema?.assetType?.fields?.metadata,
				},
				source: {
					type: "string",
					required: false,
					fieldName: options?.schema?.assetType?.fields?.source,
				},
				defaultVisibility: {
					type: "string",
					required: true,
					defaultValue: "private",
					fieldName: options?.schema?.assetType?.fields?.defaultVisibility,
				},
				allowedVisibilities: {
					type: "json",
					required: true,
					fieldName: options?.schema?.assetType?.fields?.allowedVisibilities,
				},
				isBuiltIn: {
					type: "boolean",
					required: true,
					defaultValue: false,
					fieldName: options?.schema?.assetType?.fields?.isBuiltIn,
				},
				createdAt: {
					type: "date",
					required: true,
					defaultValue: () => new Date(),
					fieldName: options?.schema?.assetType?.fields?.createdAt,
				},
				updatedAt: {
					type: "date",
					required: false,
					fieldName: options?.schema?.assetType?.fields?.updatedAt,
					onUpdate: () => new Date(),
				},
				...(options?.schema?.assetType?.additionalFields || {}),
			},
			modelName: options?.schema?.assetType?.modelName,
		},
		asset: {
			fields: {
				organizationId: {
					type: "string",
					required: false,
					references: {
						model: "organization",
						field: "id",
					},
					fieldName: options?.schema?.asset?.fields?.organizationId,
					index: true,
				},
				ownerId: {
					type: "string",
					required: true,
					references: {
						model: "user",
						field: "id",
					},
					fieldName: options?.schema?.asset?.fields?.ownerId,
					index: true,
				},
				assetTypeId: {
					type: "string",
					required: true,
					references: {
						model: "assetType",
						field: "id",
					},
					fieldName: options?.schema?.asset?.fields?.assetTypeId,
					index: true,
				},
				teamId: {
					type: "string",
					required: false,
					references: {
						model: "team",
						field: "id",
					},
					fieldName: options?.schema?.asset?.fields?.teamId,
					index: true,
				},
				name: {
					type: "string",
					required: true,
					fieldName: options?.schema?.asset?.fields?.name,
				},
				visibility: {
					type: "string",
					required: true,
					defaultValue: "private",
					fieldName: options?.schema?.asset?.fields?.visibility,
				},
				visibilityLocked: {
					type: "boolean",
					required: true,
					defaultValue: false,
					fieldName: options?.schema?.asset?.fields?.visibilityLocked,
				},
				metadata: {
					type: "json",
					required: false,
					fieldName: options?.schema?.asset?.fields?.metadata,
				},
				createdAt: {
					type: "date",
					required: true,
					defaultValue: () => new Date(),
					fieldName: options?.schema?.asset?.fields?.createdAt,
				},
				updatedAt: {
					type: "date",
					required: false,
					fieldName: options?.schema?.asset?.fields?.updatedAt,
					onUpdate: () => new Date(),
				},
				...(options?.schema?.asset?.additionalFields || {}),
			},
			modelName: options?.schema?.asset?.modelName,
		},
		assetRole: {
			fields: {
				assetTypeId: {
					type: "string",
					required: true,
					references: {
						model: "assetType",
						field: "id",
					},
					fieldName: options?.schema?.assetRole?.fields?.assetTypeId,
					index: true,
				},
				type: {
					type: "string",
					required: true,
					fieldName: options?.schema?.assetRole?.fields?.type,
					index: true,
				},
				name: {
					type: "string",
					required: true,
					fieldName: options?.schema?.assetRole?.fields?.name,
				},
				description: {
					type: "string",
					required: false,
					fieldName: options?.schema?.assetRole?.fields?.description,
				},
				isBuiltIn: {
					type: "boolean",
					required: true,
					defaultValue: false,
					fieldName: options?.schema?.assetRole?.fields?.isBuiltIn,
				},
				permissions: {
					type: "json",
					required: false,
					fieldName: options?.schema?.assetRole?.fields?.permissions,
				},
				createdAt: {
					type: "date",
					required: true,
					defaultValue: () => new Date(),
					fieldName: options?.schema?.assetRole?.fields?.createdAt,
				},
				updatedAt: {
					type: "date",
					required: false,
					fieldName: options?.schema?.assetRole?.fields?.updatedAt,
					onUpdate: () => new Date(),
				},
				...(options?.schema?.assetRole?.additionalFields || {}),
			},
			modelName: options?.schema?.assetRole?.modelName,
		},
		memberAssetRole: {
			fields: {
				memberId: {
					type: "string",
					required: false,
					references: {
						model: "member",
						field: "id",
					},
					fieldName: options?.schema?.memberAssetRole?.fields?.memberId,
					index: true,
				},
				userId: {
					type: "string",
					required: false,
					references: {
						model: "user",
						field: "id",
					},
					fieldName: options?.schema?.memberAssetRole?.fields?.userId,
					index: true,
				},
				assetId: {
					type: "string",
					required: true,
					references: {
						model: "asset",
						field: "id",
					},
					fieldName: options?.schema?.memberAssetRole?.fields?.assetId,
					index: true,
				},
				role: {
					type: "string",
					required: true,
					fieldName: options?.schema?.memberAssetRole?.fields?.role,
					index: true,
				},
				createdAt: {
					type: "date",
					required: true,
					defaultValue: () => new Date(),
					fieldName: options?.schema?.memberAssetRole?.fields?.createdAt,
				},
				...(options?.schema?.memberAssetRole?.additionalFields || {}),
			},
			modelName: options?.schema?.memberAssetRole?.modelName,
		},
		assetShare: {
			fields: {
				assetId: {
					type: "string",
					required: true,
					references: {
						model: "asset",
						field: "id",
					},
					fieldName: options?.schema?.assetShare?.fields?.assetId,
					index: true,
				},
				grantType: {
					type: "string",
					required: true,
					fieldName: options?.schema?.assetShare?.fields?.grantType,
					index: true,
				},
				memberId: {
					type: "string",
					required: false,
					references: {
						model: "member",
						field: "id",
						name: "invitee",
					},
					fieldName: options?.schema?.assetShare?.fields?.memberId,
					index: true,
				},
				teamId: {
					type: "string",
					required: false,
					references: {
						model: "team",
						field: "id",
					},
					fieldName: options?.schema?.assetShare?.fields?.teamId,
					index: true,
				},
				organizationId: {
					type: "string",
					required: false,
					references: {
						model: "organization",
						field: "id",
					},
					fieldName: options?.schema?.assetShare?.fields?.organizationId,
					index: true,
				},
				externalEmail: {
					type: "string",
					required: false,
					fieldName: options?.schema?.assetShare?.fields?.externalEmail,
					index: true,
				},
				role: {
					type: "string",
					required: true,
					fieldName: options?.schema?.assetShare?.fields?.role,
					index: true,
				},
				status: {
					type: "string",
					required: true,
					defaultValue: "pending",
					fieldName: options?.schema?.assetShare?.fields?.status,
					index: true,
				},
				invitedByMemberId: {
					type: "string",
					required: false,
					references: {
						model: "member",
						name: "inviter",
						field: "id",
					},
					fieldName: options?.schema?.assetShare?.fields?.invitedByMemberId,
				},
				expiresAt: {
					type: "date",
					required: false,
					fieldName: options?.schema?.assetShare?.fields?.expiresAt,
				},
				createdAt: {
					type: "date",
					required: true,
					defaultValue: () => new Date(),
					fieldName: options?.schema?.assetShare?.fields?.createdAt,
				},
				updatedAt: {
					type: "date",
					required: false,
					onUpdate: () => new Date(),
					fieldName: options?.schema?.assetShare?.fields?.updatedAt,
				},
				...(options?.schema?.assetShare?.additionalFields || {}),
			},
			modelName: options?.schema?.assetShare?.modelName,
		},
		assetShareLink: {
			fields: {
				assetId: {
					type: "string",
					required: true,
					references: {
						model: "asset",
						field: "id",
					},
					fieldName: options?.schema?.assetShareLink?.fields?.assetId,
					index: true,
				},
				tokenHash: {
					type: "string",
					required: true,
					fieldName: options?.schema?.assetShareLink?.fields?.tokenHash,
					index: true,
				},
				role: {
					type: "string",
					required: true,
					fieldName: options?.schema?.assetShareLink?.fields?.role,
				},
				linkVisibility: {
					type: "string",
					required: true,
					defaultValue: "organization",
					fieldName: options?.schema?.assetShareLink?.fields?.linkVisibility,
				},
				requiresAuth: {
					type: "boolean",
					required: true,
					defaultValue: true,
					fieldName: options?.schema?.assetShareLink?.fields?.requiresAuth,
				},
				passwordHash: {
					type: "string",
					required: false,
					fieldName: options?.schema?.assetShareLink?.fields?.passwordHash,
				},
				expiresAt: {
					type: "date",
					required: false,
					fieldName: options?.schema?.assetShareLink?.fields?.expiresAt,
				},
				createdByMemberId: {
					type: "string",
					required: true,
					references: {
						model: "member",
						field: "id",
					},
					fieldName: options?.schema?.assetShareLink?.fields?.createdByMemberId,
				},
				revokedAt: {
					type: "date",
					required: false,
					fieldName: options?.schema?.assetShareLink?.fields?.revokedAt,
				},
				createdAt: {
					type: "date",
					required: true,
					defaultValue: () => new Date(),
					fieldName: options?.schema?.assetShareLink?.fields?.createdAt,
				},
				...(options?.schema?.assetShareLink?.additionalFields || {}),
			},
			modelName: options?.schema?.assetShareLink?.modelName,
		},
	} satisfies BetterAuthPluginDBSchema;

	const schema = assetTypeSchema;

	return {
		id: "assets",
		endpoints,
		schema: schema as unknown as AssetSchema<O>,
		$Infer: {
			Asset: {} as InferAsset<O>,
			AssetType: {} as InferAssetType<O>,
			AssetRole: {} as InferAssetRole<O>,
		},
		$ERROR_CODES: ASSET_ERROR_CODES,
		options: options as O,
		async init(ctx) {
			const adapter = await getCurrentAdapter(ctx.adapter);
			for (const assetType of options?.defaultAssetTypes || []) {
				const allowedVisibilities = normalizeAllowedVisibilities(
					assetType.allowedVisibilities,
				);
				const fallbackVisibility: BuiltinAssetVisibility =
					allowedVisibilities[0] ?? "private";
				const defaultVisibility: BuiltinAssetVisibility =
					allowedVisibilities.includes(
						assetType.defaultVisibility as BuiltinAssetVisibility,
					)
						? (assetType.defaultVisibility as BuiltinAssetVisibility)
						: fallbackVisibility;
				const createdAssetType = await adapter.create<
					AssetTypeInput,
					InferAssetType<O, false>
				>({
					model: "assetType",
					data: {
						name: assetType.name,
						description: assetType.description,
						scope: assetType.scope ?? "organization",
						source: assetType.source,
						isBuiltIn: true,
						defaultVisibility,
						allowedVisibilities,
					},
				});

				for (const role of assetType.builtInRoles || []) {
					await adapter.create<AssetRoleInput, InferAssetRole<O, false>>({
						model: "assetRole",
						data: {
							assetTypeId: createdAssetType.id,
							type: role.type,
							name: role.name,
							description: role.description,
							permissions: role.permissions as
								| Record<string, unknown>
								| undefined,
							isBuiltIn: true,
							createdAt: new Date(),
							updatedAt: new Date(),
						},
					});
				}
			}

			return ctx;
		},
	} satisfies BetterAuthPlugin;
}
