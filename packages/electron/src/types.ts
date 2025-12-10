export interface ElectronClientOptions {
	redirectURL: string;
	/**
	 * The protocol scheme to use for deep linking in Electron.
	 *
	 * Should follow the reverse domain name notation to ensure uniqueness.
	 *
	 * @see https://datatracker.ietf.org/doc/html/rfc8252#section-7.1
	 * @example "com.example.app"
	 */
	protocol: {
		scheme: string;
		privileges?: Electron.Privileges | undefined;
	};
	/**
	 * The callback path to use for authentication redirects.
	 *
	 * @default "/auth/callback"
	 */
	callbackPath?: string;
	storage: Storage;
	/**
	 * @default "better-auth"
	 */
	storagePrefix?: string | undefined;
	/**
	 * @default "better-auth"
	 */
	cookiePrefix?: string | undefined;
	/**
	 * Namespace for registered handlers.
	 *
	 * @default "auth"
	 */
	namespace?: string | undefined;
	disableCache?: boolean | undefined;
}

export interface Storage {
	get: (name: string) => string | Buffer | null;
	set: (name: string, value: string | Buffer) => void;
}
