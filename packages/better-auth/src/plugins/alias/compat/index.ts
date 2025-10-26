import type { BetterAuthPlugin } from "@better-auth/core";
import { BetterAuthError } from "@better-auth/core/error";
import type { LiteralString } from "../../../types/helper";
import type { InferAliasCompatPlugin, InferMeta } from "../types/plugin";
import { updateMatcher } from "../utils";

export type AliasCompatOptions = {
	/**
	 * Additional endpoints that should be prefixed.
	 */
	includeEndpoints?: LiteralString[];
};

/**
 * Wraps a plugin and selectively prefixes its endpoints with
 * a sub-path to preserve interoperability with an aliased plugin.
 *
 * @param aliasedPlugin - The aliased plugin indicating which parts need to be rewritten
 * @param plugin - The plugin to wrap
 * @param options - Additional configuration
 * @returns A new plugin that's compatible with the aliasedPlugin
 */
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

	// Wrap middlewares to prefix paths
	if (plugin.middlewares) {
		compatPlugin.middlewares = plugin.middlewares.map((middleware) => ({
			...middleware,
			path: includeEndpoints.has(middleware.path)
				? `${prefix}${middleware.path}`
				: middleware.path,
		}));
	}

	// Wrap hook matchers to prefix paths
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

	// Update rate-limit rules to match prefixed paths
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
