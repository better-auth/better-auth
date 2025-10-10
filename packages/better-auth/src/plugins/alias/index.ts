import type { BetterAuthPlugin } from "packages/core/dist";
import type { AuthEndpoint } from "../../api";

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
export function alias<T extends BetterAuthPlugin>(
	prefix: string,
	plugin: T,
): T {
	const normalizedPrefix = prefix.startsWith("/") ? prefix : `/${prefix}`;
	const cleanPrefix = normalizedPrefix.endsWith("/")
		? normalizedPrefix.slice(0, -1)
		: normalizedPrefix;
	const aliasedPlugin: BetterAuthPlugin = {
		...plugin,
	};
	if (plugin.endpoints) {
		const prefixedEndpoints: Record<string, AuthEndpoint> = {};

		for (const [key, endpoint] of Object.entries(plugin.endpoints)) {
			const originalPath = endpoint.path || `/${key}`;
			const newPath = `${cleanPrefix}${originalPath}`;

			const clonedEndpoint = Object.assign(
				Object.create(Object.getPrototypeOf(endpoint)),
				endpoint,
			);
			clonedEndpoint.path = newPath;

			prefixedEndpoints[key] = clonedEndpoint;
		}

		aliasedPlugin.endpoints = prefixedEndpoints;
	}

	if (plugin.middlewares) {
		aliasedPlugin.middlewares = plugin.middlewares.map((middleware) => ({
			...middleware,
			path: `${cleanPrefix}${middleware.path}`,
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
			after: plugin.hooks.after?.map((hook) => ({
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

	return aliasedPlugin as T;
}
