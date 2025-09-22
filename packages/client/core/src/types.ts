import type {
	BetterFetch,
	BetterFetchOption,
	BetterFetchPlugin,
} from "@better-fetch/fetch";
import type { Atom, WritableAtom } from "nanostores";
import type { InferRoutes } from "./path-to-object";
import type {
	User as CoreUser,
	Session as CoreSession,
	Prettify as CorePrettify,
	PrettifyDeep as CorePrettifyDeep,
	UnionToIntersection as CoreUnionToIntersection,
	StripEmptyObjects as CoreStripEmptyObjects,
	LiteralUnion as CoreLiteralUnion,
	HasRequiredKeys as CoreHasRequiredKeys,
	BASE_ERROR_CODES,
	InputContext as CoreInputContext,
	Endpoint as CoreEndpoint,
	StandardSchemaV1 as CoreStandardSchemaV1,
	EndpointOptions as CoreEndpointOptions,
} from "@better-auth/core";

// Re-export core types
export type Prettify<T> = CorePrettify<T>;
export type PrettifyDeep<T> = CorePrettifyDeep<T>;
export type LiteralUnion<T extends U, U = string> = CoreLiteralUnion<T, U>;
export type UnionToIntersection<U> = CoreUnionToIntersection<U>;
export type HasRequiredKeys<BaseType extends object> =
	CoreHasRequiredKeys<BaseType>;
export type StripEmptyObjects<T> = CoreStripEmptyObjects<T>;
export type InputContext<
	Path extends string = string,
	Input = any,
> = CoreInputContext<Path, Input>;
export type Endpoint<
	Path extends string = string,
	Handler extends (...args: any[]) => any = (...args: any[]) => any,
> = CoreEndpoint<Path, Handler>;
export type StandardSchemaV1<
	Input = unknown,
	Output = unknown,
> = CoreStandardSchemaV1<Input, Output>;
export type EndpointOptions = CoreEndpointOptions;
export { BASE_ERROR_CODES };

// Additional client-specific types
export type Primitive =
	| string
	| number
	| symbol
	| bigint
	| boolean
	| null
	| undefined;
export type LiteralString = "" | (string & Record<never, never>);
export type LiteralNumber = 0 | (number & Record<never, never>);

export type Awaitable<T> = Promise<T> | T;
export type OmitId<T extends { id: unknown }> = Omit<T, "id">;

export type PreserveJSDoc<T> = {
	[K in keyof T]: T[K];
} & {};

export type RequiredKeysOf<BaseType extends object> = Exclude<
	{
		[Key in keyof BaseType]: BaseType extends Record<Key, BaseType[Key]>
			? Key
			: never;
	}[keyof BaseType],
	undefined
>;

// Re-export User and Session from core
export type User = CoreUser;
export type Session = CoreSession;

// Client plugin types
export type AtomListener = {
	matcher: (path: string) => boolean;
	signal: "$sessionSignal" | Omit<string, "$sessionSignal">;
};

export interface Store {
	notify: (signal: string) => void;
	listen: (signal: string, listener: () => void) => void;
	atoms: Record<string, WritableAtom<any>>;
}

export interface BetterAuthClientPlugin {
	id: LiteralString;
	/**
	 * only used for type inference. don't pass the
	 * actual plugin
	 */
	$InferServerPlugin?: any; // We don't have BetterAuthPlugin here
	/**
	 * Custom actions
	 */
	getActions?: (
		$fetch: BetterFetch,
		$store: Store,
		/**
		 * better-auth client options
		 */
		options: ClientOptions | undefined,
	) => Record<string, any>;
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
	basePath?: string;
	disableDefaultFetchPlugins?: boolean;
	$InferAuth?: any; // We don't have BetterAuthOptions here
}

// Inference types
// This type will be properly resolved when the auth instance is passed
// It's kept as 'any' here to avoid circular dependencies
// The actual type resolution happens in the client creation
export type InferClientAPI<O extends ClientOptions> = any;

export type InferActions<O extends ClientOptions> = (O["plugins"] extends Array<
	infer Plugin
>
	? UnionToIntersection<
			Plugin extends BetterAuthClientPlugin
				? Plugin["getActions"] extends (...args: any) => infer Actions
					? Actions
					: {}
				: {}
		>
	: {}) &
	any;

export type InferErrorCodes<O extends ClientOptions> =
	O["plugins"] extends Array<infer Plugin>
		? UnionToIntersection<
				Plugin extends BetterAuthClientPlugin
					? Plugin["$InferServerPlugin"] extends { $ERROR_CODES: infer Codes }
						? Codes
						: {}
					: {}
			>
		: {};

/**
 * signals are just used to recall a computed value.
 * as a convention they start with "$"
 */
export type IsSignal<T> = T extends `$${infer _}` ? true : false;

export type InferPluginsFromClient<O extends ClientOptions> =
	O["plugins"] extends Array<BetterAuthClientPlugin>
		? Array<O["plugins"][number]["$InferServerPlugin"]>
		: undefined;

export type InferSessionFromClient<O extends ClientOptions> = StripEmptyObjects<
	Session & any // Additional fields will be added by plugins
>;

export type InferUserFromClient<O extends ClientOptions> = StripEmptyObjects<
	User & any // Additional fields will be added by plugins
>;

export type InferAdditionalFromClient<
	O extends ClientOptions,
	Entity extends string = string,
	Type extends "input" | "output" = "input",
> = O["$InferAuth"] extends any
	? O["$InferAuth"]["user"] extends Record<string, any>
		? O["$InferAuth"]["user"]["additionalFields"] extends Record<string, any>
			? O["$InferAuth"]["user"]["additionalFields"]
			: {}
		: {}
	: {};

export type SessionQueryParams = {
	disableCookieCache?: boolean;
	disableRefresh?: boolean;
};

// Re-export needed types from dependencies
export type * from "@better-fetch/fetch";
export type * from "nanostores";
