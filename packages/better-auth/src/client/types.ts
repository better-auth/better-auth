import type {
	BetterFetch,
	BetterFetchOption,
	BetterFetchPlugin,
} from "@better-fetch/fetch";
import type { BetterAuthPlugin } from "../types/plugins";
import type { Atom } from "nanostores";
import type {
	LiteralString,
	StripEmptyObjects,
	UnionToIntersection,
} from "../types/helper";
import type { Auth } from "../auth";
import type { InferRoutes } from "./path-to-object";
import type { Session, User } from "../types";
import type { InferFieldsInputClient, InferFieldsOutput } from "../db";

export type AtomListener = {
	matcher: (path: string) => boolean;
	signal: "_sessionSignal" | Omit<string, "_sessionSignal">;
};

export interface BetterAuthClientPlugin {
	id: LiteralString;
	/**
	 * only used for type inference. don't pass the
	 * actual plugin
	 */
	$InferServerPlugin?: BetterAuthPlugin;
	/**
	 * Custom actions
	 */
	getActions?: ($fetch: BetterFetch) => Record<string, any>;
	/**
	 * State atoms that'll be resolved by each framework
	 * auth store.
	 */
	getAtoms?: ($fetch: BetterFetch) => Record<string, Atom<any>>;
	/**
	 * specify path methods for server plugin inferred
	 * endpoints to force a specific method.
	 */
	pathMethods?: Record<string, "POST" | "GET">;
	/**
	 * Better fetch plugins
	 */
	fetchPlugins?: BetterFetchPlugin[];
	/**
	 * a list of recaller based on a matcher function.
	 * The signal name needs to match a signal in this
	 * plugin or any plugin the user might have added.
	 */
	atomListeners?: AtomListener[];
}

export interface ClientOptions {
	fetchOptions?: BetterFetchOption;
	plugins?: BetterAuthClientPlugin[];
	baseURL?: string;
	disableCSRFTokenCheck?: boolean;
	disableDefaultFetchPlugins?: boolean;
}

export type InferClientAPI<O extends ClientOptions> = InferRoutes<
	O["plugins"] extends Array<any>
		? (O["plugins"] extends Array<infer Pl>
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
				: {}) &
				Auth["api"]
		: Auth["api"],
	O
>;

export type InferActions<O extends ClientOptions> = O["plugins"] extends Array<
	infer Plugin
>
	? UnionToIntersection<
			Plugin extends BetterAuthClientPlugin
				? Plugin["getActions"] extends ($fetch: BetterFetch) => infer Actions
					? Actions
					: {}
				: {}
		>
	: {};
/**
 * signals are just used to recall a computed value.
 * as a convention they start with "_"
 */
export type IsSignal<T> = T extends `_${infer _}` ? true : false;

export type InferPluginsFromClient<O extends ClientOptions> =
	O["plugins"] extends Array<BetterAuthClientPlugin>
		? Array<O["plugins"][number]["$InferServerPlugin"]>
		: undefined;

export type InferSessionFromClient<O extends ClientOptions> = StripEmptyObjects<
	Session &
		UnionToIntersection<InferAdditionalFromClient<O, "session", "output">>
>;
export type InferUserFromClient<O extends ClientOptions> = StripEmptyObjects<
	User & UnionToIntersection<InferAdditionalFromClient<O, "user", "output">>
>;

export type InferAdditionalFromClient<
	Options extends ClientOptions,
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
