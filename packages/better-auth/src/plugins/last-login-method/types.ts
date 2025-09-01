export type LastLoginMethodClientOptions = {
	/**
	 * The name of the last used login method cookie.
	 *
	 * @default "better-auth.last_used_login_method"
	 */
	cookieName?: string;
};

export type LastLoginMethodOptions = {
	/**
	 * The name of the last used login method cookie.
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
};

export type RealizedLastLoginMethodOptions = Required<LastLoginMethodOptions>;

export type RealizedLastLoginMethodClientOptions =
	Required<LastLoginMethodClientOptions>;
