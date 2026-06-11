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
}

export interface GoogleRecaptchaOptions extends BaseCaptchaOptions {
	provider: typeof Providers.GOOGLE_RECAPTCHA;
	minScore?: number | undefined;
}

export interface CloudflareTurnstileOptions extends BaseCaptchaOptions {
	provider: typeof Providers.CLOUDFLARE_TURNSTILE;
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
