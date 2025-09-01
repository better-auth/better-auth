export const LAST_USED_LOGIN_METHOD_HEADER = "x-better-auth-last-used";

export type LastLoginMethodClientOptions<Storage> = {
	storage: Storage;
	/**
	 * The key of the last used social provider store in local storage.
	 *
	 * @default "better-auth.last_used_login_method"
	 */
	key?: string;
};

export type LastLoginMethodOptions<Storage> = {
	storage?: Storage;
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
};

export type RealizedLastLoginMethodOptions<Storage> = Required<
	LastLoginMethodOptions<Storage>
>;

export type RealizedLastLoginMethodClientOptions<Storage> = Required<
	LastLoginMethodClientOptions<Storage>
>;
