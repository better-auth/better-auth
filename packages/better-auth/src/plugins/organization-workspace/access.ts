export const defaultStatements = [
	// Workspace permissions
	"workspace:create",
	"workspace:read",
	"workspace:update",
	"workspace:delete",
	"workspace:list",

	// Workspace member permissions
	"workspace-member:add",
	"workspace-member:remove",
	"workspace-member:update-role",
	"workspace-member:list",
] as const;

export const defaultRoles = {
	owner: [
		"workspace:create",
		"workspace:read",
		"workspace:update",
		"workspace:delete",
		"workspace:list",
		"workspace-member:add",
		"workspace-member:remove",
		"workspace-member:update-role",
		"workspace-member:list",
	],
	admin: [
		"workspace:create",
		"workspace:read",
		"workspace:update",
		"workspace:list",
		"workspace-member:add",
		"workspace-member:remove",
		"workspace-member:update-role",
		"workspace-member:list",
	],
	member: ["workspace:read", "workspace:list", "workspace-member:list"],
} as const;

// Helper function to check if a role has a specific permission
export function hasRolePermission(role: string, permission: string): boolean {
	const rolePermissions = defaultRoles[role as keyof typeof defaultRoles];
	return rolePermissions
		? (rolePermissions as readonly string[]).includes(permission)
		: false;
}

// Helper function to check role permissions with object syntax
export function checkRolePermissions(params: {
	role: string;
	permissions: { workspace?: string[]; "workspace-member"?: string[] };
	options?: unknown;
}): boolean {
	const { role, permissions } = params;

	// Check workspace permissions
	if (permissions.workspace) {
		const workspaceCheck = permissions.workspace.every((permission) =>
			hasRolePermission(role, `workspace:${permission}`),
		);
		if (!workspaceCheck) return false;
	}

	// Check workspace-member permissions
	if (permissions["workspace-member"]) {
		const memberCheck = permissions["workspace-member"].every((permission) =>
			hasRolePermission(role, `workspace-member:${permission}`),
		);
		if (!memberCheck) return false;
	}

	return true;
}
