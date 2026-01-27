import { defineErrorCodes } from "@better-auth/core/utils/error-codes";

export const ADMIN_ERROR_CODES = defineErrorCodes({
	ERR_FAILED_TO_CREATE_USER: "Failed to create user",
	ERR_USER_ALREADY_EXISTS: "User already exists.",
	ERR_USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
		"User already exists. Use another email.",
	ERR_YOU_CANNOT_BAN_YOURSELF: "You cannot ban yourself",
	ERR_YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE:
		"You are not allowed to change users role",
	ERR_YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS: "You are not allowed to create users",
	ERR_YOU_ARE_NOT_ALLOWED_TO_LIST_USERS: "You are not allowed to list users",
	ERR_YOU_ARE_NOT_ALLOWED_TO_LIST_USERS_SESSIONS:
		"You are not allowed to list users sessions",
	ERR_YOU_ARE_NOT_ALLOWED_TO_BAN_USERS: "You are not allowed to ban users",
	ERR_YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS:
		"You are not allowed to impersonate users",
	ERR_YOU_ARE_NOT_ALLOWED_TO_REVOKE_USERS_SESSIONS:
		"You are not allowed to revoke users sessions",
	ERR_YOU_ARE_NOT_ALLOWED_TO_DELETE_USERS: "You are not allowed to delete users",
	ERR_YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD:
		"You are not allowed to set users password",
	ERR_BANNED_USER: "You have been banned from this application",
	ERR_YOU_ARE_NOT_ALLOWED_TO_GET_USER: "You are not allowed to get user",
	ERR_NO_DATA_TO_UPDATE: "No data to update",
	ERR_YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS: "You are not allowed to update users",
	ERR_YOU_CANNOT_REMOVE_YOURSELF: "You cannot remove yourself",
	ERR_YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE:
		"You are not allowed to set a non-existent role value",
	ERR_YOU_CANNOT_IMPERSONATE_ADMINS: "You cannot impersonate admins",
	ERR_INVALID_ROLE_TYPE: "Invalid role type",
});
