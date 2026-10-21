import type { Role } from "../access";
import type { OrganizationOptions } from "./types";

export const hasPermissionFn = (
	input: HasPermissionBaseInput & { teamRole?: string },
	acRoles: {
		[x: string]: Role<any> | undefined;
	},
) => {
	if (!input.permissions) return false;

	const orgRoles = input.role ? input.role.split(",").map((r) => r.trim()).filter(Boolean) : [];
	const teamRoles = input.teamRole !== undefined ? input.teamRole.split(",").map((r) => r.trim()).filter(Boolean) : undefined;
	
	const creatorRole = input.options.creatorRole || "owner";
	const isCreator = orgRoles.includes(creatorRole);

	const allowCreatorsAllPermissions = input.allowCreatorAllPermissions || false;
	if (isCreator && allowCreatorsAllPermissions) return true;

	for (const role of orgRoles) {
		const _role = acRoles[role as keyof typeof acRoles];
		const result = _role?.authorize(input.permissions);
		if (result?.success) {
			return true;
		}
	}

	if (teamRoles !== undefined) {
		if (teamRoles.length === 0) return false;
		for (const role of teamRoles) {
			const _role = acRoles[role as keyof typeof acRoles];
			const result = _role?.authorize(input.permissions);
			if (result?.success) {
				return true;
			}
		}
	}

	return false;
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
	role?: string;
	options: OrganizationOptions;
	allowCreatorAllPermissions?: boolean | undefined;
} & PermissionExclusive;
