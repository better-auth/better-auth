import { defineErrorCodes } from "@better-auth/core/utils/error-codes";

export const DBSC_ERROR_CODES = defineErrorCodes({
	INVALID_REGISTRATION: "Invalid device-bound session registration",
	SESSION_ALREADY_BOUND: "Session is already bound to a device",
});
