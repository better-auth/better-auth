import type {
	BetterAuthClientPlugin,
	BetterAuthPlugin,
} from "@better-auth/core";
import type { LiteralString } from "../../types/helper";
import { getBaseURL } from "../../utils/url";
import {
	normalizePrefix,
	resolveURL,
	SPECIAL_ENDPOINTS,
	toCamelCase,
	updateMatcher,
} from "./utils";
import { capitalizeFirstLetter } from "../../utils";
import type {
	InferAliasedClientPlugin,
	InferAliasedClientPlugin_base,
} from "./types/client";
import { aliasCompatClient } from "./compat/client";

export type AliasClientOptions = {
	/**
	 * Additional endpoints that should be prefixed.
	 *
	 * Use this in conjunction with the compat plugin
	 * to define endpoints that should be prefixed and
	 * are not present in the plugin's pathMethods.
	 */
	includeEndpoints?: LiteralString[];
	/**
	 * Endpoints that should not be prefixed with the alias.
	 */
	excludeEndpoints?: LiteralString[];
	/**
	 * Modifies `$Infer` types to avoid naming collisions
	 * when using multiple aliased clients.
	 *
	 * @default false
	 */
	prefixTypeInference?: boolean;
	/**
	 * Modifies atom keys to prevent collisions across aliased clients.
	 *
	 * @default false
	 */
	prefixAtoms?: boolean;
};

/**
 * Wraps a client plugin and prefixes all its endpoints with a sub-path
 * to avoid conflicts between plugins with similar endpoint paths.
 *
 * @param prefix - The sub-path to prefix all plugin endpoints with (e.g., "/polar", "/dodo")
 * @param plugin - The client plugin to wrap
 * @param options - Additional configuration
 * @returns A new client plugin with all endpoints prefixed
 *
 * @example
 * ```ts
 * import { aliasClient, polarCheckoutClient, dodoCheckoutClient } from "better-auth/client/plugins";
 *
 * const authClient = createAuthClient({
 *   plugins: [
 *     aliasClient("/polar", polarCheckoutClient()),
 *     aliasClient("/dodo", dodoCheckoutClient())
 *   ]
 * })
 * // Now endpoints will be:
 * // - /api/auth/polar/checkout
 * // - /api/auth/dodo/checkout
 * ```
 */
export function aliasClient<
	Prefix extends LiteralString,
	T extends BetterAuthClientPlugin,
	O extends AliasClientOptions,
>(prefix: Prefix, plugin: T, options?: O) {
	const cleanPrefix = normalizePrefix(prefix);
	const camelCasePrefix = toCamelCase(cleanPrefix);
	const aliasedPlugin: BetterAuthClientPlugin = {
		...plugin,
		id: `${plugin.id}-${cleanPrefix.replace(/\//g, "-")}`,
	};
	// Cached list of atom signal keys from getAtoms
	// Used to selectively prefix only signals that belong to this plugin
	// Populated lazily when getAtoms is first invoked
	let lazySignals: string[] | null = null;

	// Prefix pathMethods unless explicitly excluded
	if (plugin.pathMethods) {
		const prefixedPathMethods: Record<string, "POST" | "GET"> = {};
		for (const [path, method] of Object.entries(plugin.pathMethods)) {
			if (options?.excludeEndpoints?.includes(path)) {
				prefixedPathMethods[path] = method;
				continue;
			}

			prefixedPathMethods[`${cleanPrefix}${path}`] = method;
		}
		aliasedPlugin.pathMethods = prefixedPathMethods;
	}

	// Update atomListeners matchers to respect prefix and optional atom key prefixing
	if (plugin.atomListeners) {
		aliasedPlugin.atomListeners = () => {
			const originalListeners =
				(typeof plugin.atomListeners === "function"
					? plugin.atomListeners()
					: plugin.atomListeners) || [];
			return originalListeners.map((listener) => ({
				// Prefix signal name if needed and name is not preserved
				signal:
					listener.signal !== "$sessionSignal" &&
					lazySignals?.includes(`${listener.signal}`) &&
					!!options?.prefixAtoms
						? `${listener.signal}${capitalizeFirstLetter(camelCasePrefix)}`
						: listener.signal,
				matcher: updateMatcher({
					matcher: listener.matcher,
					prefix: cleanPrefix,
					excludeEndpoints: options?.excludeEndpoints,
				}),
			}));
		};
	}

	// Wrap getActions to prefix any path-based actions
	if (plugin.getActions) {
		aliasedPlugin.getActions = ($fetch, store, clientOptions) => {
			const baseURL = getBaseURL(
				clientOptions?.baseURL,
				clientOptions?.basePath,
				undefined,
			);
			const originalActions = plugin.getActions!(
				((url: string | URL, ...opts: any[]) => {
					return $fetch(
						resolveURL(
							{
								url,
								baseURL,
							},
							options?.excludeEndpoints ?? [],
							prefix,
						),
						...opts,
					);
				}) as any,
				store,
				clientOptions,
			);
			const prefixedActions: Record<string, any> = {};

			// Split actions into specialEndpoints and regular endpoints
			for (const [key, action] of Object.entries(originalActions)) {
				if (SPECIAL_ENDPOINTS.some((value) => toCamelCase(value) === key)) {
					prefixedActions[key] ??= {};
					prefixedActions[key][camelCasePrefix] = action;
				} else {
					prefixedActions[camelCasePrefix] ??= {};
					prefixedActions[camelCasePrefix][key] = action;
				}
			}

			return prefixedActions;
		};
	}

	// Wrap getAtoms to prefix any path-based actions and optionally atom keys
	if (plugin.getAtoms) {
		aliasedPlugin.getAtoms = ($fetch, clientOptions) => {
			const baseURL = getBaseURL(
				clientOptions?.baseURL,
				clientOptions?.basePath,
				undefined,
			);
			const originalAtoms = plugin.getAtoms!(
				((url: string | URL, ...opts: any[]) => {
					return $fetch(
						resolveURL(
							{ url, baseURL },
							options?.excludeEndpoints ?? [],
							prefix,
						),
						...opts,
					);
				}) as any,
				clientOptions,
			);

			if (!lazySignals) {
				lazySignals = Object.keys(originalAtoms).filter(
					(key) => key.charAt(0) === "$",
				);
			}
			return options?.prefixAtoms
				? Object.fromEntries(
						Object.entries(originalAtoms).map(([key, value]) => {
							return [`${key}${capitalizeFirstLetter(camelCasePrefix)}`, value];
						}),
					)
				: originalAtoms;
		};
	}

	// Ensure fetchPlugins have unique ids
	if (plugin.fetchPlugins) {
		aliasedPlugin.fetchPlugins = plugin.fetchPlugins.map((fetchPlugin) => ({
			...fetchPlugin,
			id: `${fetchPlugin.id}-${cleanPrefix.replace(/\//g, "-")}`,
		}));
	}

	// Wrap the $InferServerPlugin if it exists
	if (plugin.$InferServerPlugin) {
		const wrappedServerPlugin: BetterAuthPlugin = {
			...plugin.$InferServerPlugin,
		};

		if (plugin.$InferServerPlugin.endpoints) {
			const prefixedEndpoints: Record<string, any> = {};
			for (const [key, endpoint] of Object.entries(
				plugin.$InferServerPlugin.endpoints,
			)) {
				const clonedEndpoint = { ...endpoint };
				const originalPath = (endpoint as any).path || `/${key}`;
				clonedEndpoint.path = `${cleanPrefix}${originalPath}`;
				prefixedEndpoints[key] = clonedEndpoint;
			}
			wrappedServerPlugin.endpoints = prefixedEndpoints;
		}

		aliasedPlugin.$InferServerPlugin = wrappedServerPlugin;
	}

	Object.assign(aliasedPlugin, {
		// Add compat helper to wrap other plugins for interop
		compat: aliasCompatClient.bind(
			null,
			aliasedPlugin as InferAliasedClientPlugin_base<Prefix, T, O>,
		),
		// store data for internal usage
		"~meta": {
			prefix: cleanPrefix,
			options,
			get signals() {
				return lazySignals;
			},
		},
	});

	return aliasedPlugin as InferAliasedClientPlugin<
		Prefix,
		T,
		O
	> satisfies BetterAuthClientPlugin;
}

export * from "./compat/client";
export type * from "./types";
