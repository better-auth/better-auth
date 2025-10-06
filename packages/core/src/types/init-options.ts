import type { CookieOptions } from "better-call";
import type { LiteralUnion } from "./helper";
import type { Models } from "../db/type";

export type GenerateIdFn = (options: {
	model: LiteralUnion<Models, string>;
	size?: number;
}) => string | false;

export type BetterAuthAdvancedOptions = {
	/**
	 * Ip address configuration
	 */
	ipAddress?: {
		/**
		 * List of headers to use for ip address
		 *
		 * Ip address is used for rate limiting and session tracking
		 *
		 * @example ["x-client-ip", "x-forwarded-for", "cf-connecting-ip"]
		 *
		 * @default
		 * @link https://github.com/better-auth/better-auth/blob/main/packages/better-auth/src/utils/get-request-ip.ts#L8
		 */
		ipAddressHeaders?: string[];
		/**
		 * Disable ip tracking
		 *
		 * ⚠︎ This is a security risk and it may expose your application to abuse
		 */
		disableIpTracking?: boolean;
	};
	/**
	 * Use secure cookies
	 *
	 * @default false
	 */
	useSecureCookies?: boolean;
	/**
	 * Disable trusted origins check
	 *
	 * ⚠︎ This is a security risk and it may expose your application to CSRF attacks
	 */
	disableCSRFCheck?: boolean;
	/**
	 * Configure cookies to be cross subdomains
	 */
	crossSubDomainCookies?: {
		/**
		 * Enable cross subdomain cookies
		 */
		enabled: boolean;
		/**
		 * Additional cookies to be shared across subdomains
		 */
		additionalCookies?: string[];
		/**
		 * The domain to use for the cookies
		 *
		 * By default, the domain will be the root
		 * domain from the base URL.
		 */
		domain?: string;
	};
	/*
	 * Allows you to change default cookie names and attributes
	 *
	 * default cookie names:
	 * - "session_token"
	 * - "session_data"
	 * - "dont_remember"
	 *
	 * plugins can also add additional cookies
	 */
	cookies?: {
		[key: string]: {
			name?: string;
			attributes?: CookieOptions;
		};
	};
	defaultCookieAttributes?: CookieOptions;
	/**
	 * Prefix for cookies. If a cookie name is provided
	 * in cookies config, this will be overridden.
	 *
	 * @default
	 * ```txt
	 * "appName" -> which defaults to "better-auth"
	 * ```
	 */
	cookiePrefix?: string;
	/**
	 * Database configuration.
	 */
	database?: {
		/**
		 * The default number of records to return from the database
		 * when using the `findMany` adapter method.
		 *
		 * @default 100
		 */
		defaultFindManyLimit?: number;
		/**
		 * If your database auto increments number ids, set this to `true`.
		 *
		 * Note: If enabled, we will not handle ID generation (including if you use `generateId`), and it would be expected that your database will provide the ID automatically.
		 *
		 * @default false
		 */
		useNumberId?: boolean;
		/**
		 * Custom generateId function.
		 *
		 * If not provided, random ids will be generated.
		 * If set to false, the database's auto generated id will be used.
		 */
		generateId?: GenerateIdFn | false;
	};
	/**
	 * Custom generateId function.
	 *
	 * If not provided, random ids will be generated.
	 * If set to false, the database's auto generated id will be used.
	 *
	 * @deprecated Please use `database.generateId` instead. This will be potentially removed in future releases.
	 */
	generateId?: GenerateIdFn | false;
};
