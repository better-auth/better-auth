import { betterFetch } from "@better-fetch/fetch";
import { middlewareResponse } from "../../../utils/middleware-response";
import { EXTERNAL_ERROR_CODES, INTERNAL_ERROR_CODES } from "../error-codes";
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
	credit: true | false | undefined;
	"error-codes":
		| Array<
				| "missing-input-secret"
				| "invalid-input-secret"
				| "missing-input-response"
				| "invalid-input-response"
				| "expired-input-response"
				| "already-seen-response"
				| "bad-request"
				| "missing-remoteip"
				| "invalid-remoteip"
				| "not-using-dummy-passcode"
				| "sitekey-secret-mismatch"
		  >
		| undefined;
	score: number | undefined; // ENTERPRISE feature: a score denoting malicious activity.
	score_reason: Array<unknown> | undefined; // ENTERPRISE feature: reason(s) for score.
};

export const hCaptcha = async ({
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
