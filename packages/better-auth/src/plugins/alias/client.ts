import type {
	BetterAuthClientPlugin,
	BetterAuthPlugin,
	ClientAtomListener,
} from "@better-auth/core";
import type { LiteralString } from "../../types/helper";
import type { InferAliasedPlugin } from ".";
import type {
	CamelCasePrefix,
	MatchesExcluded,
	NormalizePrefix,
	TransformNormalizedPrefix,
} from "./types";
import { getBaseURL } from "../../utils/url";
import {
	normalizePath,
	normalizePrefix,
	resolvePath,
	SPECIAL_ENDPOINTS,
	toCamelCase,
	type SpecialEndpoints,
} from "./utils";
import { BetterAuthError } from "@better-auth/core/error";
import { capitalizeFirstLetter } from "../../utils";

type ExtendPathMethods<
	T extends BetterAuthClientPlugin,
	P extends string,
	O extends AliasClientOptions,
> = T extends {
	pathMethods: infer U;
}
	? {
			pathMethods: {
				[K in keyof U as MatchesExcluded<
					K & string,
					O["excludeEndpoints"]
				> extends true
					? K & string
					: `${P}${K & string}`]: U[K];
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
						| CamelCasePrefix<SpecialEndpoints>
						? never
						: K]: Actions[K];
				};
			} & {
				[T in keyof Actions &
					string as T extends CamelCasePrefix<SpecialEndpoints> ? T : never]: {
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
	Options extends AliasClientOptions,
> = T extends {
	getAtoms: (fetch: infer F, options: infer O) => infer Atoms;
}
	? {
			getAtoms: (
				fetch: F,
				options: O,
			) => {
				[K in keyof Atoms & string as Options["prefixAtoms"] extends true
					? `${K}${Capitalize<CamelCasePrefix<P>>}`
					: K]: Atoms[K];
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
					prefixEndpointMethods: true;
				},
				true
			>
		: never;
};

type InferMeta<AliasedPlugin extends BetterAuthClientPlugin> =
	AliasedPlugin extends {
		"~meta": {
			prefix: infer P extends LiteralString;
			options?: infer O extends AliasClientOptions;
			signals: infer S extends LiteralString | null;
		};
	}
		? {
				prefix: P;
				options: O;
				signals: S;
			}
		: never;

export type InferAliasCompatClientPlugin<
	AliasedPlugin extends BetterAuthClientPlugin,
	T extends BetterAuthClientPlugin,
	O extends AliasCompatClientOptions,
> = Omit<T, "atomListeners"> & {
	atomListeners?: () => ClientAtomListener[] | undefined;
};

type InferAliasedClientPlugin_base<
	Prefix extends LiteralString,
	T extends BetterAuthClientPlugin,
	O extends AliasClientOptions,
> = Omit<
	T,
	| "id"
	| "pathMethods"
	| "getActions"
	| "getAtoms"
	| "atomListeners"
	| "$InferServerPlugin"
> & {
	id: `${T["id"]}-${TransformNormalizedPrefix<NormalizePrefix<Prefix>>}`;
} & ExtendPathMethods<T, NormalizePrefix<Prefix>, O> &
	ExtendGetActions<T, NormalizePrefix<Prefix>, O> &
	ExtendGetAtoms<T, NormalizePrefix<Prefix>, O> &
	ExtendEndpoints<T, NormalizePrefix<Prefix>> & {
		"~meta": {
			prefix: NormalizePrefix<Prefix>;
			options: O;
			signals: T["getAtoms"] extends (...args: any[]) => infer R
				?
						| {
								[K in keyof R & string]: K extends `$${string}` ? K : never;
						  }[keyof R & string][]
						| null
				: null;
		};
		atomListeners?: () => ClientAtomListener[] | undefined;
	};

export type InferAliasedClientPlugin<
	Prefix extends LiteralString,
	T extends BetterAuthClientPlugin,
	O extends AliasClientOptions,
> = InferAliasedClientPlugin_base<Prefix, T, O> & {
	compat: <
		Plugin extends BetterAuthClientPlugin,
		Option extends AliasCompatClientOptions,
	>(
		plugin: Plugin,
		options?: Option,
	) => InferAliasCompatClientPlugin<
		InferAliasedClientPlugin_base<Prefix, T, O>,
		Plugin,
		Option
	>;
};

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
	let lazySignals: string[] | null = null;

	// Prefix pathMethods
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

	// Update atomListeners matchers
	if (plugin.atomListeners) {
		aliasedPlugin.atomListeners = () => {
			const originalListeners =
				(typeof plugin.atomListeners === "function"
					? plugin.atomListeners()
					: plugin.atomListeners) || [];
			return originalListeners.map((listener) => ({
				signal:
					listener.signal !== "$sessionSignal" &&
					lazySignals?.includes(`${listener.signal}`) &&
					!!options?.prefixAtoms
						? `${listener.signal}${capitalizeFirstLetter(camelCasePrefix)}`
						: listener.signal,
				matcher: (path: string) => {
					// Check if the path starts with the prefix, then strip it and check the original matcher
					if (path.startsWith(cleanPrefix)) {
						const originalPath = path.slice(cleanPrefix.length);
						return listener.matcher(originalPath);
					} else {
						if (options?.excludeEndpoints?.includes(path)) {
							return listener.matcher(path);
						}
					}
					return false;
				},
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

	if (plugin.fetchPlugins) {
		aliasedPlugin.fetchPlugins = plugin.fetchPlugins.map((fetchPlugin) => ({
			...fetchPlugin,
			id: `${fetchPlugin.id}-${cleanPrefix.replace(/\//g, "-")}`,
		}));
	}

	// // Wrap the $InferServerPlugin if it exists
	// if (plugin.$InferServerPlugin) {
	// 	const wrappedServerPlugin: BetterAuthPlugin = {
	// 		...plugin.$InferServerPlugin,
	// 	};

	// 	if (plugin.$InferServerPlugin.endpoints) {
	// 		const prefixedEndpoints: Record<string, any> = {};
	// 		for (const [key, endpoint] of Object.entries(
	// 			plugin.$InferServerPlugin.endpoints,
	// 		)) {
	// 			const clonedEndpoint = { ...endpoint };
	// 			const originalPath = (endpoint as any).path || `/${key}`;
	// 			clonedEndpoint.path = `${cleanPrefix}${originalPath}`;
	// 			prefixedEndpoints[key] = clonedEndpoint;
	// 		}
	// 		wrappedServerPlugin.endpoints = prefixedEndpoints;
	// 	}

	// 	aliasedPlugin.$InferServerPlugin = wrappedServerPlugin;
	// }

	Object.assign(aliasedPlugin, {
		compat: aliasCompatClient.bind(
			null,
			aliasedPlugin as InferAliasedClientPlugin_base<Prefix, T, O>,
		),
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

export type AliasCompatClientOptions = {
	/**
	 * Additional endpoints that should be prefixed.
	 *
	 * Use this to define endpoints that should be prefixed
	 * and are not present in the plugin's pathMethods.
	 */
	includeEndpoints?: LiteralString[];
};

export function aliasCompatClient<
	AliasedPlugin extends BetterAuthClientPlugin,
	T extends BetterAuthClientPlugin,
	O extends AliasCompatClientOptions,
>(aliasedPlugin: AliasedPlugin, plugin: T, options?: O) {
	if (!("~meta" in aliasedPlugin)) {
		throw new BetterAuthError(
			"aliasedPlugin",
			"Invalid aliasedPlugin provided.",
		);
	}
	const {
		prefix,
		options: aliasOptions,
		signals,
	} = aliasedPlugin["~meta"] as InferMeta<AliasedPlugin>;
	const camelCasePrefix = toCamelCase(prefix);
	const compatPlugin: BetterAuthClientPlugin = {
		...plugin,
	};

	const includeEndpoints = [
		...new Set([
			...(options?.includeEndpoints || []),
			...(aliasOptions?.includeEndpoints || []),
			...Object.keys(aliasedPlugin.pathMethods || {})
				.filter((path) => path.startsWith(prefix))
				.map((path) => path.slice(prefix.length)),
		]),
	];

	// Update atomListeners matchers
	if (plugin.atomListeners) {
		compatPlugin.atomListeners = () => {
			const originalListeners =
				(typeof plugin.atomListeners === "function"
					? plugin.atomListeners()
					: plugin.atomListeners) || [];

			return originalListeners.map((listener) => ({
				signal:
					listener.signal !== "$sessionSignal" &&
					signals?.includes(`${listener.signal}`) &&
					aliasOptions?.prefixAtoms
						? `${listener.signal}${capitalizeFirstLetter(camelCasePrefix)}`
						: listener.signal,
				matcher: (path: string) => {
					// Check if the path starts with the prefix, then strip it and check the original matcher
					if (path.startsWith(prefix)) {
						const originalPath = path.slice(prefix.length);
						return listener.matcher(originalPath);
					} else {
						if (aliasOptions?.excludeEndpoints?.includes(path)) {
							return listener.matcher(path);
						}
					}
					return false;
				},
			}));
		};
	}

	// Wrap getActions to prefix specific path-based action
	if (plugin.getActions) {
		compatPlugin.getActions = ($fetch, store, clientOptions) => {
			const baseURL = getBaseURL(
				clientOptions?.baseURL,
				clientOptions?.basePath,
				undefined,
			);
			return plugin.getActions!(
				((url: string | URL, ...opts: any[]) => {
					return $fetch(
						resolveURL(
							{
								url,
								baseURL,
							},
							includeEndpoints,
							prefix,
							"include",
						),
						...opts,
					);
				}) as any,
				store,
				clientOptions,
			);
		};
	}

	// Wrap getAtoms to prefix specific path-based action
	if (plugin.getAtoms) {
		compatPlugin.getAtoms = ($fetch, clientOptions) => {
			const baseURL = getBaseURL(
				clientOptions?.baseURL,
				clientOptions?.basePath,
				undefined,
			);
			return plugin.getAtoms!(
				((url: string | URL, ...opts: any[]) => {
					return $fetch(
						resolveURL({ url, baseURL }, includeEndpoints, prefix, "include"),
						...opts,
					);
				}) as any,
				clientOptions,
			);
		};
	}

	// Update fetchPlugins hooks to prefix specific paths
	if (plugin.fetchPlugins) {
		compatPlugin.fetchPlugins = plugin.fetchPlugins.map((fetchPlugin) => ({
			...fetchPlugin,
			init(url, options) {
				const resolvedURL = resolveURL(
					{
						url,
						baseURL: options?.baseURL,
					},
					includeEndpoints,
					prefix,
					"include",
				);

				return fetchPlugin.init
					? fetchPlugin.init?.(resolvedURL, options)
					: {
							url: resolvedURL,
							options,
						};
			},
		}));
	}

	return compatPlugin as InferAliasCompatClientPlugin<
		InferAliasedClientPlugin_base<
			InferMeta<AliasedPlugin>["prefix"],
			AliasedPlugin,
			InferMeta<AliasedPlugin>["options"]
		>,
		T,
		O
	>;
}

const resolveURL = (
	context: {
		url: string | URL;
		baseURL?: string;
	},
	specialEndpoints: string[],
	prefix?: string,
	mode: "exclude" | "include" = "exclude",
) => {
	const { path, basePath } = resolvePath(
		context.url.toString(),
		context.baseURL,
	);

	const matches = specialEndpoints.some((ep) => {
		const normalized = normalizePath(ep);
		return path === normalized || path.startsWith(`${normalized}/`);
	});
	if ((mode === "exclude" && matches) || (mode === "include" && !matches)) {
		return context.url.toString();
	}

	const relativePath = `${prefix || ""}${path}`;
	if (typeof context.url !== "string") {
		const res = new URL(`${basePath}${relativePath}`, context.url).toString();
		return res;
	}

	return relativePath;
};
