export type LastSocialProviderOptions = {
	/**
	 * The name of the last used social provider cookie.
	 *
	 * @default "better-auth.last_used_social"
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
	 * A list of trusted social provider IDs.
	 *
	 * Used alongside the enabled social providers. The plugin will only track
	 * and return a last-used provider if its ID is present in either the enabled
	 * social providers or this trusted list.
	 *
	 * @default []
	 */
	trustedProviderIds?: string[];
};

export type RealizedLastSocialProviderOptions =
	Required<LastSocialProviderOptions>;
