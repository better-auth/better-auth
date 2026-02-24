import type { AuthContext } from "@better-auth/core";
import { getCurrentAdapter } from "@better-auth/core/context";
import { filterOutputFields } from "../../../helpers/filter-output-fields";
import type { RealOrganizationId } from "../../../helpers/get-org-adapter";
import type { OrganizationRole } from "../schema";
import type {
	DynamicAccessControlOptions,
	InferOrganizationRole,
} from "../types";
import { resolveOptions } from "./resolve-options";

export type RealRoleId = string & { __realRoleId: true };

export const getAdapter = <O extends DynamicAccessControlOptions>(
	context: AuthContext,
	_options?: O | undefined,
) => {
	const baseAdapter = context.adapter;
	const options = resolveOptions(_options);
	const schema = options.schema || {};

	const filterRoleOutput = <T extends Record<string, any> | null>(role: T) => {
		const roleAdditionalFields = schema.organizationRole?.additionalFields;
		const result = filterOutputFields(role, roleAdditionalFields);
		return result;
	};

	return {
		createRole: async (
			roleData: Omit<OrganizationRole, "id"> & Record<string, any>,
		) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const role = await adapter.create<
				OrganizationRole,
				InferOrganizationRole<O, false>
			>({
				model: "organizationRole",
				data: roleData,
				forceAllowId: true,
			});
			return filterRoleOutput(role) as InferOrganizationRole<O, false>;
		},
		findRoleById: async ({
			roleId,
			organizationId,
		}: {
			roleId: string;
			organizationId: RealOrganizationId;
		}) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const role = await adapter.findOne<InferOrganizationRole<O, false>>({
				model: "organizationRole",
				where: [
					{ field: "id", value: roleId },
					{ field: "organizationId", value: organizationId },
				],
			});
			return filterRoleOutput(role);
		},
		findRoleByName: async ({
			roleName,
			organizationId,
		}: {
			roleName: string;
			organizationId: RealOrganizationId;
		}) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const role = await adapter.findOne<InferOrganizationRole<O, false>>({
				model: "organizationRole",
				where: [
					{ field: "role", value: roleName },
					{ field: "organizationId", value: organizationId },
				],
			});
			return filterRoleOutput(role);
		},
		getRoleCount: async (organizationId: RealOrganizationId) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const count = await adapter.count({
				model: "organizationRole",
				where: [{ field: "organizationId", value: organizationId }],
			});
			return count;
		},
		listRoles: async ({
			organizationId,
			limit,
			offset,
			sortBy,
			sortDirection,
		}: {
			organizationId: RealOrganizationId;
			limit?: number;
			offset?: number;
			sortBy?: "createdAt" | "role" | "updatedAt";
			sortDirection?: "asc" | "desc";
		}) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const roles = await adapter.findMany<InferOrganizationRole<O, false>>({
				model: "organizationRole",
				where: [{ field: "organizationId", value: organizationId }],
				limit: limit,
				offset: offset,
				sortBy: sortBy
					? { field: sortBy, direction: sortDirection || "desc" }
					: undefined,
			});
			const total = await adapter.count({
				model: "organizationRole",
				where: [{ field: "organizationId", value: organizationId }],
			});
			return {
				roles: roles.map(filterRoleOutput),
				total,
			};
		},
		updateRole: async (roleId: RealRoleId, updates: Record<string, any>) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const role = await adapter.update<InferOrganizationRole<O, false>>({
				model: "organizationRole",
				where: [{ field: "id", value: roleId }],
				update: updates,
			});
			return filterRoleOutput(role);
		},
		deleteRole: async (roleId: RealRoleId) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			await adapter.delete({
				model: "organizationRole",
				where: [{ field: "id", value: roleId }],
			});
		},
		getRealRoleId: async (roleId: string): Promise<RealRoleId> => {
			return roleId as RealRoleId;
		},
	};
};
