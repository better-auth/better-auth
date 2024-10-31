import type { BetterAuthClientPlugin } from "../../client/types";
import type { twoFactor as twoFa } from "../../plugins/two-factor";

export const twoFactorClient = (
	options: {
		twoFactorPage: string;
		/**
		 * Redirect to the two factor page. If twoFactorPage
		 * is not set this will redirect to the root path.
		 * @default true
		 */
		redirect?: boolean;
	} = {
		redirect: true,
		twoFactorPage: "/",
	},
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
		},
		fetchPlugins: [
			{
				id: "two-factor",
				name: "two-factor",
				hooks: {
					async onSuccess(context) {
						if (context.data?.twoFactorRedirect) {
							if (options.redirect || options.twoFactorPage) {
								if (typeof window !== "undefined") {
									window.location.href = options.twoFactorPage;
								}
							}
						}
					},
				},
			},
		],
	} satisfies BetterAuthClientPlugin;
};
