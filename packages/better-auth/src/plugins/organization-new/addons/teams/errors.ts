import { defineErrorCodes } from "@better-auth/core/utils/error-codes";

export const TEAMS_ERROR_CODES = defineErrorCodes({
	SLUG_IS_REQUIRED: "Team slug is required",
	SLUG_ALREADY_TAKEN: "That team slug already taken",
	FAILED_TO_CREATE_TEAM_MEMBER: "FAILED_TO_CREATE_TEAM_MEMBER",
	FAILED_TO_CREATE_TEAM: "FAILED_TO_CREATE_TEAM",
});
