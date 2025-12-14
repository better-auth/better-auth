import { betterFetch } from "@better-fetch/fetch";
import { middlewareResponse } from "../../../utils/middleware-response";
import { EXTERNAL_ERROR_CODES, INTERNAL_ERROR_CODES } from "../error-codes";
import { encodeToURLParams } from "../utils";

type Params = {
	siteVerifyURL: string;
	secretKey: string;
	captchaResponse: string;
	minScore?: number | undefined;
	remoteIP?: string | undefined;
};

type SiteVerifyResponse = {
	success: boolean;
	challenge_ts: string;
	hostname: string;
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
}: Params) => {
	const response = await betterFetch<SiteVerifyResponse | SiteVerifyV3Response>(
		siteVerifyURL,
		{
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: encodeToURLParams({
				secret: secretKey,
				response: captchaResponse,
				...(remoteIP && { remoteip: remoteIP }),
			}),
		},
	);

	if (!response.data || response.error) {
		throw new Error(INTERNAL_ERROR_CODES.SERVICE_UNAVAILABLE);
	}

	if (
		!response.data.success ||
		(isV3(response.data) && response.data.score < minScore)
	) {
		return middlewareResponse({
			message: EXTERNAL_ERROR_CODES.VERIFICATION_FAILED,
			status: 403,
		});
	}

	return undefined;
};
