import type { GenericEndpointContext } from "@better-auth/core";
import { defineRequestState, hasRequestState } from "@better-auth/core/context";
import * as z from "zod";
import { APIError } from "../../api";
import { defaultRoles } from "./access";
import type { HasPermissionBaseInput } from "./permission";
import { hasPermissionFn } from "./permission";
import { parseRoleList } from "./roles";
import type { OrganizationRole } from "./schema";

const rolePermissionsSchema = z.record(z.string(), z.array(z.string()));

type ResolvedRoles = Map<string, Parameters<typeof hasPermissionFn>[1]>;

/**
 * Request-scoped role cache, isolated by adapter and organization options before
 * organization id. Nested calls to another auth instance can share request state,
 * but must never replace the caller's permission definitions.
 */
const resolvedOrganizationRoles = defineRequestState(
	() => new WeakMap<object, WeakMap<object, ResolvedRoles>>(),
);

async function getRequestScopedRolesCache(
	ctx: GenericEndpointContext,
	options: HasPermissionBaseInput["options"],
) {
	if (!(await hasRequestState())) {
		return undefined;
	}
	const adapters = await resolvedOrganizationRoles.get();
	const configurations: WeakMap<object, ResolvedRoles> =
		adapters.get(ctx.context.adapter) ?? new WeakMap();
	adapters.set(ctx.context.adapter, configurations);
	const roles: ResolvedRoles = configurations.get(options) ?? new Map();
	configurations.set(options, roles);
	return roles;
}

export const hasPermission = async (
	input: {
		organizationId: string;
		/**
		 * Reuse roles already loaded for this organization in the current request.
		 * The cache ends with the request.
		 *
		 * @default false
		 */
		useMemoryCache?: boolean | undefined;
	} & HasPermissionBaseInput,
	ctx: GenericEndpointContext,
) => {
	const acRoles: Parameters<typeof hasPermissionFn>[1] = {
		...(input.options.roles || defaultRoles),
	};
	const ac = input.options.ac;
	if (
		!ctx ||
		!input.organizationId ||
		!input.options.dynamicAccessControl?.enabled ||
		!ac
	) {
		return hasPermissionFn(input, acRoles);
	}

	const cache = await getRequestScopedRolesCache(ctx, input.options);
	const cached = input.useMemoryCache
		? cache?.get(input.organizationId)
		: undefined;
	if (cached) {
		return hasPermissionFn(input, cached);
	}

	// Load roles from database
	const roles = await ctx.context.adapter.findMany<
		Omit<OrganizationRole, "permission"> & { permission: string }
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
				{
					permissions,
				},
			);
			throw new APIError("INTERNAL_SERVER_ERROR", {
				message: "Invalid permissions for role " + role,
			});
		}

		const merged: Record<string, readonly string[]> = {
			...acRoles[role]?.statements,
		};
		for (const [key, actions] of Object.entries(result.data)) {
			merged[key] = [...new Set([...(merged[key] ?? []), ...actions])];
		}
		acRoles[role] = ac.newRole(merged);
	}

	cache?.set(input.organizationId, acRoles);
	return hasPermissionFn(input, acRoles);
};

/**
 * Whether a member may see the organization's pending invitations.
 *
 * Invitation ids act as invitation links. Members who can create invitations
 * can mint such links anyway; any other role, including one that may only
 * cancel, must not see them.
 */
export const canViewInvitations = (
	input: Pick<
		Parameters<typeof hasPermission>[0],
		"organizationId" | "role" | "options"
	>,
	ctx: GenericEndpointContext,
) =>
	hasPermission(
		{
			...input,
			permissions: {
				invitation: ["create"],
			},
		},
		ctx,
	);

/**
 * Drops invitations that grant the creator role unless the member holds it,
 * matching the rule that only the creator role can hand it out.
 */
export const withoutCreatorRoleInvitations = <
	T extends Pick<HasPermissionBaseInput, "role">,
>(
	invitations: T[],
	input: Pick<HasPermissionBaseInput, "role" | "options">,
) => {
	const creatorRole = input.options.creatorRole || "owner";
	if (parseRoleList(input.role).includes(creatorRole)) return invitations;
	return invitations.filter(
		(invitation) => !parseRoleList(invitation.role).includes(creatorRole),
	);
};
