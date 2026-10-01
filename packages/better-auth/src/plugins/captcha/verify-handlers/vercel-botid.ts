import { middlewareResponse } from "../../../utils/middleware-response";
import { CAPTCHA_VERIFY_TIMEOUT_MS } from "../constants";
import { EXTERNAL_ERROR_CODES, INTERNAL_ERROR_CODES } from "../error-codes";
import type { BotIdVerification, ValidateRequestContext } from "../types";
import { withTimeout } from "../utils";

type Params = {
	request: Request;
	checkBotId: () => Promise<BotIdVerification>;
	validateRequest?: (ctx: ValidateRequestContext) => boolean | Promise<boolean>;
};

export const vercelBotId = async ({
	request,
	checkBotId,
	validateRequest,
}: Params) => {
	let isValid: boolean;
	try {
		isValid = await withTimeout(
			(async () => {
				const verification = await checkBotId();
				return validateRequest
					? validateRequest({ request, verification })
					: verification.isBot === false;
			})(),
			CAPTCHA_VERIFY_TIMEOUT_MS,
		);
	} catch (error) {
		throw new Error(INTERNAL_ERROR_CODES.SERVICE_UNAVAILABLE.message, {
			cause: error,
		});
	}

	if (isValid) return undefined;

	return middlewareResponse({
		message: EXTERNAL_ERROR_CODES.VERIFICATION_FAILED.message,
		code: EXTERNAL_ERROR_CODES.VERIFICATION_FAILED.code,
		status: 403,
	});
};
