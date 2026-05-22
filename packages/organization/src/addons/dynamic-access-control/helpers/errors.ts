import { defineErrorCodes } from "@better-auth/core/utils/error-codes";

export const DYNAMIC_ACCESS_CONTROL_ERROR_CODES = defineErrorCodes({
	DYNAMIC_ACCESS_CONTROL_NOT_ENABLED: "Dynamic access control is not enabled",
	ROLE_NOT_FOUND: "Role not found",
	ROLE_ALREADY_EXISTS:
		"A role with this name already exists in the organization",
	FAILED_TO_CREATE_ROLE: "Failed to create role",
	FAILED_TO_UPDATE_ROLE: "Failed to update role",
	FAILED_TO_DELETE_ROLE: "Failed to delete role",
	CANNOT_DELETE_DEFAULT_ROLE: "Cannot delete a default role",
	ROLE_IS_IN_USE: "Role is currently assigned to members",
});
