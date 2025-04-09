export const ADMIN_ERROR_CODES = {
	FAILED_TO_CREATE_USER: "Failed to create user",
	USER_ALREADY_EXISTS: "User already exists",
	YOU_ARE_NOT_ALLOWED_TO_LIST_ROLES: "You are not allowed to list roles",
	YOU_ARE_NOT_ALLOWED_TO_VIEW_ROLE_PERMISSIONS:
		"You are not allowed to view role permissions",
	YOU_CANNOT_BAN_YOURSELF: "You cannot ban yourself",
	YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE:
		"You are not allowed to change users role",
	YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS: "You are not allowed to create users",
	YOU_ARE_NOT_ALLOWED_TO_LIST_USERS: "You are not allowed to list users",
	YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS:
		"You are not allowed to list users sessions",
	YOU_ARE_NOT_ALLOWED_TO_BAN_USERS: "You are not allowed to ban users",
	YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS:
		"You are not allowed to impersonate users",
	YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS:
		"You are not allowed to revoke users sessions",
	YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS: "You are not allowed to delete users",
	YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD:
		"You are not allowed to set users password",
	BANNED_USER: "You have been banned from this application",
	ROLE_NOT_PROVIDED: "Role not provided",
	ROLE_NOT_FOUND: "Role not found",
} as const;
