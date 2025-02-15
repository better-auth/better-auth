import { defaultRoles } from "./access";
import type { AdminOptions } from "./admin";

export const hasPermission = (input: {
	role?: string;
	options: AdminOptions;
	permission: {
		[key: string]: string[];
	};
}) => {
	const roles = (input.role || input.options.defaultRole || "user").split(",");
	const acRoles = input.options.roles || defaultRoles;
	for (const role of roles) {
		const _role = acRoles[role as keyof typeof acRoles];
		const result = _role?.authorize(input.permission);
		if (result?.success) {
			return true;
		}
	}
	return false;
};
