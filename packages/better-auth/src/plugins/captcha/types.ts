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

// DO NOT REMOVE:
// This type exists for the init CLI script to infer plugin argument options more easily.
type SimpleCaptchaOptionsForInitCLI = {
	/**
	 * The captcha provider you wish to use.
	 * @cli required
	 * @prompt
	 * @question Which CAPTCHA provider do you want to use?
	 * @type enum google-recaptcha cloudflare-turnstile hcaptcha captchafox
	 */
	provider:
		| "google-recaptcha"
		| "cloudflare-turnstile"
		| "hcaptcha"
		| "captchafox";
};
