import { role as createRole } from "../access";
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
	for (const role of roles) {
		const _role = acRoles[role as keyof typeof acRoles];
		const result = _role?.authorize(input.permissions);
		if (result?.success) {
			return true;
		}
	}
	if (roles.length > 1) {
		const mergedStatements: Record<string, string[]> = {};
		for (const role of roles) {
			const _role = acRoles[role as keyof typeof acRoles];
			if (_role?.statements) {
				for (const [resource, actions] of Object.entries(_role.statements)) {
					const existing = mergedStatements[resource];
					if (!existing) {
						mergedStatements[resource] = [...actions];
					} else {
						for (const action of actions) {
							if (!existing.includes(action)) {
								existing.push(action);
							}
						}
					}
				}
			}
		}
		const combinedRole = createRole(mergedStatements);
		const result = combinedRole.authorize(input.permissions);
		if (result.success) {
			return true;
		}
	}
	return false;
};
