import type { AuthEndpoint } from "../../api";
import type { LiteralString } from "../../types/helper";
import type { BetterAuthPlugin } from "@better-auth/core";
import type {
	InferAliasedPlugin,
	InferAliasedPlugin_base,
} from "./types/plugin";
import {
	SPECIAL_ENDPOINTS,
	toCamelCase,
	normalizePrefix,
	normalizePath,
	updateMatcher,
	cloneEndpoint,
} from "./utils";
import type { AliasCompatOptions } from "./compat/index";
import { aliasCompat } from "./compat/index";

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
	/**
	 * Whether to prefix the plugin's id.
	 *
	 * Set this to true when aliasing the same plugin multiple times.
	 *
	 * @default false
	 */
	modifyId?: boolean;
};

/**
 * Wraps a plugin and prefixes all its endpoints with a sub-path
 * to avoid conflicts between plugins with similar endpoint paths.
 *
 * @param prefix - The sub-path to prefix all plugin endpoints with (e.g., "/polar", "/dodo")
 * @param plugin - The plugin to wrap
 * @param options - Additional configuration
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
	if (options?.modifyId) {
		aliasedPlugin.id = `${plugin.id}-${cleanPrefix.replace(/\//g, "-")}`;
	}
	// Wrap endpoints to prefix paths and keys
	if (plugin.endpoints) {
		const prefixedEndpoints: Record<string, AuthEndpoint> = {};

		for (const [key, endpoint] of Object.entries(plugin.endpoints)) {
			const originalPath = endpoint.path || `/${key}`;
			// Skip endpoints explicitly excluded from prefixing
			const newPath = options?.excludeEndpoints?.includes(originalPath)
				? originalPath
				: resolveNewPath(originalPath, cleanPrefix);
			const newKey = !options?.prefixEndpointMethods
				? key
				: toCamelCase(newPath);

			// Clone endpoint to avoid mutating shared references
			const clonedEndpoint = cloneEndpoint(endpoint, newPath);

			prefixedEndpoints[newKey] = clonedEndpoint as AuthEndpoint;
		}

		aliasedPlugin.endpoints = prefixedEndpoints;
	}

	// Wrap middlewares to prefix paths
	if (plugin.middlewares) {
		aliasedPlugin.middlewares = plugin.middlewares.map((middleware) => ({
			...middleware,
			path: options?.excludeEndpoints?.includes(middleware.path)
				? middleware.path
				: `${cleanPrefix}${middleware.path}`,
		}));
	}

	// Wrap hook matchers to prefix paths
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

	// Update rate-limit rules to match prefixed paths
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
		// Add compat helper to wrap other plugins for interop
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
		// store data for internal usage
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

function resolveNewPath(originalPath: string, cleanPrefix: string) {
	for (const specialPrefix of SPECIAL_ENDPOINTS) {
		if (originalPath.startsWith(specialPrefix)) {
			const rest = originalPath.slice(specialPrefix.length).replace(/^\/+/, "");
			return `${normalizePath(specialPrefix)}${cleanPrefix}/${rest}`;
		}
	}

	return `${cleanPrefix}${originalPath}`;
}

export * from "./compat/index";
export type * from "./types";
