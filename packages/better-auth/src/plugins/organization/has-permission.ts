import { defaultRoles } from "./access";
import type { OrganizationOptions } from "./organization";

export const hasPermission = (input: {
	role: string;
	options: OrganizationOptions;
	/**
	 * @deprecated Use `permissions` instead
	 */
	permission?: { [key: string]: string[] };
	permissions?: { [key: string]: string[] };
}) => {
	if (!input?.permissions && !input?.permission) {
		return false;
	}
	const roles = input.role.split(",");
	const acRoles = input.options.roles || defaultRoles;
	for (const role of roles) {
		const _role = acRoles[role as keyof typeof acRoles];
		const result = _role?.authorize(input.permissions);
		if (result?.success) {
			return true;
		}
	}
	return false;
};
