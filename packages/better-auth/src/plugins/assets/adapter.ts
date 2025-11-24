import type { AuthContext } from "@better-auth/core";
import { getCurrentAdapter } from "@better-auth/core/context";
import type {
	AssetInput,
	AssetRoleInput,
	AssetTypeInput,
	AssetShareInput,
	InferAsset,
	InferAssetRole,
	InferAssetShare,
	InferAssetType,
	InferMemberAssetRole,
	MemberAssetRole,
} from "./schema";
import type { AssetOptions } from "./types";
import { APIError } from "better-call";

type AssetVisibility = "private" | "internal" | "public";
type AdapterWhere = {
	field: string;
	value: any;
	operator?: "in" | "eq";
};
const DEFAULT_ALLOWED_VISIBILITIES: AssetVisibility[] = ["private", "internal"];
const ensureAllowedVisibilities = (value?: unknown): AssetVisibility[] => {
	if (!Array.isArray(value) || value.length === 0) {
		return [...DEFAULT_ALLOWED_VISIBILITIES];
	}

	const normalized = value.filter((v): v is AssetVisibility =>
		["private", "internal", "public"].includes(v as AssetVisibility),
	);

	return normalized.length > 0 ? normalized : [...DEFAULT_ALLOWED_VISIBILITIES];
};

export const getAssetAdapter = <O extends AssetOptions>(
	context: AuthContext,
	options?: O | undefined,
) => {
	const baseAdapter = context.adapter;

	const hydrateAssetType = (assetType: InferAssetType<O, false>) => ({
		...assetType,
		allowedVisibilities: ensureAllowedVisibilities(
			assetType.allowedVisibilities as AssetVisibility[] | undefined,
		),
	});

	const assetAdapter = {
		// Asset Type Methods
		createAssetType: async (data: {
			assetType: AssetTypeInput & Record<string, any>;
		}) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const assetType = await adapter.create<
				AssetTypeInput,
				InferAssetType<O, false>
			>({
				model: "assetType",
				data: {
					...data.assetType,
				},
				forceAllowId: true,
			});

			return hydrateAssetType(assetType);
		},

		findAssetTypeById: async (id: string) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const assetType = await adapter.findOne<InferAssetType<O, false>>({
				model: "assetType",
				where: [{ field: "id", value: id }],
			});
			if (!assetType) {
				return null;
			}
			return hydrateAssetType(assetType);
		},

		findAssetTypeByName: async (data: {
			organizationId?: string | null;
			name: string;
			scope?: "organization" | "global";
		}) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const where: Array<{ field: string; value: any }> = [
				{ field: "name", value: data.name },
			];

			if (data.scope) {
				where.push({ field: "scope", value: data.scope });
			}

			if (data.organizationId) {
				where.push({ field: "organizationId", value: data.organizationId });
			} else if (data.scope === "organization") {
				// If scope is organization but no orgId, return null
				return null;
			}

			const assetType = await adapter.findOne<InferAssetType<O, false>>({
				model: "assetType",
				where,
			});

			if (!assetType) {
				return null;
			}

			return hydrateAssetType(assetType);
		},

		listAssetTypes: async (data: {
			organizationId?: string;
			scope?: "organization" | "global";
			limit?: number;
			offset?: number;
		}) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const where: AdapterWhere[] = [];

			if (data.organizationId && data.scope === "organization") {
				// Include org-scoped types for this org and all global types
				where.push({
					field: "organizationId",
					value: data.organizationId,
				});
			} else if (data.scope === "global") {
				where.push({ field: "scope", value: "global" });
			}

			const assetTypes = await adapter.findMany<InferAssetType<O, false>>({
				model: "assetType",
				where,
				limit: data.limit,
				offset: data.offset,
			});

			return assetTypes.map(hydrateAssetType);
		},

		updateAssetType: async (id: string, data: Partial<AssetTypeInput>) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const updateData: any = { ...data };

			const updated = await adapter.update<InferAssetType<O, false>>({
				model: "assetType",
				where: [{ field: "id", value: id }],
				update: updateData,
			});

			if (!updated) {
				return null;
			}

			return hydrateAssetType(updated);
		},

		deleteAssetType: async (id: string) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			// Check if any assets use this type
			const assets = await adapter.findMany<InferAsset<O, false>>({
				model: "asset",
				where: [{ field: "assetTypeId", value: id }],
				limit: 1,
			});

			if (assets.length > 0) {
				throw new APIError("BAD_REQUEST", {
					message: "Cannot delete asset type that has associated assets",
				});
			}

			await adapter.delete({
				model: "assetType",
				where: [{ field: "id", value: id }],
			});
		},

		// Asset Methods
		createAsset: async (data: { asset: AssetInput & Record<string, any> }) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const asset = await adapter.create<AssetInput, InferAsset<O, false>>({
				model: "asset",
				data: data.asset,
				forceAllowId: true,
			});

			return asset;
		},

		findAssetById: async (id: string) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const asset = await adapter.findOne<InferAsset<O, false>>({
				model: "asset",
				where: [{ field: "id", value: id }],
			});

			if (!asset) {
				return null;
			}

			return asset;
		},

		listAssets: async (data: {
			organizationId?: string;
			ownerId?: string;
			assetTypeId?: string;
			teamId?: string;
			limit?: number;
			offset?: number;
		}) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const where: Array<{ field: string; value: any }> = [];

			if (data.organizationId) {
				where.push({ field: "organizationId", value: data.organizationId });
			}
			if (data.ownerId) {
				where.push({ field: "ownerId", value: data.ownerId });
			}
			if (data.assetTypeId) {
				where.push({ field: "assetTypeId", value: data.assetTypeId });
			}
			if (data.teamId) {
				where.push({ field: "teamId", value: data.teamId });
			}

			const assets = await adapter.findMany<InferAsset<O, false>>({
				model: "asset",
				where,
				limit: data.limit,
				offset: data.offset,
			});

			return assets as InferAsset<O, false>[];
		},

		updateAsset: async (id: string, data: Partial<AssetInput>) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const updateData: any = { ...data };

			const updated = await adapter.update<InferAsset<O, false>>({
				model: "asset",
				where: [{ field: "id", value: id }],
				update: updateData,
			});

			if (!updated) {
				return null;
			}

			return updated;
		},

		deleteAsset: async (id: string) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			// Delete role assignments first
			await adapter.deleteMany({
				model: "memberAssetRole",
				where: [{ field: "assetId", value: id }],
			});
			await adapter.deleteMany({
				model: "assetShare",
				where: [{ field: "assetId", value: id }],
			});
			await adapter.deleteMany({
				model: "assetShareLink",
				where: [{ field: "assetId", value: id }],
			});

			await adapter.delete({
				model: "asset",
				where: [{ field: "id", value: id }],
			});
		},

		// Asset Role Methods
		createAssetRole: async (data: {
			assetRole: AssetRoleInput & Record<string, any>;
		}) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const assetRole = await adapter.create<
				AssetRoleInput,
				InferAssetRole<O, false>
			>({
				model: "assetRole",
				data: data.assetRole,
				forceAllowId: true,
			});

			return assetRole;
		},

		getAssetRolesByAssetType: async (assetTypeId: string) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const roles = await adapter.findMany<InferAssetRole<O, false>>({
				model: "assetRole",
				where: [{ field: "assetTypeId", value: assetTypeId }],
			});

			return roles as InferAssetRole<O, false>[];
		},

		getAssetRolesByTypes: async (assetTypeId: string, types: string[]) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const where: AdapterWhere[] = [
				{ field: "assetTypeId", value: assetTypeId },
				{ field: "type", value: types, operator: "in" },
			];
			const roles = await adapter.findMany<InferAssetRole<O, false>>({
				model: "assetRole",
				where,
			});

			return roles as InferAssetRole<O, false>[];
		},

		createAssetShare: async (data: {
			share: AssetShareInput & Record<string, any>;
		}) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			return adapter.create<AssetShareInput, InferAssetShare<O, false>>({
				model: "assetShare",
				data: data.share,
				forceAllowId: true,
			});
		},

		listAssetShares: async (assetId: string) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			return adapter.findMany<InferAssetShare<O, false>>({
				model: "assetShare",
				where: [{ field: "assetId", value: assetId }],
			});
		},

		findAssetShareById: async (id: string) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			return adapter.findOne<InferAssetShare<O, false>>({
				model: "assetShare",
				where: [{ field: "id", value: id }],
			});
		},

		updateAssetShareStatus: async (
			id: string,
			status: "pending" | "active" | "revoked" | "expired",
		) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			return adapter.update<InferAssetShare<O, false>>({
				model: "assetShare",
				where: [{ field: "id", value: id }],
				update: {
					status,
					updatedAt: new Date(),
				},
			});
		},

		updateAssetRole: async (id: string, data: Partial<AssetRoleInput>) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const updateData: any = { ...data };

			const updated = await adapter.update<InferAssetRole<O, false>>({
				model: "assetRole",
				where: [{ field: "id", value: id }],
				update: updateData,
			});

			if (!updated) {
				return null;
			}

			return updated;
		},

		deleteAssetRole: async (id: string) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			// Get the role to find its type
			const role = await adapter.findOne<InferAssetRole<O, false>>({
				model: "assetRole",
				where: [{ field: "id", value: id }],
			});

			if (!role) {
				throw new APIError("NOT_FOUND", {
					message: "Asset role not found",
				});
			}

			// Check if role has any assignments (by role type, not ID)
			const assignments = await adapter.findMany<
				InferMemberAssetRole<O, false>
			>({
				model: "memberAssetRole",
				where: [{ field: "role", value: role.type }],
				limit: 1,
			});

			if (assignments.length > 0) {
				throw new APIError("BAD_REQUEST", {
					message: "Cannot delete asset role that has assignments",
				});
			}

			await adapter.delete({
				model: "assetRole",
				where: [{ field: "id", value: id }],
			});
		},

		// Member Asset Role Methods
		assignAssetRolesToMember: async (
			memberId: string | undefined,
			userId: string | undefined,
			assetId: string,
			roles: string[],
		) => {
			const adapter = await getCurrentAdapter(baseAdapter);

			if (!memberId && !userId) {
				throw new APIError("BAD_REQUEST", {
					message: "Either memberId or userId must be provided",
				});
			}

			if (memberId && userId) {
				throw new APIError("BAD_REQUEST", {
					message: "Either memberId or userId must be provided, but not both",
				});
			}

			// Validate all role types exist for the asset's asset type
			const asset = await adapter.findOne<InferAsset<O, false>>({
				model: "asset",
				where: [{ field: "id", value: assetId }],
			});

			if (!asset) {
				throw new APIError("NOT_FOUND", {
					message: "Asset not found",
				});
			}

			const rolesWhere: AdapterWhere[] = [
				{ field: "assetTypeId", value: asset.assetTypeId },
				{ field: "type", value: roles, operator: "in" },
			];
			const existingRoles = await adapter.findMany<InferAssetRole<O, false>>({
				model: "assetRole",
				where: rolesWhere,
			});

			const existingTypes = new Set<string>(
				existingRoles.map((r) => r.type as string),
			);
			const missingTypes = roles.filter((r) => !existingTypes.has(r));
			if (missingTypes.length > 0) {
				throw new APIError("BAD_REQUEST", {
					message: `Role type(s) '${missingTypes.join(", ")}' do not exist for this asset type`,
				});
			}

			// Remove existing roles
			if (memberId) {
				await adapter.deleteMany({
					model: "memberAssetRole",
					where: [
						{ field: "memberId", value: memberId },
						{ field: "assetId", value: assetId },
					],
				});
			} else if (userId) {
				await adapter.deleteMany({
					model: "memberAssetRole",
					where: [
						{ field: "userId", value: userId },
						{ field: "assetId", value: assetId },
					],
				});
			}

			// Create new role assignments
			await Promise.all(
				roles.map((role) =>
					adapter.create<
						Omit<MemberAssetRole, "id" | "createdAt">,
						MemberAssetRole
					>({
						model: "memberAssetRole",
						data: {
							...(memberId ? { memberId } : {}),
							...(userId ? { userId } : {}),
							assetId,
							role,
						},
					}),
				),
			);
		},

		removeAssetRolesFromMember: async (
			memberId: string | undefined,
			userId: string | undefined,
			assetId: string,
			roles: string[],
		) => {
			const adapter = await getCurrentAdapter(baseAdapter);

			if (!memberId && !userId) {
				throw new APIError("BAD_REQUEST", {
					message: "Either memberId or userId must be provided",
				});
			}

			const where: AdapterWhere[] = [
				{ field: "assetId", value: assetId },
				{ field: "role", value: roles, operator: "in" },
			];

			if (memberId) {
				where.push({ field: "memberId", value: memberId });
			} else if (userId) {
				where.push({ field: "userId", value: userId });
			}

			await adapter.deleteMany({
				model: "memberAssetRole",
				where,
			});
		},

		getMemberAssetRoles: async (
			memberId: string | undefined,
			userId: string | undefined,
			assetId?: string,
		) => {
			const adapter = await getCurrentAdapter(baseAdapter);

			if (!memberId && !userId) {
				throw new APIError("BAD_REQUEST", {
					message: "Either memberId or userId must be provided",
				});
			}

			const where: Array<{ field: string; value: any }> = [];

			if (memberId) {
				where.push({ field: "memberId", value: memberId });
			} else if (userId) {
				where.push({ field: "userId", value: userId });
			}

			if (assetId) {
				where.push({ field: "assetId", value: assetId });
			}

			const roleAssignments = await adapter.findMany<
				InferMemberAssetRole<O, false>
			>({
				model: "memberAssetRole",
				where,
			});

			return roleAssignments.map((ra) => ra.role);
		},

		getAssetMembers: async (assetId: string) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const roleAssignments = await adapter.findMany<
				InferMemberAssetRole<O, false>
			>({
				model: "memberAssetRole",
				where: [{ field: "assetId", value: assetId }],
			});

			return roleAssignments;
		},
	};

	return assetAdapter;
};
