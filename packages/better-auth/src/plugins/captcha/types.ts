import type { FetchEsque } from "@better-fetch/fetch";
import type { Providers } from "./constants";

export type Provider = (typeof Providers)[keyof typeof Providers];

export interface BaseCaptchaOptions {
	secretKey: string;
	/**
	 * Paths where captcha verification is enforced. Paths match exactly unless
	 * they include wildcards, such as `/sign-in/*` or `/sign-in/**`.
	 */
	endpoints?: string[] | undefined;
	siteVerifyURLOverride?: string | undefined;
	/**
	 * Fetch implementation used for the siteverify call. Defaults to the global
	 * `fetch`.
	 *
	 * Supplying one lets a host resolve verification without going through the
	 * global fetch — a test double, or a runtime whose outbound transport is not
	 * the global fetch. `siteVerifyURLOverride` can only point the call at a
	 * different URL, so it cannot take verification off the network.
	 */
	customFetchImpl?: FetchEsque | undefined;
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
