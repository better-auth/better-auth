import type { OrganizationOptions } from "./types";
import { defaultRoles } from "./access";
import type { GenericEndpointContext } from "../../types";
import type { Role } from "../access";
import * as z from "zod/v4";
import { APIError } from "../../api";
import type { organizationRole } from "./schema";

type PermissionExclusive =
	| {
			/**
			 * @deprecated Use `permissions` instead
			 */
			permission: { [key: string]: string[] };
			permissions?: never;
	  }
	| {
			permissions: { [key: string]: string[] };
			permission?: never;
	  };

let cacheAllRoles: {
	[x: string]: Role<any> | undefined;
} | null = null;

export const hasPermission = async (
	input: {
		role: string;
		organizationId: string;
		options: OrganizationOptions;
		allowCreatorAllPermissions?: boolean;
		/**
		 * If true, will use the in-memory cache of the roles.
		 * Keep in mind to use this in a stateless mindset, the purpose of this is to avoid unnecessary database calls when running multiple
		 * hasPermission calls in a row.
		 *
		 * @default false
		 */
		useMemoryCache?: boolean;
	} & PermissionExclusive,
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
			organizationRole & { permission: string }
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
		acRoles = cacheAllRoles || acRoles;
	}
	cacheAllRoles = acRoles;

	return hasPermissionFn(input, acRoles);
};

/**
 * Using the same `hasPermissionFn` function, but without the need for a `ctx` perameter or the `organizationId` perameter.
 */
export const clientSideHasPermission = async (
	input: {
		role: string;
		options: OrganizationOptions;
		allowCreatorAllPermissions?: boolean;
	} & PermissionExclusive,
) => {
	const acRoles: {
		[x: string]: Role<any> | undefined;
	} = input.options.roles || defaultRoles;

	return hasPermissionFn(input, acRoles);
};

const hasPermissionFn = (
	input: {
		role: string;
		options: OrganizationOptions;
		allowCreatorAllPermissions?: boolean;
	} & PermissionExclusive,
	acRoles: {
		[x: string]: Role<any> | undefined;
	},
) => {
	if (!input.permissions && !input.permission) return false;

	const roles = input.role.split(",");
	const creatorRole = input.options.creatorRole || "owner";
	const isCreator = roles.includes(creatorRole);

	const allowCreatorsAllPermissions = input.allowCreatorAllPermissions || false;
	if (isCreator && allowCreatorsAllPermissions) return true;

	for (const role of roles) {
		const _role = acRoles[role as keyof typeof acRoles];
		const result = _role?.authorize(input.permissions ?? input.permission);
		if (result?.success) {
			return true;
		}
	}
	return false;
};
