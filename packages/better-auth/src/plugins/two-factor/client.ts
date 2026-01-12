import type { BetterAuthClientPlugin } from "@better-auth/core";
import type { twoFactor as twoFa } from ".";
import { TWO_FACTOR_ERROR_CODES } from "./error-code";

export * from "./error-code";

export const twoFactorClient = (
	options?:
		| {
				/**
				 * a redirect function to call if a user needs to verify
				 * their two factor
				 */
				onTwoFactorRedirect?: () => void | Promise<void>;
		  }
		| undefined,
) => {
	return {
		id: "two-factor",
		$InferServerPlugin: {} as ReturnType<typeof twoFa>,
		atomListeners: [
			{
				matcher: (path) => path.startsWith("/two-factor/"),
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
						if (context.data?.twoFactorRedirect) {
							if (options?.onTwoFactorRedirect) {
								await options.onTwoFactorRedirect();
							}
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
