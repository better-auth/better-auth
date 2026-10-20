import type { GenericEndpointContext } from "@better-auth/core";
import * as z from "zod";
import { APIError } from "../../api";
import type { Role } from "../access";
import { defaultRoles } from "./access";
import type { HasPermissionBaseInput } from "./permission";
import { cacheAllRoles, hasPermissionFn } from "./permission";
import type { OrganizationRole } from "./schema";

const rolePermissionsSchema = z.record(z.string(), z.array(z.string()));

export const hasPermission = async (
	input: {
		organizationId: string;
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
	} = { ...(input.options.roles || defaultRoles) };

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
				// Guard against keys that collide with Object.prototype members
				// (e.g. `constructor`): without an own-property check the read
				// returns an inherited member and the spread below throws.
				const existing = Object.prototype.hasOwnProperty.call(merged, key)
					? merged[key]
					: [];
				merged[key] = [...new Set([...existing, ...actions])];
			}
			acRoles[role] = input.options.ac.newRole(merged);
		}
	}

	if (input.useMemoryCache) {
		acRoles = cacheAllRoles.get(input.organizationId) || acRoles;
	}
	cacheAllRoles.set(input.organizationId, acRoles);

	return hasPermissionFn(input, acRoles);
};
