import type { BetterAuthClientPlugin } from "@better-auth/core";
import type { twoFactor as twoFa } from "../../plugins/two-factor";

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
				 * a redirect function to call if a user needs to verify
				 * their two factor
				 */
				onTwoFactorRedirect?: () => void | Promise<void>;
		  }
		| undefined,
): BetterAuthClientPlugin => {
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
		},
		fetchPlugins: [
			{
				id: "two-factor",
				name: "two-factor",
				hooks: {
					async onSuccess(context) {
						if (context.data?.twoFactorRedirect) {
							if (options?.twoFactorPage) {
								if (typeof window !== "undefined" && window.location) {
									window.location.href = options.twoFactorPage;
									return;
								}
							}

							if (options?.onTwoFactorRedirect) {
								await options.onTwoFactorRedirect();
							}
						}
					},
				},
			},
		],
	} satisfies BetterAuthClientPlugin;
};
