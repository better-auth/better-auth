import type { Providers } from "./constants";
import type {
	CheckBotIdOptions,
	ValidateRequestContext,
} from "./verify-handlers/vercel-botid";

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

export interface VercelBotIdOptions
	extends Pick<BaseCaptchaOptions, "endpoints"> {
	provider: typeof Providers.VERCEL_BOTID;

	/**
	 * If you want custom logic to validate the request, you can use this function.
	 * Return `false` to invalidate the request, and `true` to allow the request to proceed.
	 *
	 * Note: Any requests which are invalidated by the `endpoints` will not be checked by this function.
	 *
	 * @example
	 * ```ts
	 * ({ request, verification }) => {
	 * 	return verification.isBot === false;
	 * }
	 */
	validateRequest?: (ctx: ValidateRequestContext) => boolean | Promise<boolean>;
	checkBotIdOptions?: CheckBotIdOptions;
}

export type CaptchaOptions =
	| GoogleRecaptchaOptions
	| CloudflareTurnstileOptions
	| HCaptchaOptions
	| CaptchaFoxOptions
	| VercelBotIdOptions;
