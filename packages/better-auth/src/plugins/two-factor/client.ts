import type { BetterAuthClientPlugin } from "@better-auth/core";
import { PACKAGE_VERSION } from "../../version";
import type { twoFactor as twoFa } from ".";
import { TWO_FACTOR_ERROR_CODES } from "./error-code";
import type { TwoFactorMethod } from "./types";

export * from "./error-code";

const SESSION_CHANGING_TWO_FACTOR_PATHS = new Set([
	"/two-factor/disable",
	"/two-factor/enable",
	"/two-factor/verify-totp",
	"/two-factor/verify-otp",
	"/two-factor/verify-backup-code",
]);

type TwoFactorSignInChallenge = {
	type: "two-factor";
	attemptId: string;
	availableMethods: TwoFactorMethod[];
};

type SignInChallengeResponse = {
	type: "challenge";
	challenge: TwoFactorSignInChallenge;
};

function isTwoFactorChallenge(
	value: unknown,
): value is SignInChallengeResponse {
	if (!value || typeof value !== "object") {
		return false;
	}
	const record = value as {
		type?: unknown;
		challenge?: { type?: unknown };
	};
	return record.type === "challenge" && record.challenge?.type === "two-factor";
}

export const twoFactorClient = (
	options?:
		| {
				/**
				 * the page to redirect if a user needs to verify
				 * their two factor
				 *
				 * @warning This causes a full page reload when used.
				 */
				twoFactorPage?: string;
				/**
				 * A redirect callback invoked when sign-in pauses for two-factor
				 * verification.
				 */
				onTwoFactorRedirect?: (context: {
					/**
					 * The opaque identifier for the paused sign-in attempt. Pass this
					 * back to `/two-factor/*` verification calls.
					 */
					attemptId: string;
					/**
					 * The list of 2FA methods available to the user (e.g.
					 * `["totp", "otp", "backup-code"]`).
					 */
					availableMethods: TwoFactorMethod[];
				}) => void | Promise<void>;
		  }
		| undefined,
) => {
	return {
		id: "two-factor",
		version: PACKAGE_VERSION,
		$InferServerPlugin: {} as ReturnType<typeof twoFa>,
		atomListeners: [
			{
				matcher: (path) => SESSION_CHANGING_TWO_FACTOR_PATHS.has(path),
				signal: "$sessionSignal",
			},
		],
		pathMethods: {
			"/two-factor/disable": "POST",
			"/two-factor/enable": "POST",
			"/two-factor/send-otp": "POST",
			"/two-factor/generate-backup-codes": "POST",
			"/two-factor/get-totp-uri": "POST",
			"/two-factor/verify-totp": "POST",
			"/two-factor/verify-otp": "POST",
			"/two-factor/verify-backup-code": "POST",
		},
		fetchPlugins: [
			{
				id: "two-factor",
				name: "two-factor",
				hooks: {
					async onSuccess(context) {
						if (!isTwoFactorChallenge(context.data)) {
							return;
						}
						const { attemptId, availableMethods } = context.data.challenge;
						if (options?.onTwoFactorRedirect) {
							await options.onTwoFactorRedirect({
								attemptId,
								availableMethods,
							});
							return;
						}
						if (options?.twoFactorPage && typeof window !== "undefined") {
							const redirectURL = new URL(
								options.twoFactorPage,
								window.location.href,
							);
							redirectURL.searchParams.set("challenge", "two-factor");
							redirectURL.searchParams.set("attemptId", attemptId);
							redirectURL.searchParams.set(
								"methods",
								availableMethods.join(","),
							);
							window.location.href = redirectURL.toString();
						}
					},
				},
			},
		],
		$ERROR_CODES: TWO_FACTOR_ERROR_CODES,
	} satisfies BetterAuthClientPlugin;
};

export type * from "./backup-codes";
export type * from "./otp";
export type * from "./totp";
export type * from "./types";
