import type {
	BetterAuthClientOptions,
	BetterAuthClientPlugin,
	ClientAtomListener,
	ClientStore,
} from "@better-auth/core";
import type { InferFieldsInputClient, InferFieldsOutput } from "../db";
import type { Auth, Session, User } from "../types";
import type { StripEmptyObjects, UnionToIntersection } from "../types/helper";
import type { InferRoutes } from "./path-to-object";
export type {
	ClientStore,
	ClientAtomListener,
	BetterAuthClientOptions,
	BetterAuthClientPlugin,
};

/**
 * @deprecated use type `ClientStore` instead.
 */
export type Store = ClientStore;
/**
 * @deprecated use type `ClientAtomListener` instead.
 */
export type AtomListener = ClientAtomListener;
/**
 * @deprecated use type `BetterAuthClientOptions` instead.
 */
export type ClientOptions = BetterAuthClientOptions;

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
						? E extends Record<string, string>
							? E
							: {}
						: {}
					: {}
			>
		: {};
/**
 * signals are just used to recall a computed value.
 * as a convention they start with "$"
 */
export type IsSignal<T> = T extends `$${infer _}` ? true : false;

export type InferPluginsFromClient<O extends BetterAuthClientOptions> =
	O["plugins"] extends Array<BetterAuthClientPlugin>
		? Array<O["plugins"][number]["$InferServerPlugin"]>
		: undefined;

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
> = Options["plugins"] extends Array<infer T>
	? T extends BetterAuthClientPlugin
		? T["$InferServerPlugin"] extends {
				schema: {
					[key in Key]: {
						fields: infer Field;
					};
				};
			}
			? Format extends "input"
				? InferFieldsInputClient<Field>
				: InferFieldsOutput<Field>
			: {}
		: {}
	: {};

export type SessionQueryParams = {
	disableCookieCache?: boolean | undefined;
	disableRefresh?: boolean | undefined;
};
