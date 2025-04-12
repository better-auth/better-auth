import { defaultRoles } from "./access";
import type { OrganizationOptions } from "./organization";

export const hasPermission = (input: {
	role: string;
	customRole?: string;
	options: OrganizationOptions;
	permission: {
		[key: string]: string[];
	};
}) => {
	const roles = input.role.split(",");
	const acRoles = input.options.roles || defaultRoles;
	for (const role of roles) {
		const _role = acRoles[role as keyof typeof acRoles];
		const result = _role?.authorize(input.permission, input.customRole || '');
		if (result?.success) {
			return true;
		}
	}
	return false;
};
