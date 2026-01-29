import { defineErrorCodes } from "@better-auth/core/utils/error-codes";

export const TEAMS_ERROR_CODES = defineErrorCodes({
	SLUG_IS_REQUIRED: "Team slug is required",
	SLUG_ALREADY_TAKEN: "That team slug already taken",
	FAILED_TO_CREATE_TEAM_MEMBER: "Failed to create team member",
	FAILED_TO_CREATE_TEAM: "Failed to create team",
});
