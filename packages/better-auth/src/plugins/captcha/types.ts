import type { Providers } from "./constants";

export type Provider = (typeof Providers)[keyof typeof Providers];

export interface BaseCaptchaOptions {
	secretKey: string;
	endpoints?: string[] | undefined;
	siteVerifyURLOverride?: string | undefined;
}

export interface GoogleRecaptchaOptions extends BaseCaptchaOptions {
	provider: typeof Providers.GOOGLE_RECAPTCHA;
	minScore?: number | undefined;
	/**
	 * Expected reCAPTCHA v3 `action`. When set, a verification whose action does
	 * not match is rejected, preventing a token minted for another action on the
	 * same site key from being replayed against this endpoint.
	 */
	expectedAction?: string | undefined;
	/**
	 * Allow-list of hostnames the token must have been issued for. When set, a
	 * verification reporting a different hostname is rejected.
	 */
	allowedHostnames?: string[] | undefined;
}

export interface CloudflareTurnstileOptions extends BaseCaptchaOptions {
	provider: typeof Providers.CLOUDFLARE_TURNSTILE;
	/**
	 * Expected Turnstile `action`. When set, a verification whose action does
	 * not match is rejected, preventing cross-context token reuse.
	 */
	expectedAction?: string | undefined;
	/**
	 * Allow-list of hostnames the token must have been issued for. When set, a
	 * verification reporting a different or missing hostname is rejected.
	 */
	allowedHostnames?: string[] | undefined;
}

export interface HCaptchaOptions extends BaseCaptchaOptions {
	provider: typeof Providers.HCAPTCHA;
	siteKey?: string | undefined;
}

export interface CaptchaFoxOptions extends BaseCaptchaOptions {
	provider: typeof Providers.CAPTCHAFOX;
	siteKey?: string | undefined;
}

export type CaptchaOptions =
	| GoogleRecaptchaOptions
	| CloudflareTurnstileOptions
	| HCaptchaOptions
	| CaptchaFoxOptions;
