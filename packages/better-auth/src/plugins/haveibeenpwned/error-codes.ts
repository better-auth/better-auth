import { defineErrorCodes } from "@better-auth/core/utils/error-codes";

export const HAVE_I_BEEN_PWNED_ERROR_CODES = defineErrorCodes({
	PASSWORD_COMPROMISED:
		"The password you entered has been compromised. Please choose a different password.",
});
