import type { GenericEndpointContext } from "@better-auth/core";
import { APIError } from "@better-auth/core/error";
import * as z from "zod";
import type { Role } from "../../access";
import type { OrganizationRole } from "../addons/dynamic-access-control/schema";
import type { RealOrganizationId } from "../helpers/get-org-adapter";
import { defaultRoles } from ".";
import type { HasPermissionBaseInput } from "./permission";
import { cacheAllRoles, hasPermissionFn } from "./permission";

export const hasPermission = async (
	input: {
		organizationId: RealOrganizationId;
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

	const dynamicAccessControl = input.options.use?.find(
		(x) => x.id === "dynamic-access-control",
	);

	if (
		ctx &&
		input.organizationId &&
		dynamicAccessControl &&
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

			let parsed: Record<string, string[]>;
			try {
				parsed = JSON.parse(permissionsString);
			} catch (error: unknown) {
				ctx.context.logger.error(
					"[hasPermission] Failed to parse permissions for role " + role,
					{
						permissions: permissionsString,
						error: error,
					},
				);
				throw new APIError("INTERNAL_SERVER_ERROR", {
					message: "Failed to parse permissions for role " + role,
				});
			}

			const result = z
				.record(z.string(), z.array(z.string()))
				.safeParse(parsed);

			if (!result.success) {
				ctx.context.logger.error(
					"[hasPermission] Invalid permissions for role " + role,
					{
						permissions: parsed,
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
		// Only read from cache, don't update it with potentially incomplete data
		acRoles = cacheAllRoles.get(input.organizationId) || acRoles;
	} else {
		// Only cache when fresh data was loaded from database
		cacheAllRoles.set(input.organizationId, acRoles);
	}

	return hasPermissionFn(input, acRoles);
};
