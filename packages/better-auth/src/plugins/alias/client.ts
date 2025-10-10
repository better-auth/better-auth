import type { Endpoint } from "better-call";
import type { BetterAuthClientPlugin, BetterAuthPlugin } from "../../types";

type ExtendPathMethods<
	T extends BetterAuthClientPlugin,
	P extends string,
> = T extends {
	pathMethods: infer U;
}
	? {
			pathMethods: {
				[K in keyof U as `${P}${K & string}`]: U[K];
			};
		}
	: {
			pathMethods: undefined;
		};

type ExtendGetActions<
	T extends BetterAuthClientPlugin,
	P extends string,
> = T extends {
	getActions: (
		fetch: infer F,
		store: infer S,
		options: infer O,
	) => infer Actions;
}
	? {
			getActions: (
				fetch: F,
				store: S,
				options: O,
			) => {
				[K in keyof Actions]: Actions[K];
			};
		}
	: { getActions: undefined };

type NormalizePrefix<S extends string> = S extends ""
	? ""
	: S extends "/"
		? ""
		: S extends `/${infer Rest}`
			? Rest extends `${infer Inner}/`
				? `/${Inner}`
				: `/${Rest}`
			: S extends `${infer Inner}/`
				? `/${Inner}`
				: `/${S}`;

type ExtendPaths<T extends BetterAuthClientPlugin, Prefix extends string> = {
	$InferServerPlugin: T["$InferServerPlugin"] extends infer SP extends
		BetterAuthPlugin
		? Omit<SP, "endpoints"> & {
				endpoints: {
					[K in keyof SP["endpoints"] &
						string]: SP["endpoints"][K] extends Endpoint<
						infer OldPath,
						infer Options
					>
						? Endpoint<`${Prefix}${OldPath}`, Options>
						: never;
				};
			}
		: never;
};

/**
 * Wraps a client plugin and prefixes all its endpoints with a sub-path
 * to avoid conflicts between plugins with similar endpoint paths.
 *
 * @param prefix - The sub-path to prefix all plugin endpoints with (e.g., "/polar", "/dodo")
 * @param plugin - The client plugin to wrap
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
	Prefix extends string,
	T extends BetterAuthClientPlugin,
>(
	prefix: Prefix,
	plugin: T,
): Omit<T, "pathMethods" | "$InferServerPlugin"> &
	ExtendPathMethods<T, NormalizePrefix<Prefix>> &
	ExtendGetActions<T, NormalizePrefix<Prefix>> &
	ExtendPaths<T, NormalizePrefix<Prefix>> {
	const normalizedPrefix = prefix.startsWith("/") ? prefix : `/${prefix}`;
	const cleanPrefix = normalizedPrefix.endsWith("/")
		? normalizedPrefix.slice(0, -1)
		: normalizedPrefix;

	const aliasedPlugin: BetterAuthClientPlugin = {
		...plugin,
		id: `${plugin.id}-${cleanPrefix.replace(/\//g, "-")}`,
	};

	// Prefix pathMethods
	if (plugin.pathMethods) {
		const prefixedPathMethods: Record<string, "POST" | "GET"> = {};
		for (const [path, method] of Object.entries(plugin.pathMethods)) {
			prefixedPathMethods[`${cleanPrefix}${path}`] = method;
		}
		aliasedPlugin.pathMethods = prefixedPathMethods;
	}

	// Update atomListeners matchers
	if (plugin.atomListeners) {
		aliasedPlugin.atomListeners = plugin.atomListeners.map((listener) => ({
			...listener,
			matcher: (path: string) => {
				// Check if the path starts with the prefix, then strip it and check the original matcher
				if (path.startsWith(cleanPrefix)) {
					const originalPath = path.slice(cleanPrefix.length);
					return listener.matcher(originalPath);
				}
				return false;
			},
		}));
	}

	// Wrap getActions to prefix any path-based actions
	if (plugin.getActions) {
		aliasedPlugin.getActions = (fetch, store, options) => {
			const originalActions = plugin.getActions!(fetch, store, options);
			const prefixedActions: Record<string, any> = {};

			for (const [key, action] of Object.entries(originalActions)) {
				if (typeof action === "function") {
					prefixedActions[key] = action;
				} else {
					prefixedActions[key] = action;
				}
			}

			return prefixedActions;
		};
	}

	// Update fetchPlugins hooks to handle prefixed paths
	if (plugin.fetchPlugins) {
		aliasedPlugin.fetchPlugins = plugin.fetchPlugins.map((fetchPlugin) => ({
			...fetchPlugin,
			id: `${fetchPlugin.id}-${cleanPrefix.replace(/\//g, "-")}`,
			hooks: fetchPlugin.hooks
				? {
						...fetchPlugin.hooks,
						onRequest: fetchPlugin.hooks.onRequest
							? async (context) => {
									// Prefix the URL path
									if (context.url && typeof context.url === "string") {
										const url = new URL(context.url, "http://localhost");
										const pathMatch = plugin.pathMethods
											? Object.keys(plugin.pathMethods).some((p) =>
													url.pathname.endsWith(p),
												)
											: false;
										if (pathMatch) {
											const segments = url.pathname.split("/");
											const authIndex = segments.findIndex((s) => s === "auth");
											if (authIndex !== -1) {
												// Insert prefix after /auth/
												segments.splice(authIndex + 1, 0, cleanPrefix.slice(1));
												url.pathname = segments.join("/");
												context.url = url.href.replace("http://localhost", "");
											}
										}
									}
									return fetchPlugin.hooks!.onRequest!(context);
								}
							: undefined,
					}
				: undefined,
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

	return aliasedPlugin as any;
}
