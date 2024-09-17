import { createFetch } from "@better-fetch/fetch";
import { getBaseURL } from "../utils/base-url";
import { type Atom } from "nanostores";
import type { AtomListener, ClientOptions } from "./types";

import { addCurrentURL, csrfPlugin, redirectPlugin } from "./fetch-plugins";
import type { InferSession } from "../types";

export const getClientConfig = <O extends ClientOptions>(options?: O) => {
	const $fetch = createFetch({
		baseURL: getBaseURL(options?.fetchOptions?.baseURL || options?.baseURL),
		credentials: "include",
		...options?.fetchOptions,
		plugins: [
			csrfPlugin,
			redirectPlugin,
			addCurrentURL,
			...(options?.fetchOptions?.plugins || []),
			...(options?.plugins
				?.flatMap((plugin) => plugin.fetchPlugins)
				.filter((pl) => pl !== undefined) || []),
		],
	});
	const plugins = options?.plugins || [];
	let pluginsActions = {} as Record<string, any>;
	let pluginsAtoms = {} as Record<string, Atom<any>>;
	let pluginPathMethods: Record<string, "POST" | "GET"> = {
		"/sign-out": "POST",
		"/user/revoke-sessions": "POST",
	};
	const atomListeners: AtomListener[] = [
		{
			signal: "_sessionSignal",
			matcher(path) {
				return (
					path === "/sign-out" ||
					path === "sign-up/email" ||
					path === "/user/update"
				);
			},
		},
	];
	for (const plugin of plugins) {
		if (plugin.getActions) {
			Object.assign(pluginsActions, plugin.getActions?.($fetch));
		}
		if (plugin.getAtoms) {
			Object.assign(pluginsAtoms, plugin.getAtoms?.($fetch));
		}
		if (plugin.pathMethods) {
			Object.assign(pluginPathMethods, plugin.pathMethods);
		}
		if (plugin.atomListeners) {
			atomListeners.push(...plugin.atomListeners);
		}
	}
	return {
		pluginsActions,
		pluginsAtoms,
		pluginPathMethods,
		atomListeners,
		$fetch,
	};
};
