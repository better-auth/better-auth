import { betterFetch } from "@better-fetch/fetch";
import { middlewareResponse } from "../../../utils/middleware-response";
import { CAPTCHA_VERIFY_TIMEOUT_MS } from "../constants";
import { EXTERNAL_ERROR_CODES, INTERNAL_ERROR_CODES } from "../error-codes";
import { encodeToURLParams } from "../utils";

type Params = {
	siteVerifyURL: string;
	secretKey: string;
	captchaResponse: string;
	minScore?: number | undefined;
	remoteIP?: string | undefined;
	expectedAction?: string | undefined;
	allowedHostnames?: string[] | undefined;
};

type SiteVerifyResponse = {
	success: boolean;
	challenge_ts: string;
	hostname: string;
	action?: string | undefined;
	"error-codes":
		| Array<
				| "missing-input-secret"
				| "invalid-input-secret"
				| "missing-input-response"
				| "invalid-input-response"
				| "bad-request"
				| "timeout-or-duplicate"
		  >
		| undefined;
};

type SiteVerifyV3Response = SiteVerifyResponse & {
	score: number;
};

const isV3 = (
	response: SiteVerifyResponse | SiteVerifyV3Response,
): response is SiteVerifyV3Response => {
	return "score" in response && typeof response.score === "number";
};

export const googleRecaptcha = async ({
	siteVerifyURL,
	captchaResponse,
	secretKey,
	minScore = 0.5,
	remoteIP,
	expectedAction,
	allowedHostnames,
}: Params) => {
	const response = await betterFetch<SiteVerifyResponse | SiteVerifyV3Response>(
		siteVerifyURL,
		{
			method: "POST",
			timeout: CAPTCHA_VERIFY_TIMEOUT_MS,
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: encodeToURLParams({
				secret: secretKey,
				response: captchaResponse,
				...(remoteIP && { remoteip: remoteIP }),
			}),
		},
	);

	if (!response.data || response.error) {
		throw new Error(INTERNAL_ERROR_CODES.SERVICE_UNAVAILABLE.message);
	}

	const verificationFailed = () =>
		middlewareResponse({
			message: EXTERNAL_ERROR_CODES.VERIFICATION_FAILED.message,
			code: EXTERNAL_ERROR_CODES.VERIFICATION_FAILED.code,
			status: 403,
		});

	if (
		!response.data.success ||
		(isV3(response.data) && response.data.score < minScore)
	) {
		return verificationFailed();
	}

	// When configured, bind the token to the expected v3 action and to an
	// allow-list of hostnames so a token minted for a different action or site
	// cannot be replayed against this endpoint.
	if (expectedAction && response.data.action !== expectedAction) {
		return verificationFailed();
	}
	if (
		allowedHostnames &&
		allowedHostnames.length > 0 &&
		!allowedHostnames.includes(response.data.hostname)
	) {
		return verificationFailed();
	}

	return undefined;
};
