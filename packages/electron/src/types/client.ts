import type { Awaitable } from "@better-auth/core";
import type { ElectronSharedOptions } from "./options";

export interface Storage {
	getItem: (name: string) => unknown | null;
	setItem: (name: string, value: unknown) => void;
}

export interface ElectronSharedClientOptions extends ElectronSharedOptions {
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
		  };
	/**
	 * The callback path to use for authentication redirects.
	 *
	 * @default "/auth/callback"
	 */
	callbackPath?: string;
}

export interface ElectronClientOptions extends ElectronSharedClientOptions {
	/**
	 * The URL to redirect to for authentication.
	 *
	 * @example "http://localhost:3000/sign-in"
	 */
	signInURL: string | URL;
	protocol:
		| string
		| {
				scheme: string;
				privileges?: Electron.Privileges | undefined;
		  };
	/**
	 * An instance of a storage solution (e.g., `conf`)
	 * to store session and cookie data.
	 *
	 * @example
	 * ```ts
	 * import { storage } from "@better-auth/electron/storage";
	 * electronClient({
	 *   storage: storage(),
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
	 * User image proxy configuration.
	 */
	userImageProxy?:
		| {
				/**
				 * Whether to enable user image proxy.
				 *
				 * @default true
				 */
				enabled?: boolean | undefined;
				/**
				 * The protocol scheme to use for user image proxy.
				 *
				 * @default "user-image"
				 */
				scheme?: string | undefined;
				/**
				 * The maximum size of user images in bytes.
				 *
				 * @default 1024 * 1024 * 5 (5MB)
				 */
				maxSize?: number | undefined;
				/**
				 * Allowed image mime types that should be passed to Accept header.
				 *
				 * @default "image/*"
				 */
				accept?: string | undefined;
				/**
				 * Custom user image validator.
				 *
				 * Note: This will override the default validator, and can have security implications if not handled properly.
				 * Only use this if you know what you are doing.
				 *
				 * @param bytes The user image bytes.
				 * @returns The image mime type or null if the image is not valid.
				 */
				customValidator?: (bytes: Uint8Array) => Awaitable<string | null>;
		  }
		| undefined;
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
	 * Channel prefix for IPC bridges (e.g., "better-auth:request-auth")
	 *
	 * @default "better-auth"
	 */
	channelPrefix?: string | undefined;
	/**
	 * Whether to disable caching the session data locally.
	 *
	 * @default false
	 */
	disableCache?: boolean | undefined;
}

export interface ElectronProxyClientOptions
	extends ElectronSharedClientOptions {
	/**
	 * The prefix to use for cookies set by the plugin.
	 *
	 * @default "better-auth"
	 */
	cookiePrefix?: string | undefined;
}

export type { ElectronRequestAuthOptions } from "../authenticate";
export type { ElectronSharedOptions };
