import { betterFetch } from "@better-fetch/fetch";
import type { BetterAuthPlugin } from "better-auth/plugins";
import type { TurnstileSiteVerifyResponse } from "./types";
import { defaultEndpoints, defaultSiteVerify } from "./constants";
import { TURNSTILE_ERROR_CODES } from "./error-codes";
import { middlewareResponse } from "../../utils/middleware-response";

/**
 * @param {string} secretKey - The Cloudflare Turnstile secret key
 * @param {string[]} [protectedEndpoints] - *(optional)* overrides the default protected endpoints: `["/sign-up", "/sign-in", "/forget-password"]`
 * @param {string} [siteVerifyURL] - *(optional)* overrides the default site verify URL: `"https://challenges.cloudflare.com/turnstile/v0/siteverify"`
 */
export const cloudflareTurnstile = (options: {
	secretKey: string;
	endpoints?: string[];
	siteVerifyURL?: string;
}) =>
	({
		id: "cloudflare-turnstile",
		onRequest: async (request) => {
			try {
				if (request.method !== "POST") return undefined;

				const endpoints = options.endpoints?.length
					? options.endpoints
					: defaultEndpoints;

				if (!endpoints.some((endpoint) => request.url.includes(endpoint)))
					return;

				const captchaResponse = request.headers.get(
					"x-turnstile-captcha-response",
				);

				if (!captchaResponse) {
					return middlewareResponse({
						message: TURNSTILE_ERROR_CODES.MISSING_CAPTCHA_RESPONSE,
						status: 400,
					});
				}

				const siteVerifyURL = options.siteVerifyURL || defaultSiteVerify;

				const response = await betterFetch<TurnstileSiteVerifyResponse>(
					siteVerifyURL,
					{
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							secret: options.secretKey,
							response: captchaResponse,
						}),
					},
				);

				if (!response.data || response.error) {
					return middlewareResponse({
						message: TURNSTILE_ERROR_CODES.CAPTCHA_SERVICE_UNAVAILABLE,
						status: 503,
					});
				}

				if (!response.data.success) {
					return middlewareResponse({
						message: TURNSTILE_ERROR_CODES.CAPTCHA_VERIFICATION_FAILED,
						status: 403,
					});
				}

				return undefined;
			} catch (_error) {
				return middlewareResponse({
					message: TURNSTILE_ERROR_CODES.UNKNOWN_ERROR,
					status: 500,
				});
			}
		},
	}) satisfies BetterAuthPlugin;
