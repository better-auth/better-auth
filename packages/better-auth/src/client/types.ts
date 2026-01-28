import type {
	BetterAuthClientOptions,
	BetterAuthClientPlugin,
	ClientAtomListener,
	ClientStore,
} from "@better-auth/core";
import type { RawError } from "@better-auth/core/utils/error-codes";
import type {
	BetterAuthPluginDBSchema,
	InferFieldsInputClient,
	InferFieldsOutput,
} from "../db";
import type { Auth, Session, User } from "../types";
import type { StripEmptyObjects, UnionToIntersection } from "../types/helper";
import type { InferRoutes } from "./path-to-object";
export type {
	ClientStore,
	ClientAtomListener,
	BetterAuthClientOptions,
	BetterAuthClientPlugin,
};

export type InferClientAPI<O extends BetterAuthClientOptions> = InferRoutes<
	O["plugins"] extends Array<any>
		? Auth["api"] &
				(O["plugins"] extends Array<infer Pl>
					? UnionToIntersection<
							Pl extends {
								$InferServerPlugin: infer Plug;
							}
								? Plug extends {
										endpoints: infer Endpoints;
									}
									? Endpoints
									: {}
								: {}
						>
					: {})
		: Auth["api"],
	O
>;

export type InferActions<O extends BetterAuthClientOptions> =
	(O["plugins"] extends Array<infer Plugin>
		? UnionToIntersection<
				Plugin extends BetterAuthClientPlugin
					? Plugin["getActions"] extends (...args: any) => infer Actions
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
							endpoints: infer Endpoints;
						}
						? Endpoints
						: {}
					: {}
				: {},
			O
		>;

export type InferErrorCodes<O extends BetterAuthClientOptions> =
	O["plugins"] extends Array<infer Plugin>
		? UnionToIntersection<
				Plugin extends BetterAuthClientPlugin
					? Plugin["$InferServerPlugin"] extends { $ERROR_CODES: infer E }
						? {
								[K in keyof E & string]: E[K] extends RawError
									? RawError<K>
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
> = Options["plugins"] extends Array<infer Plugin>
	? Plugin extends BetterAuthClientPlugin
		? Plugin["$InferServerPlugin"] extends { schema: infer Schema }
			? Schema extends BetterAuthPluginDBSchema
				? Format extends "input"
					? InferFieldsInputClient<Schema[Key]["fields"]>
					: InferFieldsOutput<Schema[Key]["fields"]>
				: {}
			: {}
		: {}
	: {};

export type SessionQueryParams = {
	disableCookieCache?: boolean | undefined;
	disableRefresh?: boolean | undefined;
};
