import { defineErrorCodes } from "@better-auth/core/utils/error-codes";

export const TEAMS_ERROR_CODES = defineErrorCodes({
	TEAM_NOT_FOUND: "Team not found",
	SLUG_IS_REQUIRED: "Team slug is required",
	SLUG_ALREADY_TAKEN: "That team slug already taken",
	FAILED_TO_CREATE_TEAM_MEMBER: "Failed to create team member",
	FAILED_TO_CREATE_TEAM: "Failed to create team",
	USER_IS_ALREADY_A_MEMBER_OF_THIS_TEAM:
		"User is already a member of this team",
});
