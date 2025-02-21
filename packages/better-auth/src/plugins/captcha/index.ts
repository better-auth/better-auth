import type { BetterAuthPlugin } from "../../plugins";
import type { Provider } from "./types";
import { defaultEndpoints, Providers, siteVerifyMap } from "./constants";
import { CAPTCHA_ERROR_CODES } from "./error-codes";
import { middlewareResponse } from "../../utils/middleware-response";
import * as verifyHandlers from "./verify-handlers";

export interface CaptchaOptions {
	provider: Provider;
	secretKey: string;
	endpoints?: string[];
	siteVerifyURLOverride?: string;
}

export const captcha = (options: CaptchaOptions) =>
	({
		id: "captcha",
		onRequest: async (request) => {
			try {
				if (request.method !== "POST") return undefined;

				const endpoints = options.endpoints?.length
					? options.endpoints
					: defaultEndpoints;

				if (!endpoints.some((endpoint) => request.url.includes(endpoint)))
					return;

				const captchaResponse = request.headers.get("x-captcha-response");

				if (!captchaResponse) {
					return middlewareResponse({
						message: CAPTCHA_ERROR_CODES.MISSING_RESPONSE,
						status: 400,
					});
				}

				const siteVerifyURL =
					options.siteVerifyURLOverride || siteVerifyMap[options.provider];

				if (options.provider === Providers.CLOUDFLARE_TURNSTILE) {
					return await verifyHandlers.cloudflareTurnstile({
						secretKey: options.secretKey,
						captchaResponse,
						siteVerifyURL,
					});
				}

				if (options.provider === Providers.GOOGLE_RECAPTCHA) {
					return await verifyHandlers.googleReCAPTCHA({
						secretKey: options.secretKey,
						captchaResponse,
						siteVerifyURL,
					});
				}
			} catch (_error) {
				return middlewareResponse({
					message: CAPTCHA_ERROR_CODES.UNKNOWN_ERROR,
					status: 500,
				});
			}
		},
	}) satisfies BetterAuthPlugin;
