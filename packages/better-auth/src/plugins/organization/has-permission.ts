import type { GenericEndpointContext } from "@better-auth/core";
import * as z from "zod";
import { APIError } from "../../api";
import type { Role } from "../access";
import { defaultRoles } from "./access";
import type { HasPermissionBaseInput } from "./permission";
import { cacheAllRoles, hasPermissionFn } from "./permission";
import type { OrganizationRole } from "./schema";

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
			// If it's for an existing role, skip as we shouldn't override hard-coded roles.
			if (role in acRoles) continue;

			const result = z
				.record(z.string(), z.array(z.string()))
				.safeParse(JSON.parse(permissionsString));

			if (!result.success) {
				ctx.context.logger.error(
					"[hasPermission] Invalid permissions for role " + role,
					{
						permissions: JSON.parse(permissionsString),
					},
				);
				throw new APIError("INTERNAL_SERVER_ERROR", {
					message: "Invalid permissions for role " + role,
				});
			}

			acRoles[role] = input.options.ac.newRole(result.data);
		}
	}

	if (input.useMemoryCache) {
		acRoles = cacheAllRoles.get(input.organizationId) || acRoles;
	}
	cacheAllRoles.set(input.organizationId, acRoles);

	return hasPermissionFn(input, acRoles);
};
