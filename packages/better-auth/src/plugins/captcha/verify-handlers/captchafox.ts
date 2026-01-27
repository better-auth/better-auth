import { betterFetch } from "@better-fetch/fetch";
import { middlewareResponse } from "../../../utils/middleware-response";
import { CAPCHA_CLIENT_SIDE_ERROR_CODES, CAPTCHA_SERVER_SIDE_ERROR_CODES } from "../error-codes";
import { encodeToURLParams } from "../utils";

type Params = {
	siteVerifyURL: string;
	secretKey: string;
	captchaResponse: string;
	siteKey?: string | undefined;
	remoteIP?: string | undefined;
};

type SiteVerifyResponse = {
	success: boolean;
	challenge_ts: number;
	hostname: string;
	"error-codes":
		| Array<
				| "missing-input-secret"
				| "invalid-input-secret"
				| "invalid-input-sitekey"
				| "missing-input-response"
				| "invalid-input-response"
				| "expired-input-response"
				| "timeout-or-duplicate"
				| "bad-request"
		  >
		| undefined;
	insights: Record<string, unknown> | undefined; // ENTERPRISE feature: insights into verification.
};

export const captchaFox = async ({
	siteVerifyURL,
	captchaResponse,
	secretKey,
	siteKey,
	remoteIP,
}: Params) => {
	const response = await betterFetch<SiteVerifyResponse>(siteVerifyURL, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: encodeToURLParams({
			secret: secretKey,
			response: captchaResponse,
			...(siteKey && { sitekey: siteKey }),
			...(remoteIP && { remoteIp: remoteIP }),
		}),
	});

	if (!response.data || response.error) {
		throw new Error(CAPTCHA_SERVER_SIDE_ERROR_CODES.ERR_SERVICE_UNAVAILABLE.message);
	}

	if (!response.data.success) {
		return middlewareResponse({
			message: CAPCHA_CLIENT_SIDE_ERROR_CODES.ERR_VERIFICATION_FAILED.message,
			status: 403,
		});
	}

	return undefined;
};
