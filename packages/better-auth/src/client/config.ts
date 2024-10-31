import { createFetch } from "@better-fetch/fetch";
import { getBaseURL } from "../utils/url";
import { type Atom, type WritableAtom } from "nanostores";
import type { AtomListener, ClientOptions } from "./types";
import { addCurrentURL, redirectPlugin } from "./fetch-plugins";
import { getSessionAtom } from "./session-atom";

export const getClientConfig = <O extends ClientOptions>(options?: O) => {
	/* check if the credentials property is supported. Useful for cf workers */
	const isCredentialsSupported = "credentials" in Request.prototype;
	const baseURL = getBaseURL(options?.baseURL);
	const pluginsFetchPlugins =
		options?.plugins
			?.flatMap((plugin) => plugin.fetchPlugins)
			.filter((pl) => pl !== undefined) || [];
	const $fetch = createFetch({
		baseURL,
		...(isCredentialsSupported ? { credentials: "include" } : {}),
		method: "GET",
		...options?.fetchOptions,
		plugins: options?.disableDefaultFetchPlugins
			? [...(options?.fetchOptions?.plugins || []), ...pluginsFetchPlugins]
			: [
					redirectPlugin,
					addCurrentURL,
					...(options?.fetchOptions?.plugins || []),
					...pluginsFetchPlugins,
				],
	});
	const { $sessionSignal, session } = getSessionAtom<O>($fetch);
	const plugins = options?.plugins || [];
	let pluginsActions = {} as Record<string, any>;
	let pluginsAtoms = {
		$sessionSignal,
		session,
	} as Record<string, WritableAtom<any>>;
	let pluginPathMethods: Record<string, "POST" | "GET"> = {
		"/sign-out": "POST",
		"/revoke-sessions": "POST",
	};
	const atomListeners: AtomListener[] = [
		{
			signal: "$sessionSignal",
			matcher(path) {
				return (
					path === "/sign-out" ||
					path === "/update-user" ||
					path.startsWith("/sign-in") ||
					path.startsWith("/sign-up")
				);
			},
		},
	];

	for (const plugin of plugins) {
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

	const $store = {
		notify: (signal?: Omit<string, "$sessionSignal"> | "$sessionSignal") => {
			pluginsAtoms[signal as keyof typeof pluginsAtoms].set(
				!pluginsAtoms[signal as keyof typeof pluginsAtoms].get(),
			);
		},
		listen: (
			signal: Omit<string, "$sessionSignal"> | "$sessionSignal",
			listener: (value: boolean, oldValue?: boolean | undefined) => void,
		) => {
			pluginsAtoms[signal as keyof typeof pluginsAtoms].subscribe(listener);
		},
		atoms: pluginsAtoms,
	};

	for (const plugin of plugins) {
		if (plugin.getActions) {
			Object.assign(pluginsActions, plugin.getActions?.($fetch, $store));
		}
	}
	return {
		pluginsActions,
		pluginsAtoms,
		pluginPathMethods,
		atomListeners,
		$fetch,
		$store,
	};
};
