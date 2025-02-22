import { betterFetch } from "@better-fetch/fetch";
import { middlewareResponse } from "../../../utils/middleware-response";
import { CAPTCHA_ERROR_CODES } from "../error-codes";
import type { GoogleReCAPTCHASiteVerifyResponse } from "../types";

type Params = {
	siteVerifyURL: string;
	secretKey: string;
	captchaResponse: string;
};

export const googleReCAPTCHA = async ({
	siteVerifyURL,
	captchaResponse,
	secretKey,
}: Params) => {
	const response = await betterFetch<GoogleReCAPTCHASiteVerifyResponse>(
		siteVerifyURL,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				secret: secretKey,
				response: captchaResponse,
			}),
		},
	);

	if (!response.data || response.error) {
		return middlewareResponse({
			message: CAPTCHA_ERROR_CODES.SERVICE_UNAVAILABLE,
			status: 503,
		});
	}

	if (!response.data.success) {
		return middlewareResponse({
			message: CAPTCHA_ERROR_CODES.VERIFICATION_FAILED,
			status: 403,
		});
	}

	return undefined;
};
