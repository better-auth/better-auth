import { betterFetch } from "@better-fetch/fetch";
import { middlewareResponse } from "../../../utils/middleware-response";
import { EXTERNAL_ERROR_CODES, INTERNAL_ERROR_CODES } from "../error-codes";

type Params = {
	siteVerifyURL: string;
	secretKey: string;
	captchaResponse: string;
	remoteIP?: string;
};

type SiteVerifyResponse = {
	success: boolean;
};

export const cap = async ({
	siteVerifyURL,
	captchaResponse,
	secretKey,
	remoteIP,
}: Params) => {
	const response = await betterFetch<SiteVerifyResponse>(siteVerifyURL, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			secret: secretKey,
			response: captchaResponse,
			...(remoteIP && { remoteip: remoteIP }),
		}),
	});

	if (!response.data || response.error) {
		throw new Error(INTERNAL_ERROR_CODES.SERVICE_UNAVAILABLE);
	}

	if (!response.data.success) {
		return middlewareResponse({
			message: EXTERNAL_ERROR_CODES.VERIFICATION_FAILED,
			status: 403,
		});
	}

	return undefined;
};
