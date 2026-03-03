import type { BetterAuthPlugin } from "@better-auth/core";
import { getIp } from "../../utils/get-request-ip";
import { middlewareResponse } from "../../utils/middleware-response";
import { defaultEndpoints, Providers, siteVerifyMap } from "./constants";
import { EXTERNAL_ERROR_CODES, INTERNAL_ERROR_CODES } from "./error-codes";
import type { CaptchaOptions } from "./types";

declare module "@better-auth/core" {
	interface BetterAuthPluginRegistry<AuthOptions, Options> {
		captcha: {
			creator: typeof captcha;
		};
	}
}

import * as verifyHandlers from "./verify-handlers";

export type * from "./types";

export const captcha = (options: CaptchaOptions) =>
	({
		id: "captcha",
		$ERROR_CODES: EXTERNAL_ERROR_CODES,
		onRequest: async (request, ctx) => {
			try {
				const endpoints = options.endpoints?.length
					? options.endpoints
					: defaultEndpoints;

				const url = new URL(request.url);
				const basePath = ctx.options.basePath ?? "/api/auth";
				let pathname = url.pathname.replace(basePath, "");

				// remove trailing or leading slashes
				if (pathname.endsWith("//")) pathname = pathname.slice(0, -1);
				if (pathname.startsWith("//")) pathname = pathname.slice(1);

				// Must be `startsWith` not `includes` otherwise it might match endpoints unintentionally.
				// E.g. `/sign-in/email` could match `/sign-in/email-otp`
				if (!endpoints.some((endpoint) => pathname.startsWith(endpoint))) {
					return undefined;
				}

				if (!options.secretKey) {
					throw new Error(INTERNAL_ERROR_CODES.MISSING_SECRET_KEY.message);
				}

				const captchaResponse = request.headers.get("x-captcha-response");
				const remoteUserIP = getIp(request, ctx.options) ?? undefined;

				if (!captchaResponse) {
					return middlewareResponse({
						message: EXTERNAL_ERROR_CODES.MISSING_RESPONSE.message,
						code: EXTERNAL_ERROR_CODES.MISSING_RESPONSE.code,
						status: 400,
					});
				}

				const siteVerifyURL =
					options.siteVerifyURLOverride || siteVerifyMap[options.provider];

				const handlerParams = {
					siteVerifyURL,
					captchaResponse,
					secretKey: options.secretKey,
					remoteIP: remoteUserIP,
				};

				if (options.provider === Providers.CLOUDFLARE_TURNSTILE) {
					return await verifyHandlers.cloudflareTurnstile(handlerParams);
				}

				if (options.provider === Providers.GOOGLE_RECAPTCHA) {
					return await verifyHandlers.googleRecaptcha({
						...handlerParams,
						minScore: options.minScore,
					});
				}

				if (options.provider === Providers.HCAPTCHA) {
					return await verifyHandlers.hCaptcha({
						...handlerParams,
						siteKey: options.siteKey,
					});
				}

				if (options.provider === Providers.CAPTCHAFOX) {
					return await verifyHandlers.captchaFox({
						...handlerParams,
						siteKey: options.siteKey,
					});
				}
			} catch (_error) {
				const errorMessage =
					_error instanceof Error ? _error.message : undefined;

				ctx.logger.error(errorMessage ?? "Unknown error", {
					endpoint: request.url,
					message: _error,
				});

				return middlewareResponse({
					message: EXTERNAL_ERROR_CODES.UNKNOWN_ERROR.message,
					code: EXTERNAL_ERROR_CODES.UNKNOWN_ERROR.code,
					status: 500,
				});
			}
		},
		options,
	}) satisfies BetterAuthPlugin;
