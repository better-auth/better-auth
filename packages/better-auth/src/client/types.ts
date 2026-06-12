import type {
	BetterAuthClientOptions,
	BetterAuthClientPlugin,
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

type InferPluginEndpoints<Plugins> =
	Plugins extends Array<infer Pl>
		? UnionToIntersection<
				Pl extends {
					$InferServerPlugin?: infer Plug;
				}
					? Plug extends {
							endpoints?: infer Endpoints;
						}
						? Endpoints extends Record<string, unknown>
							? Endpoints
							: {}
						: {}
					: {}
			>
		: {};

export type InferClientAPI<O extends BetterAuthClientOptions> = InferRoutes<
	O["plugins"] extends Array<any>
		? Omit<Auth["api"], keyof InferPluginEndpoints<O["plugins"]>> &
				InferPluginEndpoints<O["plugins"]>
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
		//infer routes from auth config
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
