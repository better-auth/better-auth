import { type Role, mergeRoles } from "../access";
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
	const roles = (input.role || input.options?.defaultRole || "user")
		.split(",")
		.map((r) => r.trim())
		.filter(Boolean);
	const acRoles = input.options?.roles || defaultRoles;
	const getRole = (name: string): Role<any> | undefined =>
		Object.hasOwn(acRoles, name)
			? (acRoles[name as keyof typeof acRoles] as Role<any>)
			: undefined;

	for (const role of roles) {
		const _role = getRole(role);
		const result = _role?.authorize(input.permissions);
		if (result?.success) {
			return true;
		}
	}

	if (roles.length > 1) {
		const resolvedRoles = roles
			.map((r) => getRole(r))
			.filter((r): r is Role<any> => Boolean(r));
		if (resolvedRoles.length > 1) {
			const merged = mergeRoles(resolvedRoles);
			return merged.authorize(input.permissions).success;
		}
	}

	return false;
};
