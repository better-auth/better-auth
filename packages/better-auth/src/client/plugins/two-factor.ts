import { createClientPlugin } from "../create-client-plugin";
import type { twoFactor as twoFa } from "../../plugins/two-factor";

export const twoFactor = createClientPlugin<ReturnType<typeof twoFa>>()(
	($fetch) => {
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
		};
	},
);
