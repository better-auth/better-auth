export type LastLoginMethodOptions = {
	/**
	 * The name of the last used social provider cookie.
	 *
	 * @default "better-auth.last_used_login_method"
	 */
	cookieName?: string;
	/**
	 * The number of seconds until the cookie expires. A zero or
	 * negative number will expire the cookie immediately. By default
	 * the cookie lasts for 5 days.
	 *
	 * @default 432000
	 */
	maxAge?: number;
	/**
	 * Defines which OAuth providers are considered valid login methods.
	 *
	 * A provider is only treated as valid if its ID is included here or it is
	 * one of the enabled social providers.
	 *
	 * Useful when you want to remember/login with a provider that isn’t
	 * explicitly enabled on the server but should still be trusted.
	 *
	 * @default []
	 */
	trustedProviderIds?: string[];
};

export type RealizedLastLoginMethodOptions = Required<LastLoginMethodOptions>;
