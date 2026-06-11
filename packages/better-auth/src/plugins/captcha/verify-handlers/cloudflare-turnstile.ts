import { betterFetch } from "@better-fetch/fetch";
import { middlewareResponse } from "../../../utils/middleware-response";
import { CAPTCHA_VERIFY_TIMEOUT_MS } from "../constants";
import { EXTERNAL_ERROR_CODES, INTERNAL_ERROR_CODES } from "../error-codes";

type Params = {
	siteVerifyURL: string;
	secretKey: string;
	captchaResponse: string;
	remoteIP?: string | undefined;
	expectedAction?: string | undefined;
	allowedHostnames?: string[] | undefined;
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
	expectedAction,
	allowedHostnames,
}: Params) => {
	const response = await betterFetch<SiteVerifyResponse>(siteVerifyURL, {
		method: "POST",
		timeout: CAPTCHA_VERIFY_TIMEOUT_MS,
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

	const verificationFailed = () =>
		middlewareResponse({
			message: EXTERNAL_ERROR_CODES.VERIFICATION_FAILED.message,
			code: EXTERNAL_ERROR_CODES.VERIFICATION_FAILED.code,
			status: 403,
		});

	if (!response.data.success) {
		return verificationFailed();
	}

	// When configured, bind the token to the expected action and to an
	// allow-list of hostnames so a token issued for a different action or host
	// (e.g. under a shared widget or "Any Hostname") cannot be reused here.
	if (expectedAction && response.data.action !== expectedAction) {
		return verificationFailed();
	}
	if (
		allowedHostnames &&
		allowedHostnames.length > 0 &&
		!(
			response.data.hostname &&
			allowedHostnames.includes(response.data.hostname)
		)
	) {
		return verificationFailed();
	}

	return undefined;
};
