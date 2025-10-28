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
	refetchInterval?: number;
	/**
	 * Automatically refetch the session when the user switches back to the window/tab.
	 * This option activates this behavior if set to `true` (default).
	 *
	 * Prevents expired sessions when users switch tabs and come back later.
	 *
	 * @default true
	 */
	refetchOnWindowFocus?: boolean;
	/**
	 * Set to `false` to stop polling when the device has no internet access
	 * (determined by `navigator.onLine`).
	 *
	 * @default false
	 * @see https://developer.mozilla.org/en-US/docs/Web/API/NavigatorOnLine/onLine
	 */
	refetchWhenOffline?: boolean;
}

export interface BetterAuthClientOptions {
	fetchOptions?: BetterFetchOption;
	plugins?: BetterAuthClientPlugin[];
	baseURL?: string;
	basePath?: string;
	disableDefaultFetchPlugins?: boolean;
	$InferAuth?: BetterAuthOptions;
	sessionOptions?: RevalidateOptions;
}

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
	atomListeners?: ClientAtomListener[];
}
