import { betterFetch } from "@better-fetch/fetch";
import { middlewareResponse } from "../../../utils/middleware-response";
import { EXTERNAL_ERROR_CODES, INTERNAL_ERROR_CODES } from "../error-codes";
import { encodeToURLParams } from "../utils";

type Params = {
	siteVerifyURL: string;
	secretKey: string;
	captchaResponse: string;
	remoteIP?: string;
};

type SiteVerifyResponse = {
	status: "ok" | "failed";
	message: string;
	host?: string;
};

export const yandexSmartCaptcha = async ({
	siteVerifyURL,
	captchaResponse,
	secretKey,
	remoteIP,
}: Params) => {
	const response = await betterFetch<SiteVerifyResponse>(siteVerifyURL, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: encodeToURLParams({
			secret: secretKey,
			token: captchaResponse,
			...(remoteIP && { ip: remoteIP }),
		}),
	});

	if (!response.data || response.error) {
		throw new Error(INTERNAL_ERROR_CODES.SERVICE_UNAVAILABLE);
	}

	if (response.data.status !== "ok") {
		return middlewareResponse({
			message: EXTERNAL_ERROR_CODES.VERIFICATION_FAILED,
			status: 403,
		});
	}

	return undefined;
};
