import type { AuthClientPlugin } from "../../client/types";
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
				matcher: (path) =>
					path === "/two-factor/enable" ||
					path === "/two-factor/send-otp" ||
					path === "/two-factor/disable",
				signal: "_sessionSignal",
			},
		],
		pathMethods: {
			"enable/totp": "POST",
			"/two-factor/disable": "POST",
			"/two-factor/enable": "POST",
			"/two-factor/send-otp": "POST",
		},
		fetchPlugins: [
			{
				id: "two-factor",
				name: "two-factor",
				hooks: {
					async onSuccess(context) {
						if (context.data?.twoFactorRedirect) {
							if (options.redirect || options.twoFactorPage) {
								window.location.href = options.twoFactorPage;
							}
						}
					},
				},
			},
		],
	} satisfies AuthClientPlugin;
};
