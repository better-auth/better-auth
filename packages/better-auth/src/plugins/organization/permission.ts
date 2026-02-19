import type { Role } from "../access";
import type { OrganizationOptions } from "./types";

export type HasPermissionResult = {
	success: boolean;
	error?: string;
	missingRoles?: string[];
};

export const hasPermissionFn = (
	input: HasPermissionBaseInput,
	acRoles: {
		[x: string]: Role<any> | undefined;
	},
): HasPermissionResult => {
	if (!input.permissions) {
		return { success: false, error: "No permissions provided" };
	}

	const roles = input.role.split(",");
	const creatorRole = input.options.creatorRole || "owner";
	const isCreator = roles.includes(creatorRole);

	const allowCreatorsAllPermissions = input.allowCreatorAllPermissions || false;
	if (isCreator && allowCreatorsAllPermissions) return { success: true };

	const missingRoles: string[] = [];
	const availableRoles = Object.keys(acRoles);

	for (const role of roles) {
		const _role = acRoles[role as keyof typeof acRoles];
		if (!_role) {
			missingRoles.push(role);
			continue;
		}
		const result = _role.authorize(input.permissions);
		if (result?.success) {
			return { success: true };
		}
	}

	if (missingRoles.length > 0) {
		const allRolesMissing = missingRoles.length === roles.length;
		if (allRolesMissing) {
			return {
				success: false,
				error: `Role${missingRoles.length > 1 ? "s" : ""} "${missingRoles.join(", ")}" not found in configured roles. Available roles: ${availableRoles.join(", ")}`,
				missingRoles,
			};
		}
	}

	return { success: false };
};

export type PermissionExclusive = {
	permissions: { [key: string]: string[] };
};

export const cacheAllRoles = new Map<
	string,
	{
		[x: string]: Role<any> | undefined;
	}
>();

export type HasPermissionBaseInput = {
	role: string;
	options: OrganizationOptions;
	allowCreatorAllPermissions?: boolean | undefined;
} & PermissionExclusive;
