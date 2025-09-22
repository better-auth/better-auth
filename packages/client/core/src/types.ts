import type {
	BetterFetch,
	BetterFetchOption,
	BetterFetchPlugin,
} from "@better-fetch/fetch";
import type { Atom, WritableAtom } from "nanostores";

// Helper types copied from better-auth to avoid circular dependency
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

export type Prettify<T> = Omit<T, never>;
export type PreserveJSDoc<T> = {
	[K in keyof T]: T[K];
} & {};
export type PrettifyDeep<T> = {
	[K in keyof T]: T[K] extends (...args: any[]) => any
		? T[K]
		: T[K] extends object
			? T[K] extends Array<any>
				? T[K]
				: T[K] extends Date
					? T[K]
					: PrettifyDeep<T[K]>
			: T[K];
} & {};
export type LiteralUnion<LiteralType, BaseType extends Primitive> =
	| LiteralType
	| (BaseType & Record<never, never>);

export type UnionToIntersection<U> = (
	U extends any
		? (k: U) => void
		: never
) extends (k: infer I) => void
	? I
	: never;

export type RequiredKeysOf<BaseType extends object> = Exclude<
	{
		[Key in keyof BaseType]: BaseType extends Record<Key, BaseType[Key]>
			? Key
			: never;
	}[keyof BaseType],
	undefined
>;

export type HasRequiredKeys<BaseType extends object> =
	RequiredKeysOf<BaseType> extends never ? false : true;
export type WithoutEmpty<T> = T extends T ? ({} extends T ? never : T) : never;

export type StripEmptyObjects<T> = T extends { [K in keyof T]: never }
	? never
	: T extends object
		? { [K in keyof T as T[K] extends never ? never : K]: T[K] }
		: T;
export type DeepPartial<T> = T extends Function
	? T
	: T extends object
		? { [K in keyof T]?: DeepPartial<T[K]> }
		: T;
export type Expand<T> = T extends infer O ? { [K in keyof O]: O[K] } : never;

// Base error codes copied from better-auth
export const BASE_ERROR_CODES = {
	INVALID_EMAIL_OR_PASSWORD: "Invalid email or password",
	INVALID_PASSWORD: "Invalid password",
	USER_NOT_FOUND: "User not found",
	FAILED_TO_CREATE_USER: "Failed to create user",
	REQUEST_LIMIT_EXCEEDED: "Too many requests. Please try again later",
	INVALID_EMAIL: "Invalid email",
	EMAIL_ALREADY_IN_USE: "Email already in use",
	PASSWORD_TOO_SHORT: "Password must be at least 8 characters",
	PASSWORD_TOO_LONG: "Password must be at most 256 characters",
	INVALID_SESSION: "Invalid session",
	CREDENTIAL_ACCOUNT_NOT_FOUND: "Credential account not found",
	INVALID_CREDENTIALS: "Invalid credentials",
	SESSION_NOT_FOUND: "Session not found",
	MULTIPLE_CREDENTIALS_ACCOUNT: "Multiple credentials account",
	INVALID_CODE: "Invalid code",
	UNABLE_TO_VERIFY_EMAIL: "Unable to verify email. Invalid code",
	USER_ALREADY_EXISTS: "User already exists",
	ACCESS_DENIED: "Access denied",
	FORBIDDEN: "Forbidden",
	SOCIAL_ACCOUNT_ALREADY_LINKED: "Social account already linked",
	PROVIDER_NOT_FOUND: "Provider not found",
	INVALID_TOKEN: "Invalid token",
	SOCIAL_LOGIN_FAILED: "Social login failed",
	SIGN_UP_DISABLED: "Sign up is disabled",
	INVALID_FIELDS: "Invalid fields",
	NOT_FOUND: "Not found",
	METHOD_NOT_ALLOWED: "Method not allowed",
} as const;

// Core types for better-auth client
export type Session = {
	id: string;
	userId: string;
	expiresAt: Date;
	ipAddress?: string;
	userAgent?: string;
};

export type User = {
	id: string;
	email: string;
	emailVerified: boolean;
	name: string;
	image?: string | null;
	createdAt: Date;
	updatedAt: Date;
};

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
export type InferClientAPI<O extends ClientOptions> = any; // This will be properly typed in the main package

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

export type SessionQueryParams = {
	disableCookieCache?: boolean;
	disableRefresh?: boolean;
};

// Re-export needed types from dependencies
export type * from "@better-fetch/fetch";
export type * from "nanostores";
