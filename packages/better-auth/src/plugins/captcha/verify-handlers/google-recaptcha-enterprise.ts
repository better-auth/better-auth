import { betterFetch } from "@better-fetch/fetch";
import { middlewareResponse } from "../../../utils/middleware-response";
import { EXTERNAL_ERROR_CODES, INTERNAL_ERROR_CODES } from "../error-codes";

type Params = {
	siteVerifyURL?: string | undefined;
	secretKey: string;
	projectId: string;
	siteKey: string;
	captchaResponse: string;
	expectedAction?: string | undefined;
	minScore?: number | undefined;
	remoteIP?: string | undefined;
};

type AssessmentResponse = {
	tokenProperties?: {
		valid: boolean;
		action?: string;
		hostname?: string;
		invalidReason?: string;
		createTime?: string;
	};
	riskAnalysis?: {
		score: number;
		reasons?: string[];
	};
};

export const googleRecaptchaEnterprise = async ({
	siteVerifyURL,
	secretKey,
	projectId,
	siteKey,
	captchaResponse,
	expectedAction,
	minScore = 0.5,
	remoteIP,
}: Params) => {
	const url =
		siteVerifyURL ??
		`https://recaptchaenterprise.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/assessments?key=${encodeURIComponent(secretKey)}`;

	const response = await betterFetch<AssessmentResponse>(url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			event: {
				token: captchaResponse,
				siteKey,
				...(remoteIP && { userIpAddress: remoteIP }),
				...(expectedAction && { expectedAction }),
			},
		}),
	});

	if (!response.data || response.error) {
		throw new Error(INTERNAL_ERROR_CODES.SERVICE_UNAVAILABLE.message);
	}

	const tokenProps = response.data.tokenProperties;
	const score = response.data.riskAnalysis?.score;

	const failed =
		!tokenProps?.valid ||
		(expectedAction !== undefined && tokenProps.action !== expectedAction) ||
		typeof score !== "number" ||
		score < minScore;

	if (failed) {
		return middlewareResponse({
			message: EXTERNAL_ERROR_CODES.VERIFICATION_FAILED.message,
			code: EXTERNAL_ERROR_CODES.VERIFICATION_FAILED.code,
			status: 403,
		});
	}

	return undefined;
};
