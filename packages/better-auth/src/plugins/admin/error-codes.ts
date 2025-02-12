export const ADMIN_ERROR_CODES = {
	FAILED_TO_CREATE_USER: "Failed to create user",
	USER_ALREADY_EXISTS: "User already exists",
	USER_NOT_FOUND: "User not found",
	YOU_CANNOT_BAN_YOURSELF: "You cannot ban yourself",
	ONLY_ADMINS_CAN_ACCESS_THIS_ENDPOINT: "Only admins can access this endpoint",
	ROLE_NOT_FOUND: "Role not found",
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
} as const;
