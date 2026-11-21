import { authorizeRoles } from "../access";
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
	const acRoles = (input.options?.roles || defaultRoles) as Record<
		string,
		any
	>;

	return authorizeRoles(roles, acRoles, input.permissions);
};
