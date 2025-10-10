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

	const finalPermissionsPartial = (() => {
		// Check if user has a special role, then return special permissions
		const isSpecialRole = roles.some((role) => specialRoles.includes(role));
		if (isSpecialRole) {
			return input.specialPermissions || {};
		}

		// Use role-based permissions for regular roles
		const roleStatements = !input.role
			? {}
			: input.options?.roles?.[input.role]?.statements || {};
		return Object.entries(roleStatements).reduce(
			(acc, [resource, actions]) => {
				if (actions) {
					acc[resource] = actions;
				}
				return acc;
			},
			{} as Record<string, string[]>,
		);
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
