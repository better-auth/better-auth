import { defineErrorCodes } from "@better-auth/core/utils";

export const ERROR_CODES = defineErrorCodes({
	PASSWORD_REUSED:
		"This password has been used recently. Please choose a different password.",
});
