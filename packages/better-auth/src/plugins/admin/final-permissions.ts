import { defaultRoles } from "./access";
import type {
	AdminOptions,
	FinalPermissions,
	SpecialPermissions,
} from "./types";

export const getFinalPermissions = (input: {
	userId?: string;
	role?: string;
	options?: AdminOptions;
	specialPermissions?: SpecialPermissions;
}): FinalPermissions => {
	if (input.userId && input.options?.adminUserIds?.includes(input.userId)) {
		return input.options?.ac?.statements || {};
	}
	const roles = (input.role || input.options?.defaultRole || "user").split(",");
	const specialRoles = input.options?.specialRoles || [];
	const acRoles = input.options?.roles || defaultRoles;

	const finalPermissionsPartial = (() => {
		// Check if user has a special role, then return special permissions
		const isSpecialRole = roles.some((role) => specialRoles.includes(role));
		if (isSpecialRole) {
			return input.specialPermissions || {};
		}

		// Use role-based permissions for regular roles
		const combined: Record<string, string[]> = {};
		for (const role of roles) {
			const roleStatements =
				acRoles[role as keyof typeof acRoles]?.statements || {};
			for (const [resource, actions] of Object.entries(roleStatements)) {
				if (actions) {
					combined[resource] = [
						...new Set([...(combined[resource] || []), ...actions]),
					];
				}
			}
		}
		return combined;
	})();

	// add empty arrays for resources that are not in finalPermissionsPartial
	const finalPermissions = !input.options?.ac?.statements
		? finalPermissionsPartial
		: Object.fromEntries(
				Object.keys(input.options.ac.statements).map((resource) => {
					if (!finalPermissionsPartial[resource]) {
						return [resource, []];
					}
					return [resource, finalPermissionsPartial[resource]];
				}),
			);
	return finalPermissions as FinalPermissions;
};
