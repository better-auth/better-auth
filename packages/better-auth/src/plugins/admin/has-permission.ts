import { role } from "../access";
import { defaultRoles } from "./access";
import type { AdminOptions } from "./types";

type PermissionExclusive = {
	permissions: { [key: string]: string[] };
};

export const hasPermission = (
	input: {
		userId?: string | undefined;
		role?: string | undefined;
		options?: AdminOptions | undefined;
	} & PermissionExclusive,
) => {
	if (input.userId && input.options?.adminUserIds?.includes(input.userId)) {
		return true;
	}
	if (!input.permissions) {
		return false;
	}
	const roles = (input.role || input.options?.defaultRole || "user").split(",");
	const acRoles = input.options?.roles || defaultRoles;

	// Merge the statements of every role the user holds into a single set so a
	// permission is granted if *any* of the roles grants it, rather than
	// requiring a single role to grant all requested permissions.
	// @see https://github.com/better-auth/better-auth/issues/3011
	const mergedStatements: Record<string, string[]> = {};
	for (const r of roles) {
		const _role = acRoles[r as keyof typeof acRoles];
		if (!_role) continue;
		for (const [resource, actions] of Object.entries(_role.statements)) {
			const existing = mergedStatements[resource] ?? [];
			mergedStatements[resource] = [
				...new Set([...existing, ...(actions as readonly string[])]),
			];
		}
	}

	const result = role(mergedStatements).authorize(input.permissions);
	return result.success;
};
