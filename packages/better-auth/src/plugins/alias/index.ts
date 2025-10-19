import type { AuthEndpoint } from "../../api";
import type { Endpoint } from "better-call";
import type { LiteralString } from "../../types/helper";
import type { BetterAuthPlugin } from "@better-auth/core";
import type {
	CamelCasePrefix,
	MatchesExcluded,
	NormalizePrefix,
	TransformEndpointKey,
} from "./types";
import {
	SPECIAL_ENDPOINTS,
	toCamelCase,
	normalizePrefix,
	type SpecialEndpoints,
	normalizePath,
} from "./utils";

export type InferAliasedPlugin<
	T extends BetterAuthPlugin,
	Prefix extends string,
	O extends AliasOptions,
	IsClient extends boolean = false,
> = Omit<T, "endpoints" | "$Infer"> & {
	endpoints: {
		[K in keyof T["endpoints"] &
			string as O["prefixEndpointMethods"] extends true
			? TransformEndpointKey<K, Prefix>
			: K]: IsClient extends false
			? T["endpoints"][K]
			: T["endpoints"][K] extends Endpoint<
						infer OldPath,
						infer Options,
						infer Handler
					>
				? Handler extends (...args: infer Args) => infer Return
					? ((...args: Args) => Return) & {
							options: Options;
							path: MatchesExcluded<OldPath, O["excludeEndpoints"]> extends true
								? OldPath
								: OldPath extends `${NormalizePrefix<SpecialEndpoints>}/${infer R}`
									? OldPath extends `${infer S}/${R}`
										? `${S}${NormalizePrefix<Prefix>}${NormalizePrefix<R>}`
										: `${NormalizePrefix<Prefix>}${OldPath}`
									: `${NormalizePrefix<Prefix>}${OldPath}`;
						}
					: T
				: T["endpoints"][K];
	};
} & (T extends { $Infer: infer I extends Record<string, any> }
		? {
				$Infer: O["prefixTypeInference"] extends true
					? {
							[K in keyof I &
								string as `${Capitalize<CamelCasePrefix<Prefix>>}${K}`]: I[K];
						}
					: I;
			}
		: {
				$Infer: undefined;
			});

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
	excludeEndpoints?: string[];
};

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
		const updateMatcher = (matcher: (context: any) => boolean) => {
			return (context: any) => {
				if (context.path && context.path.startsWith(cleanPrefix)) {
					const originalPath = context.path.slice(cleanPrefix.length);
					const modifiedContext = { ...context, path: originalPath };
					return matcher(modifiedContext);
				}
				return false;
			};
		};
		aliasedPlugin.hooks = {
			before: plugin.hooks?.before?.map((hook) => ({
				...hook,
				matcher: updateMatcher(hook.matcher),
			})),
			after: plugin.hooks?.after?.map((hook) => ({
				...hook,
				matcher: updateMatcher(hook.matcher),
			})),
		};
	}

	if (plugin.rateLimit) {
		aliasedPlugin.rateLimit = plugin.rateLimit.map((rule) => ({
			...rule,
			pathMatcher: (path: string) => {
				if (path.startsWith(cleanPrefix)) {
					const originalPath = path.slice(cleanPrefix.length);
					return rule.pathMatcher(originalPath);
				}
				return false;
			},
		}));
	}

	return aliasedPlugin as InferAliasedPlugin<T, Prefix, O>;
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
