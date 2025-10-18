import type {
	BetterAuthClientPlugin,
	BetterAuthPlugin,
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
	normalizePrefix,
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
				[K in keyof Atoms &
					string as Options["unstable_prefixAtoms"] extends true
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
					unstable_prefixEndpointMethods: true;
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
		};
	}
		? {
				prefix: P;
				options: O;
			}
		: never;

export type InferAliasCompatClientPlugin<
	AliasedPlugin extends BetterAuthClientPlugin,
	T extends BetterAuthClientPlugin,
	O extends AliasCompatClientOptions,
> = T; // TODO:

type InferAliasedClientPlugin_base<
	Prefix extends LiteralString,
	T extends BetterAuthClientPlugin,
	O extends AliasClientOptions,
> = Omit<
	T,
	"id" | "pathMethods" | "getActions" | "getAtoms" | "$InferServerPlugin"
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
	 * If `true`, adds a prefix `$Infer` types.
	 *
	 * @default false
	 */
	prefixTypeInference?: boolean;
	/**
	 * If `true`, adds an prefix to atoms.
	 *
	 * @default false
	 */
	unstable_prefixAtoms?: boolean;
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
		aliasedPlugin.atomListeners = plugin.atomListeners.map((listener) => ({
			signal:
				// TODO: add exclude signals option
				listener.signal !== "$sessionSignal" && !!options?.unstable_prefixAtoms
					? `${listener.signal}${capitalizeFirstLetter(camelCasePrefix)}`
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
								url: url,
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

	let lazySignals: string[] | null = null;
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
							{
								url: url,
								baseURL,
							},
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
			return options?.unstable_prefixAtoms
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
	const { prefix, options: aliasOptions } = aliasedPlugin[
		"~meta"
	] as InferMeta<AliasedPlugin>;
	const camelCasePrefix = toCamelCase(prefix);
	const compatPlugin: BetterAuthClientPlugin = {
		...plugin,
	};

	const includeEndpoints = new Set([
		...(options?.includeEndpoints || []),
		...(aliasOptions.includeEndpoints || []),
		...Object.keys(aliasedPlugin.pathMethods || {}).filter((path) =>
			path.startsWith(prefix),
		),
	]);

	// Update atomListeners matchers
	if (plugin.atomListeners) {
	}

	// Wrap getActions to prefix specific path-based action
	if (plugin.getActions) {
	}

	// Wrap getAtoms to prefix specific path-based action
	if (plugin.getAtoms) {
	}

	// Update fetchPlugins hooks to prefix specific paths
	if (plugin.fetchPlugins) {
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
	excludeEndpoints: string[],
	prefix?: string,
) => {
	let url: URL;
	if (typeof context.url === "string") {
		url = new URL(
			`${context.baseURL?.endsWith("/") ? context.baseURL.slice(0, -1) : context.baseURL}${(context.url.toString().startsWith("/") ? "" : "/") + context.url.toString()}`,
		);
	} else {
		url = new URL(context.url);
	}
	const base = new URL(context.baseURL || "");
	if (!url.pathname.startsWith(base.pathname)) {
		return url.toString();
	}

	const relativePath = url.pathname.slice(base.pathname.length);
	const normalizedRelative = relativePath.startsWith("/")
		? relativePath
		: `/${relativePath}`;
	const shouldExclude = excludeEndpoints.some(
		(path) =>
			normalizedRelative === path || normalizedRelative.startsWith(`${path}/`),
	);
	if (shouldExclude) {
		return url.toString();
	}

	const fullPath = `${base.pathname.replace(/\/$/, "")}${prefix || ""}${normalizedRelative}`;
	const finalUrl = new URL(fullPath, url.origin);
	finalUrl.search = url.search;
	finalUrl.hash = url.hash;

	return finalUrl.toString();
};
