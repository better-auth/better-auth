export interface ElectronSharedOptions {
	/**
	 * Client ID to use for identifying the Electron client during authorization.
	 *
	 * @default "electron"
	 */
	clientID?: string | undefined;
}

export interface ElectronOptions extends ElectronSharedOptions {
	/**
	 * The duration (in seconds) for which the authorization code remains valid.
	 *
	 * @default 300 (5 minutes)
	 */
	codeExpiresIn?: number | undefined;
	/**
	 * The duration (in seconds) for which the redirect cookie remains valid.
	 *
	 * @default 120 (2 minutes)
	 */
	redirectCookieExpiresIn?: number | undefined;
	/**
	 * The namespace to use for cookies set by the plugin.
	 *
	 * @default "better-auth"
	 */
	cookieNamespace?: string | undefined;
	/**
	 * @deprecated Use `cookieNamespace`.
	 * This option will be removed in a future minor release.
	 */
	cookiePrefix?: string | undefined;
}
