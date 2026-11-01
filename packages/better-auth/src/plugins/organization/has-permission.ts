import type { GenericEndpointContext } from "@better-auth/core";
import * as z from "zod";
import { APIError } from "../../api";
import type { Role } from "../access";
import { defaultRoles } from "./access";
import type { HasPermissionBaseInput } from "./permission";
import { cacheAllRoles, hasPermissionFn } from "./permission";
import type { User } from "../../types";
import { ORGANIZATION_ERROR_CODES } from "./error-codes";
import type { Member, OrganizationRole, TeamMember } from "./schema";
import type { OrganizationOptions } from "./types";

const rolePermissionsSchema = z.record(z.string(), z.array(z.string()));

export const hasPermission = async (
	input: {
		organizationId: string;
		teamId?: string;
		userId?: string;
		teamRole?: string;
		/**
		 * If true, will use the in-memory cache of the roles.
		 * Keep in mind to use this in a stateless mindset, the purpose of this is to avoid unnecessary database calls when running multiple
		 * hasPermission calls in a row.
		 *
		 * @default false
		 */
		useMemoryCache?: boolean | undefined;
	} & HasPermissionBaseInput,
	ctx: GenericEndpointContext,
) => {
	let acRoles: {
		[x: string]: Role<any> | undefined;
	} = { 
		...(input.options.roles || defaultRoles),
		...(input.options.teams?.roles || {})
	};

	let role = input.role;
	let teamRole = input.teamRole;

	if (input.userId && (!role || (input.teamId && teamRole === undefined))) {
		const [member, teamMember] = await Promise.all([
			!role ? ctx.context.adapter.findOne<any>({
				model: "member",
				where: [
					{ field: "organizationId", value: input.organizationId },
					{ field: "userId", value: input.userId }
				]
			}) : null,
			input.teamId && teamRole === undefined ? ctx.context.adapter.findOne<any>({
				model: "teamMember",
				where: [
					{ field: "teamId", value: input.teamId },
					{ field: "userId", value: input.userId }
				]
			}) : null
		]);

		if (!role && member) {
			role = member.role;
		}
		if (input.teamId && teamRole === undefined && teamMember) {
			teamRole = teamMember.role || "";
		}
	}

	if (
		ctx &&
		input.organizationId &&
		input.options.dynamicAccessControl?.enabled &&
		input.options.ac &&
		!input.useMemoryCache
	) {
		// Load roles from database
		const roles = await ctx.context.adapter.findMany<
			OrganizationRole & { permission: string }
		>({
			model: "organizationRole",
			where: [
				{
					field: "organizationId",
					value: input.organizationId,
				},
			],
		});

		for (const { role, permission: permissionsString } of roles) {
			const permissions: unknown = JSON.parse(permissionsString);
			const result = rolePermissionsSchema.safeParse(permissions);

			if (!result.success) {
				ctx.context.logger.error(
					"[hasPermission] Invalid permissions for role " + role,
					{ permissions },
				);
				throw new APIError("INTERNAL_SERVER_ERROR", {
					message: "Invalid permissions for role " + role,
				});
			}

			const merged: Record<string, string[]> = { ...acRoles[role]?.statements };
			for (const [key, actions] of Object.entries(result.data)) {
				merged[key] = [...new Set([...(merged[key] ?? []), ...actions])];
			}
			acRoles[role] = input.options.ac.newRole(merged);
		}
	}

	if (input.useMemoryCache) {
		acRoles = cacheAllRoles.get(input.organizationId) || acRoles;
	}
	cacheAllRoles.set(input.organizationId, acRoles);

	return hasPermissionFn({ ...input, role, teamRole }, acRoles);
};

export async function checkIfMemberHasPermission({
	ctx,
	permissionRequired: permission,
	options,
	organizationId,
	teamId,
	member,
	teamMember,
	user,
	action,
}: {
	ctx: GenericEndpointContext;
	permissionRequired: Record<string, string[]>;
	options: OrganizationOptions;
	organizationId: string;
	teamId?: string;
	member?: Member | null;
	teamMember?: TeamMember | null;
	user: User;
	action: "create" | "update" | "delete" | "read" | "list" | "get";
}) {
	const hasNecessaryPermissions: {
		resource: { [x: string]: string[] };
		hasPermission: boolean;
	}[] = [];
	const permissionEntries = Object.entries(permission);
	for await (const [resource, permissions] of permissionEntries) {
		for await (const perm of permissions) {
			hasNecessaryPermissions.push({
				resource: { [resource]: [perm] },
				hasPermission: await hasPermission(
					{
						options,
						organizationId,
						teamId,
						permissions: { [resource]: [perm] },
						useMemoryCache: true,
						role: member?.role,
						teamRole: teamMember?.role,
					},
					ctx,
				),
			});
		}
	}
	const missingPermissions = hasNecessaryPermissions
		.filter((x) => x.hasPermission === false)
		.map((x) => {
			const key = Object.keys(x.resource)[0]!;
			return `${key}:${x.resource[key]![0]}` as const;
		});
	if (missingPermissions.length > 0) {
		ctx.context.logger.error(
			`[Dynamic Access Control] The user is missing permissions necessary to ${action} a role with those set of permissions.\n`,
			{
				userId: user.id,
				organizationId,
				role: member?.role,
				teamRole: teamMember?.role,
				missingPermissions,
			},
		);
		let error: { code: string; message: string };
		if (action === "create")
			error = ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_CREATE_A_ROLE;
		else if (action === "update")
			error = ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_UPDATE_A_ROLE;
		else if (action === "delete")
			error = ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_DELETE_A_ROLE;
		else if (action === "read")
			error = ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_READ_A_ROLE;
		else if (action === "list")
			error = ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_LIST_A_ROLE;
		else error = ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_GET_A_ROLE;

		throw APIError.fromStatus("FORBIDDEN", {
			message: error.message,
			code: error.code,
		});
	}
}
