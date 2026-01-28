export interface Storage {
	getItem: (name: string) => unknown | null;
	setItem: (name: string, value: unknown) => void;
}

export interface ElectronClientOptions {
	/**
	 * The URL to redirect to for authentication.
	 *
	 * @example "http://localhost:3000/sign-in"
	 */
	signInURL: string | URL;
	/**
	 * The protocol scheme to use for deep linking in Electron.
	 *
	 * Should follow the reverse domain name notation to ensure uniqueness.
	 *
	 * @see {@link https://datatracker.ietf.org/doc/html/rfc8252#section-7.1}
	 * @example "com.example.app"
	 */
	protocol:
		| string
		| {
				scheme: string;
				privileges?: Electron.Privileges | undefined;
		  };
	/**
	 * The callback path to use for authentication redirects.
	 *
	 * @default "/auth/callback"
	 */
	callbackPath?: string;
	/**
	 * An instance of a storage solution (e.g., `electron-store`)
	 * to store session and cookie data.
	 *
	 * @example
	 * ```ts
	 * electronClient({
	 *   storage: window.localStorage,
	 * });
	 * ```
	 */
	storage: Storage;
	/**
	 * Prefix for local storage keys (e.g., "my-app_cookie", "my-app_session_data")
	 * @default "better-auth"
	 */
	storagePrefix?: string | undefined;
	/**
	 * Prefix(es) for server cookie names to filter (e.g., "better-auth.session_token")
	 * This is used to identify which cookies belong to better-auth to prevent
	 * infinite refetching when third-party cookies are set.
	 *
	 * Can be a single string or an array of strings to match multiple prefixes.
	 *
	 * @default "better-auth"
	 * @example "better-auth"
	 * @example ["better-auth", "my-app"]
	 */
	cookiePrefix?: string | string[] | undefined;
	/**
	 * Namespace for IPC bridges (e.g., "better-auth:request-auth")
	 *
	 * @default "better-auth"
	 */
	namespace?: string | undefined;
	/**
	 * Client ID to use for identifying the Electron client during authorization.
	 *
	 * @default "electron"
	 */
	clientID?: string | undefined;
	/**
	 * Whether to disable caching the session data locally.
	 *
	 * @default false
	 */
	disableCache?: boolean | undefined;
}

export interface ElectronProxyClientOptions {
	/**
	 * The protocol scheme to use for deep linking in Electron.
	 *
	 * Should follow the reverse domain name notation to ensure uniqueness.
	 *
	 * Note that this must match the protocol scheme registered in the server plugin.
	 *
	 * @see {@link https://datatracker.ietf.org/doc/html/rfc8252#section-7.1}
	 * @example "com.example.app"
	 */
	protocol:
		| string
		| {
				scheme: string;
		  };
	/**
	 * The callback path to use for authentication redirects.
	 *
	 * @default "/auth/callback"
	 */
	callbackPath?: string;
	/**
	 * Client ID to use for identifying the Electron client during authorization.
	 *
	 * @default "electron"
	 */
	clientID?: string | undefined;
	/**
	 * The prefix to use for cookies set by the plugin.
	 *
	 * @default "better-auth"
	 */
	cookiePrefix?: string | undefined;
}

export type { ElectronRequestAuthOptions } from "../authenticate";
