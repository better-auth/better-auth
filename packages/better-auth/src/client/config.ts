import { createFetch } from "@better-fetch/fetch";
import { getBaseURL } from "../utils/base-url";
import { type Atom } from "nanostores";
import type { AtomListener, ClientOptions } from "./types";

import { addCurrentURL, csrfPlugin, redirectPlugin } from "./fetch-plugins";

export const getClientConfig = <O extends ClientOptions>(options?: O) => {
	const $fetch = createFetch({
		baseURL: getBaseURL(options?.fetchOptions?.baseURL).withPath,
		...options?.fetchOptions,
		plugins: [
			csrfPlugin,
			redirectPlugin,
			addCurrentURL,
			...(options?.fetchOptions?.plugins || []),
		],
	});
	const plugins = options?.plugins || [];
	let pluginsActions = {} as Record<string, any>;
	let pluginsAtoms = {} as Record<string, Atom<any>>;
	let pluginPathMethods: Record<string, "POST" | "GET"> = {
		"/sing-out": "POST",
	};
	const atomListeners: AtomListener[] = [];
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
