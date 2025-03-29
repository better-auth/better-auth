import type { Providers } from "./constants";

export type Provider = (typeof Providers)[keyof typeof Providers];

export interface BaseCaptchaOptions {
	secretKey: string;
	endpoints?: string[];
	siteVerifyURLOverride?: string;
}

export interface GoogleRecaptchaOptions extends BaseCaptchaOptions {
	provider: typeof Providers.GOOGLE_RECAPTCHA;
	minScore?: number;
}

export interface CloudflareTurnstileOptions extends BaseCaptchaOptions {
	provider: typeof Providers.CLOUDFLARE_TURNSTILE;
}

export interface HCaptchaOptions extends BaseCaptchaOptions {
	provider: typeof Providers.HCAPTCHA;
	siteKey?: string;
}

export type CaptchaOptions =
	| GoogleRecaptchaOptions
	| CloudflareTurnstileOptions
	| HCaptchaOptions;
