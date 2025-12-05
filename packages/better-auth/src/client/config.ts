import type {
	BetterAuthClientOptions,
	ClientAtomListener,
} from "@better-auth/core";
import { createFetch } from "@better-fetch/fetch";
import type { WritableAtom } from "nanostores";
import { getBaseURL } from "../utils/url";
import { redirectPlugin } from "./fetch-plugins";
import { parseJSON } from "./parser";
import { getSessionAtom } from "./session-atom";

export const getClientConfig = (
	options?: BetterAuthClientOptions | undefined,
	loadEnv?: boolean | undefined,
) => {
	/* check if the credentials property is supported. Useful for cf workers */
	const isCredentialsSupported = "credentials" in Request.prototype;
	const baseURL =
		getBaseURL(options?.baseURL, options?.basePath, undefined, loadEnv) ??
		"/api/auth";
	const pluginsFetchPlugins =
		options?.plugins
			?.flatMap((plugin) => plugin.fetchPlugins)
			.filter((pl) => pl !== undefined) || [];
	const lifeCyclePlugin = {
		id: "lifecycle-hooks",
		name: "lifecycle-hooks",
		hooks: {
			onSuccess: options?.fetchOptions?.onSuccess,
			onError: options?.fetchOptions?.onError,
			onRequest: options?.fetchOptions?.onRequest,
			onResponse: options?.fetchOptions?.onResponse,
		},
	};
	const { onSuccess, onError, onRequest, onResponse, ...restOfFetchOptions } =
		options?.fetchOptions || {};
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
		customFetchImpl: fetch,
		...restOfFetchOptions,
		plugins: [
			lifeCyclePlugin,
			...(restOfFetchOptions.plugins || []),
			...(options?.disableDefaultFetchPlugins ? [] : [redirectPlugin]),
			...pluginsFetchPlugins,
		],
	});
	const { $sessionSignal, session } = getSessionAtom($fetch, options);
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
	const atomListeners: ClientAtomListener[] = [
		{
			signal: "$sessionSignal",
			matcher(path) {
				const matchesCommonPaths =
					path === "/sign-out" ||
					path === "/update-user" ||
					path === "/sign-up/email" ||
					path === "/sign-in/email" ||
					path === "/delete-user" ||
					path === "/verify-email" ||
					path === "/revoke-sessions" ||
					path === "/revoke-session" ||
					path === "/change-email";

				return matchesCommonPaths;
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
		notify: (
			signal?: (Omit<string, "$sessionSignal"> | "$sessionSignal") | undefined,
		) => {
			pluginsAtoms[signal as keyof typeof pluginsAtoms]!.set(
				!pluginsAtoms[signal as keyof typeof pluginsAtoms]!.get(),
			);
		},
		listen: (
			signal: Omit<string, "$sessionSignal"> | "$sessionSignal",
			listener: (value: boolean, oldValue?: boolean | undefined) => void,
		) => {
			pluginsAtoms[signal as keyof typeof pluginsAtoms]!.subscribe(listener);
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
		get baseURL() {
			return baseURL;
		},
		pluginsActions,
		pluginsAtoms,
		pluginPathMethods,
		atomListeners,
		$fetch,
		$store,
	};
};
