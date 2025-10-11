import { role } from "../access";
import { defaultRoles } from "./access";
import type { AdminOptions, SpecialPermissions } from "./types";

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

export const hasPermission = (
	input: {
		userId?: string;
		role?: string;
		options?: AdminOptions;
		specialPermissions?: SpecialPermissions;
	} & PermissionExclusive,
) => {
	if (input.userId && input.options?.adminUserIds?.includes(input.userId)) {
		return true;
	}
	if (!input.permissions && !input.permission) {
		return false;
	}
	const roles = (input.role || input.options?.defaultRole || "user").split(",");
	const specialRoles = input.options?.specialRoles || [];

	// Check if user has a special role and custom permissions
	const isSpecialRole = roles.some((role) => specialRoles.includes(role));
	if (isSpecialRole) {
		if (!input.specialPermissions) {
			return false;
		}
		const dynamicStatements = Object.entries(input.specialPermissions).reduce(
			(acc, [key, value]) => {
				if (!value) {
					return acc;
				}
				acc[key] = value;
				return acc;
			},
			{} as Record<string, string[]>,
		);
		const dynamicRole = role(dynamicStatements);
		const result = dynamicRole.authorize(input.permission ?? input.permissions);
		if (result?.success) {
			return true;
		}
	}

	// Use role-based permissions for regular roles
	const acRoles = input.options?.roles || defaultRoles;
	for (const role of roles) {
		const _role = acRoles[role as keyof typeof acRoles];
		const result = _role?.authorize(input.permission ?? input.permissions);
		if (result?.success) {
			return true;
		}
	}
	return false;
};
