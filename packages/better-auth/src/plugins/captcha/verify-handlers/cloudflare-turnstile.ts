import type { betterFetch } from "@better-fetch/fetch";
import { middlewareResponse } from "../../../utils/middleware-response";
import { EXTERNAL_ERROR_CODES, INTERNAL_ERROR_CODES } from "../error-codes";

type Params = {
	siteVerifyURL: string;
	secretKey: string;
	captchaResponse: string;
	remoteIP?: string | undefined;
	fetch: typeof betterFetch;
};

type SiteVerifyResponse = {
	success: boolean;
	"error-codes"?: string[] | undefined;
	challenge_ts?: string | undefined;
	hostname?: string | undefined;
	action?: string | undefined;
	cdata?: string | undefined;
	metadata?:
		| {
				interactive: boolean;
		  }
		| undefined;
	messages?: string[] | undefined;
};

export const cloudflareTurnstile = async ({
	siteVerifyURL,
	captchaResponse,
	secretKey,
	remoteIP,
	fetch,
}: Params) => {
	const response = await fetch<SiteVerifyResponse>(siteVerifyURL, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			secret: secretKey,
			response: captchaResponse,
			...(remoteIP && { remoteip: remoteIP }),
		}),
	});

	if (!response.data || response.error) {
		throw new Error(INTERNAL_ERROR_CODES.SERVICE_UNAVAILABLE.message);
	}

	if (!response.data.success) {
		return middlewareResponse({
			message: EXTERNAL_ERROR_CODES.VERIFICATION_FAILED.message,
			status: 403,
		});
	}

	return undefined;
};
