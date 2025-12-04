// NOTE: Error code const must be all capital of string (ref https://github.com/better-auth/better-auth/issues/4386)
import { defineErrorCodes } from "@better-auth/core/utils";

export const ADMIN_ERROR_CODES = defineErrorCodes({
	FAILED_TO_CREATE_USER: "Failed to create user",
	USER_ALREADY_EXISTS: "User already exists.",
	USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
		"User already exists. Use another email.",
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
	YOU_ARE_NOT_ALLOWED_TO_GET_USER: "You are not allowed to get user",
	NO_DATA_TO_UPDATE: "No data to update",
	YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS: "You are not allowed to update users",
	YOU_CANNOT_REMOVE_YOURSELF: "You cannot remove yourself",
	YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE:
		"You are not allowed to set a non-existent role value",
});
