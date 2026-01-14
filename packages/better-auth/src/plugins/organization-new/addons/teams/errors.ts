import { defineErrorCodes } from "@better-auth/core/utils/error-codes";

export const TEAMS_ERROR_CODES = defineErrorCodes({
	FAILED_TO_CREATE_TEAM_MEMBER: "FAILED_TO_CREATE_TEAM_MEMBER",
	FAILED_TO_CREATE_TEAM: "FAILED_TO_CREATE_TEAM",
});
