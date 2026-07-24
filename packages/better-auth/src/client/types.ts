import type {
	BetterAuthClientOptions,
	BetterAuthClientPlugin,
	BetterAuthOptions,
	BetterAuthPluginRegistry,
	BetterAuthPluginRegistryIdentifier,
	ClientAtomListener,
	ClientStore,
} from "@better-auth/core";
import type {
	DBFieldAttribute,
	InferDBFieldsOutput,
} from "@better-auth/core/db";
import type { InferFieldsInputClient } from "../db/field";
import type { Auth, Session, User } from "../types";
import type { StripEmptyObjects, UnionToIntersection } from "../types/helper";
import type { InferRoutes } from "./path-to-object";
export type {
	ClientStore,
	ClientAtomListener,
	BetterAuthClientOptions,
	BetterAuthClientPlugin,
};

type ClientPluginError<K extends string = string> = {
	readonly code: K;
	message: string;
};

type StaticServerPluginEndpoints<Plug> = Plug extends {
	endpoints?: infer Endpoints;
}
	? Endpoints extends Record<string, unknown>
		? Endpoints
		: {}
	: {};

/**
 * Prefer an explicit `$InferAuth` (auth instance or options). Otherwise synthesize
 * enough auth options from client plugins (e.g. `inferAdditionalFields<typeof auth>()`)
 * so registry `resolvedEndpoints` can rebuild endpoint return types.
 */
type InferAuthOptionsForClient<O extends BetterAuthClientOptions> = O extends {
	$InferAuth: infer A;
}
	? A extends { options: infer Opt extends BetterAuthOptions }
		? Opt
		: A extends BetterAuthOptions
			? A
			: SynthesizeAuthOptionsFromClientPlugins<O>
	: SynthesizeAuthOptionsFromClientPlugins<O>;

type MergedUserFieldsFromClientPlugins<Plugins> =
	Plugins extends Array<infer Pl>
		? UnionToIntersection<
				Pl extends {
					$InferServerPlugin?: {
						schema?: {
							user?: {
								fields?: infer F;
							};
						};
					};
				}
					? F extends Record<string, unknown>
						? F
						: {}
					: {}
			>
		: {};

type SynthesizeAuthOptionsFromClientPlugins<O extends BetterAuthClientOptions> =
	{
		user: {
			additionalFields: MergedUserFieldsFromClientPlugins<O["plugins"]>;
		};
	};

type ResolvedClientPluginEndpoints<
	O extends BetterAuthClientOptions,
	Pl,
> = Pl extends {
	$InferServerPlugin?: infer Plug;
}
	? Plug extends {
			id: infer ID extends BetterAuthPluginRegistryIdentifier;
		}
		? BetterAuthPluginRegistry<
				InferAuthOptionsForClient<O>,
				Plug extends { options: infer PO } ? PO : never
			>[ID] extends { resolvedEndpoints: infer R }
			? [R] extends [never]
				? StaticServerPluginEndpoints<Plug>
				: R
			: StaticServerPluginEndpoints<Plug>
		: StaticServerPluginEndpoints<Plug>
	: {};

type InferPluginEndpoints<O extends BetterAuthClientOptions> =
	O["plugins"] extends Array<infer Pl>
		? UnionToIntersection<ResolvedClientPluginEndpoints<O, Pl>>
		: {};

export type InferClientAPI<O extends BetterAuthClientOptions> = InferRoutes<
	O["plugins"] extends Array<any>
		? Omit<Auth["api"], keyof InferPluginEndpoints<O>> & InferPluginEndpoints<O>
		: Auth["api"],
	O
>;

export type InferActions<O extends BetterAuthClientOptions> =
	(O["plugins"] extends Array<infer Plugin>
		? UnionToIntersection<
				Plugin extends {
					getActions?: infer GetActions;
				}
					? GetActions extends (...args: any) => infer Actions
						? Actions
						: {}
					: {}
			>
		: {}) &
		// Infer routes from `$InferAuth` only when it exposes top-level `plugins`
		// (raw options). Auth instances use InferClientAPI + client plugins instead;
		// resolving both would intersect duplicate generic methods into `any`.
		InferRoutes<
			O["$InferAuth"] extends {
				plugins: infer Plugins;
			}
				? Plugins extends Array<infer Plugin>
					? Plugin extends {
							endpoints?: infer Endpoints;
						}
						? Endpoints extends Record<string, unknown>
							? Endpoints
							: {}
						: {}
					: {}
				: {},
			O
		>;

export type InferErrorCodes<O extends BetterAuthClientOptions> =
	O["plugins"] extends Array<infer Plugin>
		? UnionToIntersection<
				Plugin extends {
					$InferServerPlugin?: infer ServerPlugin;
				}
					? ServerPlugin extends { $ERROR_CODES?: infer E }
						? {
								[K in keyof E & string]: E[K] extends ClientPluginError
									? ClientPluginError<K>
									: never;
							}
						: {}
					: {}
			>
		: {};
/**
 * signals are just used to recall a computed value.
 * as a convention they start with "$"
 */
export type IsSignal<T> = T extends `$${infer _}` ? true : false;

export type InferSessionFromClient<O extends BetterAuthClientOptions> =
	StripEmptyObjects<
		Session &
			UnionToIntersection<InferAdditionalFromClient<O, "session", "output">>
	>;
export type InferUserFromClient<O extends BetterAuthClientOptions> =
	StripEmptyObjects<
		User & UnionToIntersection<InferAdditionalFromClient<O, "user", "output">>
	>;

export type InferAdditionalFromClient<
	Options extends BetterAuthClientOptions,
	Key extends string,
	Format extends "input" | "output" = "output",
> =
	Options["plugins"] extends Array<infer Plugin>
		? Plugin extends {
				$InferServerPlugin?: infer ServerPlugin;
			}
			? ServerPlugin extends { schema?: infer Schema }
				? Schema extends Record<Key, { fields: infer Fields }>
					? Fields extends Record<string, DBFieldAttribute>
						? Format extends "input"
							? InferFieldsInputClient<Fields>
							: InferDBFieldsOutput<Fields>
						: {}
					: {}
				: {}
			: {}
		: {};

export type SessionQueryParams = {
	disableCookieCache?: boolean | undefined;
	disableRefresh?: boolean | undefined;
};
