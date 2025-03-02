import type { Provider } from "./types";

export const defaultEndpoints = ["/sign-up", "/sign-in", "/forget-password"];

export const Providers = {
	CLOUDFLARE_TURNSTILE: "cloudflare-turnstile",
	GOOGLE_RECAPTCHA: "google-recaptcha",
} as const;

export const siteVerifyMap: Record<Provider, string> = {
	[Providers.CLOUDFLARE_TURNSTILE]:
		"https://challenges.cloudflare.com/turnstile/v0/siteverify",
	[Providers.GOOGLE_RECAPTCHA]:
		"https://www.google.com/recaptcha/api/siteverify",
};
