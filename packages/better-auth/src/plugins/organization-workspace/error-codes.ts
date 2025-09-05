export const WORKSPACE_ERROR_CODES = {
	WORKSPACE_NOT_FOUND: "Workspace not found",
	NO_ACTIVE_WORKSPACE: "No active workspace found",
	NO_ACTIVE_ORGANIZATION:
		"No organization specified and no active organization found",
	USER_NOT_WORKSPACE_MEMBER: "User is not a member of this workspace",
	WORKSPACE_MEMBER_NOT_FOUND: "Workspace member not found",
	INSUFFICIENT_PERMISSIONS: "Insufficient permissions to perform this action",
	WORKSPACE_SLUG_TAKEN: "Workspace slug is already taken",
	WORKSPACE_ALREADY_EXISTS: "Workspace already exists",
	WORKSPACE_MEMBER_ALREADY_EXISTS: "User is already a member of this workspace",
	CANNOT_REMOVE_LAST_OWNER: "Cannot remove the last owner from workspace",
	CANNOT_MODIFY_OWN_ROLE: "Cannot modify your own role",
	ORGANIZATION_NOT_FOUND: "Organization not found",
	USER_NOT_ORGANIZATION_MEMBER: "User is not a member of this organization",
} as const;
