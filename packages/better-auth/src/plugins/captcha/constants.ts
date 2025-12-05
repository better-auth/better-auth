import type { Provider } from "./types";

export const defaultEndpoints = [
	"/sign-up/email",
	"/sign-in/email",
	"/request-password-reset",
];

export const Providers = {
	CLOUDFLARE_TURNSTILE: "cloudflare-turnstile",
	GOOGLE_RECAPTCHA: "google-recaptcha",
	HCAPTCHA: "hcaptcha",
	CAPTCHAFOX: "captchafox",
} as const;

export const siteVerifyMap: Record<Provider, string> = {
	[Providers.CLOUDFLARE_TURNSTILE]:
		"https://challenges.cloudflare.com/turnstile/v0/siteverify",
	[Providers.GOOGLE_RECAPTCHA]:
		"https://www.google.com/recaptcha/api/siteverify",
	[Providers.HCAPTCHA]: "https://api.hcaptcha.com/siteverify",
	[Providers.CAPTCHAFOX]: "https://api.captchafox.com/siteverify",
};
