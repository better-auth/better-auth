import type {
	BetterFetch,
	BetterFetchOption,
	BetterFetchPlugin,
} from "@better-fetch/fetch";
import type { Atom, WritableAtom } from "nanostores";
import type { LiteralString } from "./helper";
import type { BetterAuthOptions } from "./init-options";
import type { BetterAuthPlugin } from "./plugin";

export interface ClientStore {
	notify: (signal: string) => void;
	listen: (signal: string, listener: () => void) => void;
	atoms: Record<string, WritableAtom<any>>;
}

export type ClientAtomListener = {
	matcher: (path: string) => boolean;
	signal: "$sessionSignal" | Omit<string, "$sessionSignal">;
};

/**
 * Better-Fetch options but with additional options for the auth-client.
 */
export type ClientFetchOption<
	Body = any,
	Query extends Record<string, any> = any,
	Params extends Record<string, any> | Array<string> | undefined = any,
	Res = any,
> = BetterFetchOption<Body, Query, Params, Res> & {
	/**
	 * Certain endpoints, upon successful response, will trigger atom signals and thus rerendering all hooks related to that atom.
	 *
	 * This option is useful when you want to skip hook rerenders.
	 */
	disableSignal?: boolean | undefined;
};

export interface RevalidateOptions {
	/**
	 * A time interval (in seconds) after which the session will be re-fetched.
	 * If set to `0` (default), the session is not polled.
	 *
	 * This helps prevent session expiry during idle periods by periodically
	 * refreshing the session.
	 *
	 * @default 0
	 */
	refetchInterval?: number | undefined;
	/**
	 * Automatically refetch the session when the user switches back to the window/tab.
	 * This option activates this behavior if set to `true` (default).
	 *
	 * Prevents expired sessions when users switch tabs and come back later.
	 *
	 * @default true
	 */
	refetchOnWindowFocus?: boolean | undefined;
	/**
	 * Set to `false` to stop polling when the device has no internet access
	 * (determined by `navigator.onLine`).
	 *
	 * @default false
	 * @see https://developer.mozilla.org/en-US/docs/Web/API/NavigatorOnLine/onLine
	 */
	refetchWhenOffline?: boolean | undefined;
}

export interface BetterAuthClientOptions {
	fetchOptions?: ClientFetchOption | undefined;
	plugins?: BetterAuthClientPlugin[] | undefined;
	baseURL?: string | undefined;
	basePath?: string | undefined;
	disableDefaultFetchPlugins?: boolean | undefined;
	$InferAuth?: BetterAuthOptions | undefined;
	sessionOptions?: RevalidateOptions | undefined;
}

export interface BetterAuthClientPlugin {
	id: LiteralString;
	/**
	 * only used for type inference. don't pass the
	 * actual plugin
	 */
	$InferServerPlugin?: BetterAuthPlugin | undefined;
	/**
	 * Custom actions
	 */
	getActions?: (
		$fetch: BetterFetch,
		$store: ClientStore,
		/**
		 * better-auth client options
		 */
		options: BetterAuthClientOptions | undefined,
	) => Record<string, any>;
	/**
	 * State atoms that'll be resolved by each framework
	 * auth store.
	 */
	getAtoms?: (($fetch: BetterFetch) => Record<string, Atom<any>>) | undefined;
	/**
	 * specify path methods for server plugin inferred
	 * endpoints to force a specific method.
	 */
	pathMethods?: Record<string, "POST" | "GET"> | undefined;
	/**
	 * Better fetch plugins
	 */
	fetchPlugins?: BetterFetchPlugin[] | undefined;
	/**
	 * a list of recaller based on a matcher function.
	 * The signal name needs to match a signal in this
	 * plugin or any plugin the user might have added.
	 */
	atomListeners?: ClientAtomListener[] | undefined;
}
