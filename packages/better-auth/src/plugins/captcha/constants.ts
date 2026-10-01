import type { Provider } from "./types";

/**
 * Upper bound (in milliseconds) for a single provider verification request.
 * Without it, a hanging provider would tie up the request indefinitely before
 * any rate limiting applies, so every verify handler aborts at this deadline
 * and fails closed.
 */
export const CAPTCHA_VERIFY_TIMEOUT_MS = 10_000;

export const defaultEndpoints = [
	"/sign-up/email",
	"/sign-in/email",
	"/request-password-reset",
];

/**
 * Path prefixes for endpoints that accept an attacker-supplied secret and can
 * hand out or strengthen a session, or spend a one-time secret.
 *
 * The defaults above only cover Email & Password, so any other plugin that adds
 * an endpoint under these families is left unprotected until the `endpoints`
 * option opts it in. Matching is by prefix segment so a plugin (including a
 * third-party one) is covered without enumerating its routes.
 */
export const authPathPrefixes = [
	"/sign-in",
	"/sign-up",
	"/link-social",
	"/verify-email",
	"/verify-password",
	"/forget-password",
	"/request-password-reset",
	"/reset-password",
	"/two-factor/verify",
	"/two-factor/send-otp",
	"/magic-link",
	"/one-time-token",
	"/siwe",
	"/phone-number",
	"/email-otp",
];

export const Providers = {
	CLOUDFLARE_TURNSTILE: "cloudflare-turnstile",
	GOOGLE_RECAPTCHA: "google-recaptcha",
	HCAPTCHA: "hcaptcha",
	CAPTCHAFOX: "captchafox",
	VERCEL_BOTID: "vercel-botid",
} as const;

export const siteVerifyMap: Record<
	Exclude<Provider, typeof Providers.VERCEL_BOTID>,
	string
> = {
	[Providers.CLOUDFLARE_TURNSTILE]:
		"https://challenges.cloudflare.com/turnstile/v0/siteverify",
	[Providers.GOOGLE_RECAPTCHA]:
		"https://www.google.com/recaptcha/api/siteverify",
	[Providers.HCAPTCHA]: "https://api.hcaptcha.com/siteverify",
	[Providers.CAPTCHAFOX]: "https://api.captchafox.com/siteverify",
};
