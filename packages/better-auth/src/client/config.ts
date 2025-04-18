import { createFetch } from "@better-fetch/fetch";
import { getBaseURL } from "../utils/url";
import { type WritableAtom } from "nanostores";
import type { AtomListener, ClientOptions } from "./types";
import { redirectPlugin } from "./fetch-plugins";
import { getSessionAtom } from "./session-atom";
import { parseJSON } from "./parser";

export const getClientConfig = (options?: ClientOptions) => {
	/* check if the credentials property is supported. Useful for cf workers */
	const isCredentialsSupported = "credentials" in Request.prototype;
	const baseURL = getBaseURL(options?.baseURL, options?.basePath);
	const pluginsFetchPlugins =
		options?.plugins
			?.flatMap((plugin) => plugin.fetchPlugins)
			.filter((pl) => pl !== undefined) || [];
	const $fetch = createFetch({
		baseURL,
		...(isCredentialsSupported ? { credentials: "include" } : {}),
		method: "GET",
		jsonParser(text) {
			if (!text) {
				return null as any;
			}
			return parseJSON(text, {
				strict: false,
			});
		},
		customFetchImpl: async (input, init) => {
			try {
				return await fetch(input, init);
			} catch (error) {
				return Response.error();
			}
		},
		...options?.fetchOptions,
		plugins: options?.disableDefaultFetchPlugins
			? [...(options?.fetchOptions?.plugins || []), ...pluginsFetchPlugins]
			: [
					redirectPlugin,
					...(options?.fetchOptions?.plugins || []),
					...pluginsFetchPlugins,
				],
	});
	const { $sessionSignal, session } = getSessionAtom($fetch);
	const plugins = options?.plugins || [];
	let pluginsActions = {} as Record<string, any>;
	let pluginsAtoms = {
		$sessionSignal,
		session,
	} as Record<string, WritableAtom<any>>;
	let pluginPathMethods: Record<string, "POST" | "GET"> = {
		"/sign-out": "POST",
		"/revoke-sessions": "POST",
		"/revoke-other-sessions": "POST",
		"/delete-user": "POST",
	};
	const atomListeners: AtomListener[] = [
		{
			signal: "$sessionSignal",
			matcher(path) {
				return (
					path === "/sign-out" ||
					path === "/update-user" ||
					path.startsWith("/sign-in") ||
					path.startsWith("/sign-up") ||
					path === "/delete-user" ||
					path === "/verify-email"
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
			Object.assign(
				pluginsActions,
				plugin.getActions?.($fetch, $store, options),
			);
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
