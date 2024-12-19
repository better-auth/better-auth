import { APIError } from "better-call";
import { betterFetch } from "@better-fetch/fetch";
import type { BetterAuthPlugin } from "better-auth/plugins";
import type { TurnstileResponse } from "./types";
import { defaultEndpoints, defaultSiteVerify } from "./constants";
import { TURNSTILE_ERROR_CODES } from "./error-codes";

/**
 * @param {string} secretKey - The Cloudflare Turnstile secret key
 * @param {string[]} [protectedEndpoints] - *(optional)* overrides the default protected endpoints: `["/sign-up", "/sign-in", "/forget-password"]`
 * @param {string} [siteVerifyURL] - *(optional)* overrides the default site verify URL: `"https://challenges.cloudflare.com/turnstile/v0/siteverify"`
 */
export const turnstile = (options: {
	secretKey: string;
	endpoints?: string[];
	siteVerifyURL?: string;
}) =>
	({
		id: "turnstile",

		onRequest: async (request) => {
			try {
				if (request.method !== "POST") return undefined;

				const endpoints = options.endpoints?.length
					? options.endpoints
					: defaultEndpoints;

				if (!endpoints.some((endpoint) => request.url.includes(endpoint)))
					return undefined;

				const captchaResponse = request.headers.get(
					"x-turnstile-captcha-response",
				);

				if (!captchaResponse) {
					throw new APIError("BAD_REQUEST", {
						message: TURNSTILE_ERROR_CODES.MISSING_CAPTCHA_RESPONSE,
					});
				}

				const siteVerifyURL = options.siteVerifyURL || defaultSiteVerify;

				const response = await betterFetch<TurnstileResponse>(siteVerifyURL, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						secret: options.secretKey,
						response: captchaResponse,
					}),
				});

				if (!response.data || response.error) {
					throw new APIError("SERVICE_UNAVAILABLE", {
						message: TURNSTILE_ERROR_CODES.CAPTCHA_VERIFICATION_FAILED,
					});
				}

				if (!response.data.success) {
					throw new APIError("FORBIDDEN", {
						message: TURNSTILE_ERROR_CODES.CAPTCHA_VERIFICATION_REJECTED,
					});
				}

				return undefined;
			} catch (_error) {
				throw new APIError("INTERNAL_SERVER_ERROR", {
					message: TURNSTILE_ERROR_CODES.UNKNOWN_ERROR,
				});
			}
		},
	}) satisfies BetterAuthPlugin;
