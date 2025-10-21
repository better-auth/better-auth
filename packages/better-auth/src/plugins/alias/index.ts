import type { AuthEndpoint } from "../../api";
import type { LiteralString } from "../../types/helper";
import type { BetterAuthPlugin } from "@better-auth/core";
import type { InferAliasedPlugin_base, NormalizePrefix } from "./types";
import {
	SPECIAL_ENDPOINTS,
	toCamelCase,
	normalizePrefix,
	normalizePath,
	updateMatcher,
} from "./utils";
import { BetterAuthError } from "@better-auth/core/error";
import type { Middleware } from "better-call";

export type InferAliasedPlugin<
	Prefix extends string,
	T extends BetterAuthPlugin,
	O extends AliasOptions,
> = InferAliasedPlugin_base<Prefix, T, O> & {
	compat: <Plugin extends BetterAuthPlugin, Option extends AliasCompatOptions>(
		plugin: Plugin,
		options?: Option,
	) => InferAliasCompatPlugin<
		InferAliasedPlugin_base<Prefix, T, O>,
		Plugin,
		Option
	>;
};

export type InferAliasCompatPlugin<
	AliasedPlugin extends BetterAuthPlugin,
	T extends BetterAuthPlugin,
	O extends AliasCompatOptions,
> = Omit<T, "middlewares"> & {
	middlewares: T["middlewares"] extends infer M extends {
		path: string;
		middleware: Middleware;
	}[]
		? {
				[K in keyof M]: Omit<M[K], "path"> & {
					path: M[K]["path"] extends InferIncludedEndpoints<AliasedPlugin, O>
						? `${NormalizePrefix<InferMeta<AliasedPlugin>["prefix"]>}${M[K]["path"]}`
						: M[K]["path"];
				};
			}
		: never;
};

type InferIncludedEndpoints<
	AliasedPlugin extends BetterAuthPlugin,
	O extends AliasCompatOptions,
> =
	| (AliasedPlugin["endpoints"] extends infer E extends Record<
			string,
			{ path: string }
	  >
			? {
					[K in keyof E]: NonNullable<
						InferMeta<AliasedPlugin>["options"]["excludeEndpoints"]
					>[number] extends E[K]["path"]
						? never
						: E[K]["path"];
				}[keyof E]
			: never)
	| (InferMeta<AliasedPlugin>["options"]["includeEndpoints"] extends infer IE extends
			string[]
			? IE[number]
			: never)
	| (O["includeEndpoints"] extends infer IE extends string[]
			? IE[number]
			: never);

export type AliasOptions = {
	/**
	 * Derives a camelCase prefix for endpoint methods.
	 *
	 * Example with alias `/v1`:
	 * - `createUser` -> `v1CreateUser`
	 * - `listUserSessions` -> `v1ListUserSessions`
	 * - `revokeUserSession` -> `v1RevokeUserSession`
	 *
	 * @default false
	 */
	prefixEndpointMethods?: boolean;
	/**
	 * Modifies `$Infer` types to avoid naming collisions
	 * when using multiple aliased plugins.
	 *
	 * @default false
	 */
	prefixTypeInference?: boolean;
	/**
	 * Endpoints that should not be prefixed with the alias.
	 */
	excludeEndpoints?: LiteralString[];
	/**
	 * Additional endpoints that should be prefixed.
	 *
	 * Use this in conjunction with the compat plugin.
	 */
	includeEndpoints?: LiteralString[];
};

type InferMeta<AliasedPlugin extends BetterAuthPlugin> = AliasedPlugin extends {
	"~meta": {
		prefix: infer P extends string;
		options?: infer O extends AliasOptions;
	};
}
	? {
			prefix: P;
			options: O;
		}
	: never;

/**
 * Wraps a plugin and prefixes all its endpoints with a sub-path
 * to avoid conflicts between plugins with similar endpoint paths.
 *
 * @param prefix - The sub-path to prefix all plugin endpoints with (e.g., "/polar", "/dodo")
 * @param plugin - The plugin to wrap
 * @returns A new plugin with all endpoints prefixed
 *
 * @example
 * ```ts
 * import { alias, polarCheckout, dodoCheckout } from "better-auth/plugins";
 *
 * export const auth = betterAuth({
 *   plugins: [
 *     alias("/polar", polarCheckout()),
 *     alias("/dodo", dodoCheckout())
 *   ]
 * })
 * // Now endpoints will be:
 * // - /api/auth/polar/checkout
 * // - /api/auth/dodo/checkout
 * ```
 */
export function alias<
	Prefix extends LiteralString,
	T extends BetterAuthPlugin,
	O extends AliasOptions,
>(prefix: Prefix, plugin: T, options?: O) {
	const cleanPrefix = normalizePrefix(prefix);
	const aliasedPlugin: BetterAuthPlugin = {
		...plugin,
	};
	if (plugin.endpoints) {
		const prefixedEndpoints: Record<string, AuthEndpoint> = {};

		for (const [key, endpoint] of Object.entries(plugin.endpoints)) {
			const originalPath = endpoint.path || `/${key}`;
			const newPath = options?.excludeEndpoints?.includes(originalPath)
				? originalPath
				: resolveNewPath(originalPath, cleanPrefix);
			const newKey = !options?.prefixEndpointMethods
				? key
				: toCamelCase(newPath);

			const clonedEndpoint = cloneEndpoint(endpoint, newPath);

			prefixedEndpoints[newKey] = clonedEndpoint as AuthEndpoint;
		}

		aliasedPlugin.endpoints = prefixedEndpoints;
	}

	if (plugin.middlewares) {
		aliasedPlugin.middlewares = plugin.middlewares.map((middleware) => ({
			...middleware,
			path: options?.excludeEndpoints?.includes(middleware.path)
				? middleware.path
				: `${cleanPrefix}${middleware.path}`,
		}));
	}

	if (plugin.hooks) {
		aliasedPlugin.hooks = {
			before: plugin.hooks?.before?.map((hook) => ({
				...hook,
				matcher: updateMatcher({
					matcher: hook.matcher,
					prefix: cleanPrefix,
					excludeEndpoints: options?.excludeEndpoints,
				}),
			})),
			after: plugin.hooks?.after?.map((hook) => ({
				...hook,
				matcher: updateMatcher({
					matcher: hook.matcher,
					prefix: cleanPrefix,
					excludeEndpoints: options?.excludeEndpoints,
				}),
			})),
		};
	}

	if (plugin.rateLimit) {
		aliasedPlugin.rateLimit = plugin.rateLimit.map((rule) => ({
			...rule,
			pathMatcher: updateMatcher({
				matcher: rule.pathMatcher,
				prefix: cleanPrefix,
				excludeEndpoints: options?.excludeEndpoints,
			}),
		}));
	}

	Object.assign(aliasedPlugin, {
		compat: <
			Plugin extends BetterAuthPlugin,
			Option extends AliasCompatOptions,
		>(
			plugin: Plugin,
			options: Option,
		) =>
			aliasCompat(
				aliasedPlugin as InferAliasedPlugin_base<Prefix, T, O>,
				plugin,
				options,
			),
		"~meta": {
			prefix: cleanPrefix,
			options,
		},
	});

	return aliasedPlugin as InferAliasedPlugin<
		Prefix,
		T,
		O
	> satisfies BetterAuthPlugin;
}

export type AliasCompatOptions = {
	/**
	 * Additional endpoints that should be prefixed.
	 */
	includeEndpoints?: LiteralString[];
};

export function aliasCompat<
	const AliasedPlugin extends BetterAuthPlugin,
	T extends BetterAuthPlugin,
	O extends AliasCompatOptions,
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
	const compatPlugin: BetterAuthPlugin = {
		...plugin,
	};

	const includeEndpoints = new Set([
		...(options?.includeEndpoints || []),
		...(aliasOptions?.includeEndpoints || []),
		...Object.values(aliasedPlugin.endpoints || {})
			.map((endpoint): string => {
				// @ts-expect-error
				return endpoint.originalPath || endpoint.path;
			})
			.filter((path) => {
				return !aliasOptions?.excludeEndpoints?.includes(path) ? true : false;
			}),
	]);
	const includeEndpointsArr = [...includeEndpoints];

	if (plugin.middlewares) {
		compatPlugin.middlewares = plugin.middlewares.map((middleware) => ({
			...middleware,
			path: includeEndpoints.has(middleware.path)
				? `${prefix}${middleware.path}`
				: middleware.path,
		}));
	}

	if (plugin.hooks) {
		compatPlugin.hooks = {
			before: plugin.hooks?.before?.map((hook) => ({
				...hook,
				matcher: updateMatcher({
					matcher: hook.matcher,
					prefix,
					includeEndpoints: includeEndpointsArr,
				}),
			})),
			after: plugin.hooks?.after?.map((hook) => ({
				...hook,
				matcher: updateMatcher({
					matcher: hook.matcher,
					prefix,
					includeEndpoints: includeEndpointsArr,
				}),
			})),
		};
	}

	if (plugin.rateLimit) {
		compatPlugin.rateLimit = plugin.rateLimit.map((rule) => ({
			...rule,
			pathMatcher: updateMatcher({
				matcher: rule.pathMatcher,
				prefix,
				includeEndpoints: includeEndpointsArr,
			}),
		}));
	}

	return compatPlugin as InferAliasCompatPlugin<
		AliasedPlugin,
		T,
		O
	> satisfies BetterAuthPlugin;
}

function cloneEndpoint<
	T extends ((...args: any[]) => any) & Record<string, any>,
>(endpoint: T, path: string): Omit<AuthEndpoint, "wrap"> {
	const cloned = ((...args: Parameters<T>) => endpoint(...args)) as T &
		Record<string, any>;

	return Object.assign(cloned, {
		path,
		// Preserve original path
		originalPath: endpoint.originalPath || endpoint.path,
		options: endpoint.options,
	});
}

function resolveNewPath(originalPath: string, cleanPrefix: string) {
	for (const specialPrefix of SPECIAL_ENDPOINTS) {
		if (originalPath.startsWith(specialPrefix)) {
			const rest = originalPath.slice(specialPrefix.length).replace(/^\/+/, "");
			return `${normalizePath(specialPrefix)}${cleanPrefix}/${rest}`;
		}
	}

	return `${cleanPrefix}${originalPath}`;
}
