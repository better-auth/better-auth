import type { BetterAuthClientPlugin } from "@better-auth/core";
import type { LiteralString } from "../../../types/helper";
import { getBaseURL } from "../../../utils/url";
import { resolveURL, toCamelCase, updateMatcher } from "../utils";
import { BetterAuthError } from "@better-auth/core/error";
import { capitalizeFirstLetter } from "../../../utils";
import type {
	InferAliasCompatClientPlugin,
	InferAliasedClientPlugin_base,
	InferClientMeta,
} from "../types/client";

export type AliasCompatClientOptions = {
	/**
	 * Additional endpoints that should be prefixed.
	 *
	 * Use this to define endpoints that should be prefixed
	 * and are not present in the plugin's pathMethods.
	 */
	includeEndpoints?: LiteralString[];
};

/**
 * Wraps a client plugin and selectively prefixes its endpoints with
 * a sub-path to preserve interoperability with an aliased plugin.
 *
 * @param aliasedPlugin - The aliased plugin indicating which parts need to be rewritten
 * @param plugin - The plugin to wrap
 * @param options - Additional configuration
 * @returns A new plugin that's compatible with the aliasedPlugin
 */
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
	} = aliasedPlugin["~meta"] as InferClientMeta<AliasedPlugin>;
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
				matcher: updateMatcher({
					matcher: listener.matcher,
					prefix,
					excludeEndpoints: aliasOptions?.excludeEndpoints,
				}),
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
			InferClientMeta<AliasedPlugin>["prefix"],
			AliasedPlugin,
			InferClientMeta<AliasedPlugin>["options"]
		>,
		T,
		O
	>;
}
