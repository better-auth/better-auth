import { createClientPlugin } from "../../client/create-client-plugin";
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
	return createClientPlugin<ReturnType<typeof twoFa>>()(($fetch) => {
		return {
			id: "two-factor",
			authProxySignal: [
				{
					matcher: (path) =>
						path === "/two-factor/enable" || path === "/two-factor/send-otp",
					atom: "$sessionSignal",
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
								if (options.redirect) {
									window.location.href = options.twoFactorPage;
								}
							}
						},
					},
				},
			],
		};
	});
};
