import { role as createRole, type Role, type Statements } from "../access";
import { parseRoleList } from "./roles";
import type { OrganizationOptions } from "./types";

export const hasPermissionFn = (
	input: HasPermissionBaseInput,
	acRoles: {
		[x: string]: Role<Statements> | undefined;
	},
) => {
	if (!input.permissions) return false;

	const roles = parseRoleList(input.role);
	const creatorRole = input.options.creatorRole || "owner";
	const isCreator = roles.includes(creatorRole);

	const allowCreatorsAllPermissions = input.allowCreatorAllPermissions || false;
	if (isCreator && allowCreatorsAllPermissions) return true;

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

export type PermissionExclusive = {
	permissions: { [key: string]: string[] };
};

export type HasPermissionBaseInput = {
	role: string | string[];
	options: OrganizationOptions;
	allowCreatorAllPermissions?: boolean | undefined;
} & PermissionExclusive;
