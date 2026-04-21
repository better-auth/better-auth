import type { BetterAuthClientPlugin } from "@better-auth/core";
import { PACKAGE_VERSION } from "../../version";
import type { twoFactor as twoFa } from ".";
import { TWO_FACTOR_ERROR_CODES } from "./error-code";
import type { TwoFactorMethodDescriptor } from "./types";

export * from "./error-code";

const SESSION_CHANGING_TWO_FACTOR_PATHS = new Set(["/two-factor/verify"]);

type TwoFactorSignInChallenge = {
	kind: "two-factor";
	attemptId: string;
	methods: TwoFactorMethodDescriptor[];
};

type SignInChallengeResponse = {
	kind: "challenge";
	challenge: TwoFactorSignInChallenge;
};

function isTwoFactorChallenge(
	value: unknown,
): value is SignInChallengeResponse {
	if (!value || typeof value !== "object") {
		return false;
	}
	const record = value as {
		kind?: unknown;
		challenge?: { kind?: unknown };
	};
	return record.kind === "challenge" && record.challenge?.kind === "two-factor";
}

export const twoFactorClient = (
	options?:
		| {
				/**
				 * Redirect target for full-page challenge handling.
				 *
				 * @warning This causes a full page reload when used.
				 */
				twoFactorPage?: string;
				onTwoFactorRedirect?: (context: {
					attemptId: string;
					methods: TwoFactorMethodDescriptor[];
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
			"/two-factor/enable-totp": "POST",
			"/two-factor/get-totp-uri": "POST",
			"/two-factor/enable-otp": "POST",
			"/two-factor/list-methods": "GET",
			"/two-factor/pending-challenge": "GET",
			"/two-factor/send-code": "POST",
			"/two-factor/verify": "POST",
			"/two-factor/regenerate-recovery-codes": "POST",
			"/two-factor/remove-method": "POST",
			"/two-factor/list-trusted-devices": "GET",
			"/two-factor/revoke-trusted-device": "POST",
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
						const { attemptId, methods } = context.data.challenge;
						if (options?.onTwoFactorRedirect) {
							await options.onTwoFactorRedirect({
								attemptId,
								methods,
							});
							return;
						}
						if (options?.twoFactorPage && typeof window !== "undefined") {
							const redirectURL = new URL(
								options.twoFactorPage,
								window.location.href,
							);
							redirectURL.searchParams.set("challenge", "two-factor");
							window.location.href = redirectURL.toString();
						}
					},
				},
			},
		],
		$ERROR_CODES: TWO_FACTOR_ERROR_CODES,
	} satisfies BetterAuthClientPlugin;
};

export type * from "./types";
