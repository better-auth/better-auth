import type { Role } from "../access";
import { role, standardAuthorizeTag } from "../access";
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

	// Preserve per-role authorize() semantics first, so custom Role
	// implementations keep working exactly as before.
	for (const role of roles) {
		const _role = acRoles[role as keyof typeof acRoles];
		if (_role?.authorize(input.permissions)?.success) {
			return true;
		}
	}

	// Fallback: evaluate the requested permissions against the union of the
	// held roles' statements. Evaluating each role independently against the
	// full requested set wrongly denies users whose permissions are split
	// across multiple roles (e.g. role A grants `a:use-a` and role B grants
	// `b:use-b`, but a check for both together fails because no single role
	// grants everything).
	//
	// This fallback rebuilds the check from `statements` alone, which would
	// silently bypass any custom authorize() logic — including custom denials
	// stricter than a role's statements. So it only runs when every held role
	// uses the standard statement-derived authorize; if any role is custom,
	// the previous per-role behavior above is the final answer.
	const roleObjects = roles
		.map((r) => acRoles[r as keyof typeof acRoles])
		.filter((r) => r !== undefined);
	if (roleObjects.length === 0) {
		return false;
	}
	const allStandard = roleObjects.every(
		(r) => (r.authorize as any)[standardAuthorizeTag] === true,
	);
	if (!allStandard) {
		return false;
	}

	// Uses a null-prototype object so resource names like `constructor` can't
	// collide with Object.prototype members.
	const aggregatedStatements: Record<string, string[]> = Object.create(null);
	for (const _role of roleObjects) {
		const statements = _role.statements as
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
