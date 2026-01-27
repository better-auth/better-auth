export interface ElectronOptions {
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
	 * The prefix to use for cookies set by the plugin.
	 *
	 * @default "better-auth"
	 */
	cookiePrefix?: string | undefined;
	/**
	 * Client ID to use for identifying the Electron client during authorization.
	 *
	 * @default "electron"
	 */
	clientID?: string | undefined;
	/**
	 * Override the origin for Electron API routes.
	 * Enable this if you're facing cors origin issues with Electron API routes.
	 *
	 * @default false
	 */
	disableOriginOverride?: boolean | undefined;
}
