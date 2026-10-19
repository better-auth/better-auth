import type { Role } from "../access";
import { role } from "../access";
import type { OrganizationOptions } from "./types";

export const hasPermissionFn = (
	input: HasPermissionBaseInput,
	acRoles: {
		[x: string]: Role<any> | undefined;
	},
) => {
	if (!input.permissions) return false;

	const roles = input.role.split(",");
	const creatorRole = input.options.creatorRole || "owner";
	const isCreator = roles.includes(creatorRole);

	const allowCreatorsAllPermissions = input.allowCreatorAllPermissions || false;
	if (isCreator && allowCreatorsAllPermissions) return true;

	// Aggregate the statements of every role the user holds before authorizing.
	// Evaluating each role independently against the full requested permission set
	// wrongly denies users whose permissions are split across multiple roles
	// (e.g. role A grants `a:use-a` and role B grants `b:use-b`, but a check for
	// both together fails because no single role grants everything).
	const aggregatedStatements: Record<string, string[]> = {};
	for (const role of roles) {
		const statements = acRoles[role as keyof typeof acRoles]?.statements as
			| Record<string, string[]>
			| undefined;
		if (!statements) {
			continue;
		}
		for (const [resource, actions] of Object.entries(statements)) {
			aggregatedStatements[resource] = [
				...new Set([...(aggregatedStatements[resource] ?? []), ...actions]),
			];
		}
	}
	if (Object.keys(aggregatedStatements).length === 0) {
		return false;
	}
	return role(aggregatedStatements).authorize(input.permissions).success;
};

export type PermissionExclusive = {
	permissions: { [key: string]: string[] };
};

export const cacheAllRoles = new Map<
	string,
	{
		[x: string]: Role<any> | undefined;
	}
>();

export type HasPermissionBaseInput = {
	role: string;
	options: OrganizationOptions;
	allowCreatorAllPermissions?: boolean | undefined;
} & PermissionExclusive;
