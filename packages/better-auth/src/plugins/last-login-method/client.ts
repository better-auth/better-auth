import {
	lastLoginMethod,
	type LastLoginMethodClientOptions,
	type RealizedLastLoginMethodClientOptions,
} from ".";
import { parseCookies } from "../../cookies";
import type { BetterAuthClientPlugin } from "../../types";

export const lastLoginMethodClient = (
	options?: LastLoginMethodClientOptions,
) => {
	const opts: RealizedLastLoginMethodClientOptions = {
		cookieName: options?.cookieName ?? "better-auth.last_used_login_method",
	};

	return {
		id: "last-login-method",
		$InferServerPlugin: {} as ReturnType<typeof lastLoginMethod>,

		getActions: () => ({
			getLastUsedLoginMethod: async () => {
				const cookies = parseCookies(document.cookie);
				const lastUsedLoginMethod = cookies.get(opts.cookieName);
				return lastUsedLoginMethod;
			},
		}),
	} satisfies BetterAuthClientPlugin;
};
