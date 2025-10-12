import type {
	BetterAuthClientPlugin,
	BetterAuthPlugin,
} from "@better-auth/core";
import type { LiteralString } from "../../types/helper";
import type { InferAliasedPlugin } from ".";
import type {
	CamelCasePrefix,
	NormalizePrefix,
	TransformNormalizedPrefix,
} from "./types";
import { getBaseURL } from "../../utils/url";
import { SPECIAL_ENDPOINTS, toCamelCase } from "./utils";

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
	Options extends AliasClientOptions,
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
				[T in P as CamelCasePrefix<P>]: {
					[K in keyof Actions & string as K extends
						| "$Infer"
						| "signIn"
						| "signUp"
						? never
						: K]: Actions[K];
				};
			} & {
				[T in keyof Actions & string as T extends "signIn" | "signUp"
					? T
					: never]: {
					[I in CamelCasePrefix<P>]: Actions[T];
				};
			} & (Actions extends {
					$Infer: infer I extends Record<string, any>;
				}
					? {
							$Infer: Options["prefixTypeInference"] extends true
								? {
										[K in keyof I &
											string as `${Capitalize<CamelCasePrefix<P>>}${K}`]: I[K];
									}
								: I;
						}
					: { $Infer: {} });
		}
	: { getActions: undefined };

type ExtendGetAtoms<
	T extends BetterAuthClientPlugin,
	P extends string,
> = T extends {
	getAtoms: (fetch: infer F, options: infer O) => infer Atoms;
}
	? {
			getAtoms: (
				fetch: F,
				options: O,
			) => {
				[K in keyof Atoms &
					string as `${K}${Capitalize<CamelCasePrefix<P>>}`]: Atoms[K];
			};
		}
	: {
			getAtoms: undefined;
		};

type ExtendEndpoints<
	T extends BetterAuthClientPlugin,
	Prefix extends string,
> = {
	$InferServerPlugin: T["$InferServerPlugin"] extends infer P extends
		BetterAuthPlugin
		? InferAliasedPlugin<
				P,
				Prefix,
				{
					// make endpoints distinct
					unstable_prefixEndpointMethods: true;
				},
				true
			>
		: never;
};

export type InferAliasedClientPlugin<
	Prefix extends LiteralString,
	T extends BetterAuthClientPlugin,
	O extends AliasClientOptions,
> = Omit<
	T,
	"id" | "pathMethods" | "getActions" | "getAtoms" | "$InferServerPlugin"
> & {
	id: `${T["id"]}-${TransformNormalizedPrefix<NormalizePrefix<Prefix>>}`;
} & ExtendPathMethods<T, NormalizePrefix<Prefix>> &
	ExtendGetActions<T, NormalizePrefix<Prefix>, O> &
	ExtendGetAtoms<T, NormalizePrefix<Prefix>> &
	ExtendEndpoints<T, NormalizePrefix<Prefix>>;

export type AliasClientOptions = {
	/**
	 * Add alias to endpoints that were not automatically deteceted.
	 */
	aliasEndpoints?: string[];
	prefixTypeInference?: boolean;
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
	Prefix extends LiteralString,
	T extends BetterAuthClientPlugin,
	O extends AliasClientOptions,
>(prefix: Prefix, plugin: T, options?: O) {
	const normalizedPrefix = prefix.startsWith("/") ? prefix : `/${prefix}`;
	const cleanPrefix = normalizedPrefix.endsWith("/")
		? normalizedPrefix.slice(0, -1)
		: normalizedPrefix;
	const camelCasePrefix = toCamelCase(cleanPrefix);
	const aliasEndpointPaths = [
		...new Set([
			...Object.keys(plugin.pathMethods || {}),
			...(options?.aliasEndpoints || []),
		]),
	];
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
			signal:
				listener.signal !== "$sessionSignal"
					? `${listener.signal}${camelCasePrefix.charAt(0).toUpperCase() + camelCasePrefix.slice(1)}`
					: listener.signal,
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
		aliasedPlugin.getActions = ($fetch, store, options) => {
			const baseURL = getBaseURL(
				options?.baseURL,
				options?.basePath,
				undefined,
			);
			const originalActions = plugin.getActions!(
				((url: string | URL, ...options: any[]) => {
					return $fetch(
						resolveURL(
							{
								url: url,
								baseURL,
							},
							aliasEndpointPaths,
							prefix,
						),
						...options,
					);
				}) as any,
				store,
				options,
			);
			const prefixedActions: Record<string, any> = {};

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

	// Wrap getAtoms to prefix any path-based actions
	if (plugin.getAtoms) {
		aliasedPlugin.getAtoms = ($fetch, options) => {
			const baseURL = getBaseURL(
				options?.baseURL,
				options?.basePath,
				undefined,
			);
			const originalAtoms = plugin.getAtoms!(
				((url: string | URL, ...options: any[]) => {
					return $fetch(
						resolveURL(
							{
								url: url,
								baseURL,
							},
							aliasEndpointPaths,
							prefix,
						),
						...options,
					);
				}) as any,
				options,
			);

			return Object.fromEntries(
				Object.entries(originalAtoms).map(([key, value]) => {
					return [
						`${key}${camelCasePrefix.charAt(0).toUpperCase() + camelCasePrefix.slice(1)}`,
						value,
					];
				}),
			);
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

	// // Wrap the $InferServerPlugin if it exists
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

	return aliasedPlugin as InferAliasedClientPlugin<
		Prefix,
		T,
		O
	> satisfies BetterAuthClientPlugin;
}

const resolveURL = (
	context: {
		url: string | URL;
		baseURL?: string;
	},
	aliasEndpointPaths: string[],
	prefix?: string,
) => {
	let url: URL;
	try {
		url = new URL(context.url);
	} catch {
		url = new URL(
			`${context.baseURL?.endsWith("/") ? context.baseURL.slice(0, -1) : context.baseURL}${(context.url.toString().startsWith("/") ? "" : "/") + context.url.toString()}`,
		);
	}
	const base = new URL(context.baseURL || "");
	if (!url.pathname.startsWith(base.pathname)) {
		return url.toString();
	}

	const relativePath = url.pathname.slice(base.pathname.length);
	const normalizedRelative = relativePath.startsWith("/")
		? relativePath
		: `/${relativePath}`;
	const shouldPrefix = aliasEndpointPaths.some(
		(path) =>
			normalizedRelative === path || normalizedRelative.startsWith(`${path}/`),
	);
	if (!shouldPrefix) {
		return url.toString();
	}

	const fullPath = `${base.pathname.replace(/\/$/, "")}${prefix || ""}${normalizedRelative}`;
	const finalUrl = new URL(fullPath, url.origin);
	finalUrl.search = url.search;
	finalUrl.hash = url.hash;

	return finalUrl.toString();
};
