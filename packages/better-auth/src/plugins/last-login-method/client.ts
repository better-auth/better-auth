import {
	LAST_USED_LOGIN_METHOD_HEADER,
	type LastLoginMethodClientOptions,
	type LastLoginMethodPlugin,
	type RealizedLastLoginMethodClientOptions,
} from ".";
import type { BetterAuthClientPlugin } from "../../types";

export const lastLoginMethodClient = <
	Storage extends "cookie" | "local-storage" = "local-storage",
>(
	options?: LastLoginMethodClientOptions<Storage>,
) => {
	const opts: RealizedLastLoginMethodClientOptions<Storage> = {
		storage: options?.storage ?? ("local-storage" as Storage),
		key: options?.key ?? "better-auth.last_used_login_method",
	};

	return {
		id: "last-login-method",
		$InferServerPlugin: {} as LastLoginMethodPlugin<Storage>,

		getActions: () => ({
			getLastUsedLoginMethod: async () => {
				const key = localStorage.getItem(opts.key) ?? null;
				return key;
			},
		}),

		fetchPlugins: [
			{
				id: "last-login-method-hook",
				name: "last-login-method-hook",
				hooks:
					opts.storage === "local-storage"
						? {
								onResponse(context) {
									const lastUsedLoginMethod = context.response.headers.get(
										LAST_USED_LOGIN_METHOD_HEADER,
									);
									if (!lastUsedLoginMethod) return;
									localStorage.setItem(opts.key, lastUsedLoginMethod);
								},
							}
						: undefined,
			},
		],
	} satisfies BetterAuthClientPlugin;
};
