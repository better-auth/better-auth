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
	/**
	 * If true, captcha will not be required for OAuth routes
	 * @default false
	 */
	skipOAuth?: boolean;
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

				// Check for authentication-related headers that might indicate a popup auth
				const isAuthPopup = (
					request.headers.get('x-auth-popup') === 'true' ||
					request.headers.get('x-auth-type') !== null
				);

				// Check URL parameters that might indicate authentication
				let hasAuthParams = false;
				try {
					const url = new URL(request.url);
					hasAuthParams = (
						url.searchParams.has('auth') ||
						url.searchParams.has('login') ||
						url.searchParams.has('signup')
					);
				} catch (e) {
					// URL parsing failed, continue with other checks
				}

				// Skip if not a matching endpoint and not a popup auth
				if (!endpoints.some((endpoint) => request.url.includes(endpoint)) && !isAuthPopup && !hasAuthParams)
					return;

				// Skip captcha for OAuth routes if skipOAuth option is enabled
				if (options.skipOAuth) {
					// Check URL patterns for OAuth routes
					const isOAuthURL = (
						request.url.includes('/oauth2/') || 
						request.url.includes('/callback/') ||
						request.url.includes('/sign-in/oauth2')
					);
					
					// Check for OAuth-specific headers or parameters
					const hasOAuthHeader = (
						request.headers.get('x-oauth-provider') !== null ||
						request.headers.get('x-auth-type') === 'oauth'
					);
					
					// Check URL search params for OAuth indicators
					let hasOAuthParam = false;
					try {
						const url = new URL(request.url);
						hasOAuthParam = (
							url.searchParams.has('oauth') ||
							url.searchParams.has('provider') ||
							url.searchParams.has('code')
						);
					} catch (e) {
						// URL parsing failed, continue with other checks
					}
					
					// Skip captcha if any OAuth indicator is present
					if (isOAuthURL || hasOAuthHeader || hasOAuthParam) {
						return;
					}
				}

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
