import type { AuthEndpoint } from "../../api";
import type { Endpoint } from "better-call";
import type { LiteralString } from "../../types/helper";
import type { BetterAuthPlugin } from "../../types";
import type {
	NormalizePrefix,
	TransformEndpointKey,
	TrimLeadingChar,
} from "./types";

export type InferAliasedPlugin<
	T extends BetterAuthPlugin,
	Prefix extends string,
	O extends AliasOptions,
	IsClient extends true | false = false,
> = Omit<T, "endpoints"> & {
	endpoints: {
		[K in keyof T["endpoints"] &
			string as O["unstable_prefixEndpointMethods"] extends true
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
							path: OldPath extends `/sign-in/${string}` | `/sign-up/${string}`
								? `${OldPath}-${TrimLeadingChar<NormalizePrefix<Prefix>, "/">}`
								: `${NormalizePrefix<Prefix>}${OldPath}`;
						}
					: T
				: T["endpoints"][K];
	};
};

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
	unstable_prefixEndpointMethods?: boolean;
};

const SPECIAL_ENDPOINTS = ["/sign-in/", "/sign-up/"] as const;

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
			const newPath = resolveNewPath(originalPath, cleanPrefix);
			const newKey = !options?.unstable_prefixEndpointMethods
				? key
				: newPath
						.replace(/[-_/](.)?/g, (_, c) => (c ? c.toUpperCase() : ""))
						.replace(/^[A-Z]/, (match) => match.toLowerCase());

			const clonedEndpoint = Object.assign(
				Object.create(Object.getPrototypeOf(endpoint)),
				endpoint,
			);
			clonedEndpoint.path = newPath;

			prefixedEndpoints[newKey] = clonedEndpoint;
			prefixedEndpoints.originalKey = key;
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

	return aliasedPlugin as InferAliasedPlugin<T, Prefix, O>;
}

function resolveNewPath(originalPath: string, cleanPrefix: string) {
	for (const specialPrefix of SPECIAL_ENDPOINTS) {
		if (originalPath.startsWith(specialPrefix)) {
			const rest = originalPath.slice(specialPrefix.length);
			return `${specialPrefix.replace(/\/$/, "")}${cleanPrefix}/${rest}`;
		}
	}

	return `${cleanPrefix}${originalPath}`;
}
