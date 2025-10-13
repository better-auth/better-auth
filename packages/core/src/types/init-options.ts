import type { Dialect, Kysely, MysqlPool, PostgresPool } from "kysely";
import type { Database } from "better-sqlite3";
import type { CookieOptions } from "better-call";
import type { LiteralUnion } from "./helper";
import type {
	DBFieldAttribute,
	DBPreservedModels,
	DBRequiredTable,
	SecondaryStorage,
} from "../db/type";
import type {
	Account,
	BetterAuthPluginDBSchema,
	RateLimit,
	Session,
	User,
	Verification,
} from "../db";
import type { Database as BunDatabase } from "bun:sqlite";
import type { DatabaseSync } from "node:sqlite";
import type { DBAdapterDebugLogOption, DBAdapterInstance } from "../db/adapter";
import type { SocialProviderList, SocialProviders } from "../social-providers";
import type { Logger } from "../env";
import type { AuthContext, GenericEndpointContext } from "./context";
import type { AuthMiddleware } from "../middleware";
import type { BetterAuthPlugin } from "@better-auth/core";
import type { schema } from "../db/schema";
import type { MergePluginsSchema } from "../db/plugin";
import type { PluginSchema } from "@better-fetch/fetch";

type KyselyDatabaseType = "postgres" | "mysql" | "sqlite" | "mssql";
type OmitId<T extends { id: unknown }> = Omit<T, "id">;

export type GenerateIdFn<Schema extends BetterAuthPluginDBSchema> = (options: {
	model: keyof Schema;
	size?: number;
}) => string | false;

export type BetterAuthRateLimitOptions<S extends DBRequiredTable<"ratelimit">> =
	{
		/**
		 * By default, rate limiting is only
		 * enabled on production.
		 */
		enabled?: boolean;
		/**
		 * Default window to use for rate limiting. The value
		 * should be in seconds.
		 *
		 * @default 10 seconds
		 */
		window?: number;
		/**
		 * The default maximum number of requests allowed within the window.
		 *
		 * @default 100 requests
		 */
		max?: number;
		/**
		 * Custom rate limit rules to apply to
		 * specific paths.
		 */
		customRules?: {
			[key: string]:
				| {
						/**
						 * The window to use for the custom rule.
						 */
						window: number;
						/**
						 * The maximum number of requests allowed within the window.
						 */
						max: number;
				  }
				| false
				| ((request: Request) =>
						| { window: number; max: number }
						| false
						| Promise<
								| {
										window: number;
										max: number;
								  }
								| false
						  >);
		};
		/**
		 * Storage configuration
		 *
		 * By default, rate limiting is stored in memory. If you passed a
		 * secondary storage, rate limiting will be stored in the secondary
		 * storage.
		 *
		 * @default "memory"
		 */
		storage?: "memory" | "database" | "secondary-storage";
		/**
		 * If database is used as storage, the name of the table to
		 * use for rate limiting.
		 *
		 * @default "rateLimit"
		 */
		modelName?: string;
		/**
		 * Custom field names for the rate limit table
		 */
		fields?: Record<keyof RateLimit<S>, string>;
		/**
		 * custom storage configuration.
		 *
		 * NOTE: If custom storage is used storage
		 * is ignored
		 */
		customStorage?: {
			get: (key: string) => Promise<RateLimit<S> | undefined>;
			set: (key: string, value: RateLimit<S>) => Promise<void>;
		};
	};

export type BetterAuthAdvancedOptions<Schema extends BetterAuthPluginDBSchema, NumberIds extends boolean = false> = {
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
		useNumberId?: NumberIds;
		/**
		 * Custom generateId function.
		 *
		 * If not provided, random ids will be generated.
		 * If set to false, the database's auto generated id will be used.
		 */
		generateId?: NumberIds extends true ? false | undefined : GenerateIdFn<Schema> | false;
	};
};

export type BetterAuthOptions<
	Schema extends BetterAuthPluginDBSchema<typeof schema> = typeof schema,
> = {
	/**
	 * The name of the application
	 *
	 * process.env.APP_NAME
	 *
	 * @default "Better Auth"
	 */
	appName?: string;
	/**
	 * Base URL for the Better Auth. This is typically the
	 * root URL where your application server is hosted.
	 * If not explicitly set,
	 * the system will check the following environment variable:
	 *
	 * process.env.BETTER_AUTH_URL
	 */
	baseURL?: string;
	/**
	 * Base path for the Better Auth. This is typically
	 * the path where the
	 * Better Auth routes are mounted.
	 *
	 * @default "/api/auth"
	 */
	basePath?: string;
	/**
	 * The secret to use for encryption,
	 * signing and hashing.
	 *
	 * By default Better Auth will look for
	 * the following environment variables:
	 * process.env.BETTER_AUTH_SECRET,
	 * process.env.AUTH_SECRET
	 * If none of these environment
	 * variables are set,
	 * it will default to
	 * "better-auth-secret-123456789".
	 *
	 * on production if it's not set
	 * it will throw an error.
	 *
	 * you can generate a good secret
	 * using the following command:
	 * @example
	 * ```bash
	 * openssl rand -base64 32
	 * ```
	 */
	secret?: string;
	/**
	 * Database configuration
	 */
	database?:
		| PostgresPool
		| MysqlPool
		| Database
		| Dialect
		| DBAdapterInstance<Schema>
		| BunDatabase
		| DatabaseSync
		| {
				dialect: Dialect;
				type: KyselyDatabaseType;
				/**
				 * casing for table names
				 *
				 * @default "camel"
				 */
				casing?: "snake" | "camel";
				/**
				 * Enable debug logs for the adapter
				 *
				 * @default false
				 */
				debugLogs?: DBAdapterDebugLogOption;
				/**
				 * Whether to execute multiple operations in a transaction.
				 * If the database doesn't support transactions,
				 * set this to `false` and operations will be executed sequentially.
				 * @default true
				 */
				transaction?: boolean;
		  }
		| {
				/**
				 * Kysely instance
				 */
				db: Kysely<any>;
				/**
				 * Database type between postgres, mysql and sqlite
				 */
				type: KyselyDatabaseType;
				/**
				 * casing for table names
				 *
				 * @default "camel"
				 */
				casing?: "snake" | "camel";
				/**
				 * Enable debug logs for the adapter
				 *
				 * @default false
				 */
				debugLogs?: DBAdapterDebugLogOption;
				/**
				 * Whether to execute multiple operations in a transaction.
				 * If the database doesn't support transactions,
				 * set this to `false` and operations will be executed sequentially.
				 * @default true
				 */
				transaction?: boolean;
		  };
	/**
	 * Secondary storage configuration
	 *
	 * This is used to store session and rate limit data.
	 */
	secondaryStorage?: SecondaryStorage;
	/**
	 * Email verification configuration
	 */
	emailVerification?: {
		/**
		 * Send a verification email
		 * @param data the data object
		 * @param request the request object
		 */
		sendVerificationEmail?: (
			/**
			 * @param user the user to send the
			 * verification email to
			 * @param url the URL to send the verification email to
			 * it contains the token as well
			 * @param token the token to send the verification email to
			 */
			data: {
				user: User<Schema>;
				url: string;
				token: string;
			},
			/**
			 * The request object
			 */
			request?: Request,
		) => Promise<void>;
		/**
		 * Send a verification email automatically
		 * after sign up
		 *
		 * @default false
		 */
		sendOnSignUp?: boolean;
		/**
		 * Send a verification email automatically
		 * on sign in when the user's email is not verified
		 *
		 * @default false
		 */
		sendOnSignIn?: boolean;
		/**
		 * Auto signin the user after they verify their email
		 */
		autoSignInAfterVerification?: boolean;
		/**
		 * Number of seconds the verification token is
		 * valid for.
		 * @default 3600 seconds (1 hour)
		 */
		expiresIn?: number;
		/**
		 * A function that is called when a user verifies their email
		 * @param user the user that verified their email
		 * @param request the request object
		 */
		onEmailVerification?: (
			user: User<Schema>,
			request?: Request,
		) => Promise<void>;
		/**
		 * A function that is called when a user's email is updated to verified
		 * @param user the user that verified their email
		 * @param request the request object
		 */
		afterEmailVerification?: (
			user: User<Schema>,
			request?: Request,
		) => Promise<void>;
	};
	/**
	 * Email and password authentication
	 */
	emailAndPassword?: {
		/**
		 * Enable email and password authentication
		 *
		 * @default false
		 */
		enabled: boolean;
		/**
		 * Disable email and password sign up
		 *
		 * @default false
		 */
		disableSignUp?: boolean;
		/**
		 * Require email verification before a session
		 * can be created for the user.
		 *
		 * if the user is not verified, the user will not be able to sign in
		 * and on sign in attempts, the user will be prompted to verify their email.
		 */
		requireEmailVerification?: boolean;
		/**
		 * The maximum length of the password.
		 *
		 * @default 128
		 */
		maxPasswordLength?: number;
		/**
		 * The minimum length of the password.
		 *
		 * @default 8
		 */
		minPasswordLength?: number;
		/**
		 * send reset password
		 */
		sendResetPassword?: (
			/**
			 * @param user the user to send the
			 * reset password email to
			 * @param url the URL to send the reset password email to
			 * @param token the token to send to the user (could be used instead of sending the url
			 * if you need to redirect the user to custom route)
			 */
			data: { user: User<Schema>; url: string; token: string },
			/**
			 * The request object
			 */
			request?: Request,
		) => Promise<void>;
		/**
		 * Number of seconds the reset password token is
		 * valid for.
		 * @default 1 hour (60 * 60)
		 */
		resetPasswordTokenExpiresIn?: number;
		/**
		 * A callback function that is triggered
		 * when a user's password is changed successfully.
		 */
		onPasswordReset?: (
			data: { user: User<Schema> },
			request?: Request,
		) => Promise<void>;
		/**
		 * Password hashing and verification
		 *
		 * By default Scrypt is used for password hashing and
		 * verification. You can provide your own hashing and
		 * verification function. if you want to use a
		 * different algorithm.
		 */
		password?: {
			hash?: (password: string) => Promise<string>;
			verify?: (data: { hash: string; password: string }) => Promise<boolean>;
		};
		/**
		 * Automatically sign in the user after sign up
		 *
		 * @default true
		 */
		autoSignIn?: boolean;
		/**
		 * Whether to revoke all other sessions when resetting password
		 * @default false
		 */
		revokeSessionsOnPasswordReset?: boolean;
	};
	/**
	 * list of social providers
	 */
	socialProviders?: SocialProviders;
	/**
	 * List of Better Auth plugins
	 */
	plugins?: [] | BetterAuthPlugin<Schema>[];
	/**
	 * User configuration
	 */
	user?: {
		/**
		 * The model name for the user. Defaults to "user".
		 */
		modelName?: string;
		/**
		 * Map fields
		 *
		 * @example
		 * ```ts
		 * {
		 *  userId: "user_id"
		 * }
		 * ```
		 */
		fields?: Partial<Record<keyof OmitId<User<Schema>>, string>>;
		/**
		 * Additional fields for the user
		 */
		additionalFields?: {
			[key: string]: DBFieldAttribute;
		};
		/**
		 * Changing email configuration
		 */
		changeEmail?: {
			/**
			 * Enable changing email
			 * @default false
			 */
			enabled: boolean;
			/**
			 * Send a verification email when the user changes their email.
			 * @param data the data object
			 * @param request the request object
			 */
			sendChangeEmailVerification?: (
				data: {
					user: User<Schema>;
					newEmail: string;
					url: string;
					token: string;
				},
				request?: Request,
			) => Promise<void>;
		};
		/**
		 * User deletion configuration
		 */
		deleteUser?: {
			/**
			 * Enable user deletion
			 */
			enabled?: boolean;
			/**
			 * Send a verification email when the user deletes their account.
			 *
			 * if this is not set, the user will be deleted immediately.
			 * @param data the data object
			 * @param request the request object
			 */
			sendDeleteAccountVerification?: (
				data: {
					user: User<Schema>;
					url: string;
					token: string;
				},
				request?: Request,
			) => Promise<void>;
			/**
			 * A function that is called before a user is deleted.
			 *
			 * to interrupt with error you can throw `APIError`
			 */
			beforeDelete?: (user: User<Schema>, request?: Request) => Promise<void>;
			/**
			 * A function that is called after a user is deleted.
			 *
			 * This is useful for cleaning up user data
			 */
			afterDelete?: (user: User<Schema>, request?: Request) => Promise<void>;
			/**
			 * The expiration time for the delete token.
			 *
			 * @default 1 day (60 * 60 * 24) in seconds
			 */
			deleteTokenExpiresIn?: number;
		};
	};
	session?: {
		/**
		 * The model name for the session.
		 *
		 * @default "session"
		 */
		modelName?: string;
		/**
		 * Map fields
		 *
		 * @example
		 * ```ts
		 * {
		 *  userId: "user_id"
		 * }
		 */
		fields?: Partial<Record<keyof OmitId<Session<Schema>>, string>>;
		/**
		 * Expiration time for the session token. The value
		 * should be in seconds.
		 * @default 7 days (60 * 60 * 24 * 7)
		 */
		expiresIn?: number;
		/**
		 * How often the session should be refreshed. The value
		 * should be in seconds.
		 * If set 0 the session will be refreshed every time it is used.
		 * @default 1 day (60 * 60 * 24)
		 */
		updateAge?: number;
		/**
		 * Disable session refresh so that the session is not updated
		 * regardless of the `updateAge` option.
		 *
		 * @default false
		 */
		disableSessionRefresh?: boolean;
		/**
		 * Additional fields for the session
		 */
		additionalFields?: {
			[key: string]: DBFieldAttribute;
		};
		/**
		 * By default if secondary storage is provided
		 * the session is stored in the secondary storage.
		 *
		 * Set this to true to store the session in the database
		 * as well.
		 *
		 * Reads are always done from the secondary storage.
		 *
		 * @default false
		 */
		storeSessionInDatabase?: boolean;
		/**
		 * By default, sessions are deleted from the database when secondary storage
		 * is provided when session is revoked.
		 *
		 * Set this to true to preserve session records in the database,
		 * even if they are deleted from the secondary storage.
		 *
		 * @default false
		 */
		preserveSessionInDatabase?: boolean;
		/**
		 * Enable caching session in cookie
		 */
		cookieCache?: {
			/**
			 * max age of the cookie
			 * @default 5 minutes (5 * 60)
			 */
			maxAge?: number;
			/**
			 * Enable caching session in cookie
			 * @default false
			 */
			enabled?: boolean;
		};
		/**
		 * The age of the session to consider it fresh.
		 *
		 * This is used to check if the session is fresh
		 * for sensitive operations. (e.g. deleting an account)
		 *
		 * If the session is not fresh, the user should be prompted
		 * to sign in again.
		 *
		 * If set to 0, the session will be considered fresh every time. (⚠︎ not recommended)
		 *
		 * @default 1 day (60 * 60 * 24)
		 */
		freshAge?: number;
	};
	account?: {
		/**
		 * The model name for the account. Defaults to "account".
		 */
		modelName?: string;
		/**
		 * Map fields
		 */
		fields?: Partial<Record<keyof OmitId<Account<Schema>>, string>>;
		/**
		 * Additional fields for the account
		 */
		additionalFields?: {
			[key: string]: DBFieldAttribute;
		};
		/**
		 * When enabled (true), the user account data (accessToken, idToken, refreshToken, etc.)
		 * will be updated on sign in with the latest data from the provider.
		 *
		 * @default true
		 */
		updateAccountOnSignIn?: boolean;
		/**
		 * Configuration for account linking.
		 */
		accountLinking?: {
			/**
			 * Enable account linking
			 *
			 * @default true
			 */
			enabled?: boolean;
			/**
			 * List of trusted providers
			 */
			trustedProviders?: Array<
				LiteralUnion<SocialProviderList[number] | "email-password", string>
			>;
			/**
			 * If enabled (true), this will allow users to manually linking accounts with different email addresses than the main user.
			 *
			 * @default false
			 *
			 * ⚠️ Warning: enabling this might lead to account takeovers, so proceed with caution.
			 */
			allowDifferentEmails?: boolean;
			/**
			 * If enabled (true), this will allow users to unlink all accounts.
			 *
			 * @default false
			 */
			allowUnlinkingAll?: boolean;
			/**
			 * If enabled (true), this will update the user information based on the newly linked account
			 *
			 * @default false
			 */
			updateUserInfoOnLink?: boolean;
		};
		/**
		 * Encrypt OAuth tokens
		 *
		 * By default, OAuth tokens (access tokens, refresh tokens, ID tokens) are stored in plain text in the database.
		 * This poses a security risk if your database is compromised, as attackers could gain access to user accounts
		 * on external services.
		 *
		 * When enabled, tokens are encrypted using AES-256-GCM before storage, providing protection against:
		 * - Database breaches and unauthorized access to raw token data
		 * - Internal threats from database administrators or compromised credentials
		 * - Token exposure in database backups and logs
		 * @default false
		 */
		encryptOAuthTokens?: boolean;
	};
	/**
	 * Verification configuration
	 */
	verification?: {
		/**
		 * Change the modelName of the verification table
		 */
		modelName?: string;
		/**
		 * Map verification fields
		 */
		fields?: Partial<Record<keyof OmitId<Verification<Schema>>, string>>;
		/**
		 * disable cleaning up expired values when a verification value is
		 * fetched
		 */
		disableCleanup?: boolean;
	};
	/**
	 * List of trusted origins.
	 */
	trustedOrigins?:
		| string[]
		| ((request: Request) => string[] | Promise<string[]>);
	/**
	 * Rate limiting configuration
	 */
	rateLimit?: BetterAuthRateLimitOptions<Schema>;
	/**
	 * Advanced options
	 */
	advanced?: BetterAuthAdvancedOptions<Schema> & {
		/**
		 * @deprecated Please use `database.generateId` instead.
		 */
		generateId?: never;
	};
	logger?: Logger;
	/**
	 * allows you to define custom hooks that can be
	 * executed during lifecycle of core database
	 * operations.
	 */
	databaseHooks?: {
		/**
		 * User hooks
		 */
		user?: {
			create?: {
				/**
				 * Hook that is called before a user is created.
				 * if the hook returns false, the user will not be created.
				 * If the hook returns an object, it'll be used instead of the original data
				 */
				before?: (
					user: User<Schema> & Record<string, unknown>,
					context?: GenericEndpointContext<Schema>,
				) => Promise<
					| boolean
					| void
					| {
							data: Partial<User<Schema>> & Record<string, any>;
					  }
				>;
				/**
				 * Hook that is called after a user is created.
				 */
				after?: (
					user: User<Schema> & Record<string, unknown>,
					context?: GenericEndpointContext<Schema>,
				) => Promise<void>;
			};
			update?: {
				/**
				 * Hook that is called before a user is updated.
				 * if the hook returns false, the user will not be updated.
				 * If the hook returns an object, it'll be used instead of the original data
				 */
				before?: (
					user: Partial<User<Schema>> & Record<string, unknown>,
					context?: GenericEndpointContext<Schema>,
				) => Promise<
					| boolean
					| void
					| {
							data: Partial<User<Schema> & Record<string, any>>;
					  }
				>;
				/**
				 * Hook that is called after a user is updated.
				 */
				after?: (
					user: User<Schema> & Record<string, unknown>,
					context?: GenericEndpointContext<Schema>,
				) => Promise<void>;
			};
			delete?: {
				/**
				 * Hook that is called before a user is deleted.
				 * if the hook returns false, the user will not be deleted.
				 */
				before?: (
					user: User<Schema> & Record<string, unknown>,
					context?: GenericEndpointContext<Schema>,
				) => Promise<boolean | void>;
				/**
				 * Hook that is called after a user is deleted.
				 */
				after?: (
					user: User<Schema> & Record<string, unknown>,
					context?: GenericEndpointContext<Schema>,
				) => Promise<void>;
			};
		};
		/**
		 * Session Hook
		 */
		session?: {
			create?: {
				/**
				 * Hook that is called before a session is created.
				 * if the hook returns false, the session will not be created.
				 * If the hook returns an object, it'll be used instead of the original data
				 */
				before?: (
					session: Session<Schema> & Record<string, unknown>,
					context?: GenericEndpointContext<Schema>,
				) => Promise<
					| boolean
					| void
					| {
							data: Partial<Session<Schema>> & Record<string, any>;
					  }
				>;
				/**
				 * Hook that is called after a session is created.
				 */
				after?: (
					session: Session<Schema> & Record<string, unknown>,
					context?: GenericEndpointContext<Schema>,
				) => Promise<void>;
			};
			/**
			 * Update hook
			 */
			update?: {
				/**
				 * Hook that is called before a user is updated.
				 * if the hook returns false, the session will not be updated.
				 * If the hook returns an object, it'll be used instead of the original data
				 */
				before?: (
					session: Partial<Session<Schema>> & Record<string, unknown>,
					context?: GenericEndpointContext<Schema>,
				) => Promise<
					| boolean
					| void
					| {
							data: Partial<Session<Schema> & Record<string, any>>;
					  }
				>;
				/**
				 * Hook that is called after a session is updated.
				 */
				after?: (
					session: Session<Schema> & Record<string, unknown>,
					context?: GenericEndpointContext<Schema>,
				) => Promise<void>;
			};
			delete?: {
				/**
				 * Hook that is called before a session is deleted.
				 * if the hook returns false, the session will not be deleted.
				 */
				before?: (
					session: Session<Schema> & Record<string, unknown>,
					context?: GenericEndpointContext<Schema>,
				) => Promise<boolean | void>;
				/**
				 * Hook that is called after a session is deleted.
				 */
				after?: (
					session: Session<Schema> & Record<string, unknown>,
					context?: GenericEndpointContext<Schema>,
				) => Promise<void>;
			};
		};
		/**
		 * Account Hook
		 */
		account?: {
			create?: {
				/**
				 * Hook that is called before a account is created.
				 * If the hook returns false, the account will not be created.
				 * If the hook returns an object, it'll be used instead of the original data
				 */
				before?: (
					account: Account<Schema>,
					context?: GenericEndpointContext<Schema>,
				) => Promise<
					| boolean
					| void
					| {
							data: Partial<Account<Schema>> & Record<string, any>;
					  }
				>;
				/**
				 * Hook that is called after a account is created.
				 */
				after?: (
					account: Account<Schema>,
					context?: GenericEndpointContext<Schema>,
				) => Promise<void>;
			};
			/**
			 * Update hook
			 */
			update?: {
				/**
				 * Hook that is called before a account is update.
				 * If the hook returns false, the user will not be updated.
				 * If the hook returns an object, it'll be used instead of the original data
				 */
				before?: (
					account: Partial<Account<Schema>> & Record<string, unknown>,
					context?: GenericEndpointContext<Schema>,
				) => Promise<
					| boolean
					| void
					| {
							data: Partial<Account<Schema> & Record<string, any>>;
					  }
				>;
				/**
				 * Hook that is called after a account is updated.
				 */
				after?: (
					account: Account<Schema> & Record<string, unknown>,
					context?: GenericEndpointContext<Schema>,
				) => Promise<void>;
			};
			delete?: {
				/**
				 * Hook that is called before an account is deleted.
				 * if the hook returns false, the account will not be deleted.
				 */
				before?: (
					account: Account<Schema> & Record<string, unknown>,
					context?: GenericEndpointContext<Schema>,
				) => Promise<boolean | void>;
				/**
				 * Hook that is called after an account is deleted.
				 */
				after?: (
					account: Account<Schema> & Record<string, unknown>,
					context?: GenericEndpointContext<Schema>,
				) => Promise<void>;
			};
		};
		/**
		 * Verification Hook
		 */
		verification?: {
			create?: {
				/**
				 * Hook that is called before a verification is created.
				 * if the hook returns false, the verification will not be created.
				 * If the hook returns an object, it'll be used instead of the original data
				 */
				before?: (
					verification: Verification<Schema> & Record<string, unknown>,
					context?: GenericEndpointContext<Schema>,
				) => Promise<
					| boolean
					| void
					| {
							data: Partial<Verification<Schema>> & Record<string, any>;
					  }
				>;
				/**
				 * Hook that is called after a verification is created.
				 */
				after?: (
					verification: Verification<Schema> & Record<string, unknown>,
					context?: GenericEndpointContext<Schema>,
				) => Promise<void>;
			};
			update?: {
				/**
				 * Hook that is called before a verification is updated.
				 * if the hook returns false, the verification will not be updated.
				 * If the hook returns an object, it'll be used instead of the original data
				 */
				before?: (
					verification: Partial<Verification<Schema>> & Record<string, unknown>,
					context?: GenericEndpointContext<Schema>,
				) => Promise<
					| boolean
					| void
					| {
							data: Partial<Verification<Schema> & Record<string, any>>;
					  }
				>;
				/**
				 * Hook that is called after a verification is updated.
				 */
				after?: (
					verification: Verification<Schema> & Record<string, unknown>,
					context?: GenericEndpointContext<Schema>,
				) => Promise<void>;
			};
			delete?: {
				/**
				 * Hook that is called before a verification is deleted.
				 * if the hook returns false, the verification will not be deleted.
				 */
				before?: (
					verification: Verification<Schema> & Record<string, unknown>,
					context?: GenericEndpointContext<Schema>,
				) => Promise<boolean | void>;
				/**
				 * Hook that is called after a verification is deleted.
				 */
				after?: (
					verification: Verification<Schema> & Record<string, unknown>,
					context?: GenericEndpointContext<Schema>,
				) => Promise<void>;
			};
		};
	};
	/**
	 * API error handling
	 */
	onAPIError?: {
		/**
		 * Throw an error on API error
		 *
		 * @default false
		 */
		throw?: boolean;
		/**
		 * Custom error handler
		 *
		 * @param error
		 * @param ctx - Auth context
		 */
		onError?: (
			error: unknown,
			ctx: AuthContext<Schema>,
		) => void | Promise<void>;
		/**
		 * The URL to redirect to on error
		 *
		 * When errorURL is provided, the error will be added to the URL as a query parameter
		 * and the user will be redirected to the errorURL.
		 *
		 * @default - "/api/auth/error"
		 */
		errorURL?: string;
	};
	/**
	 * Hooks
	 */
	hooks?: {
		/**
		 * Before a request is processed
		 */
		before?: AuthMiddleware<Schema>;
		/**
		 * After a request is processed
		 */
		after?: AuthMiddleware<Schema>;
	};
	/**
	 * Disabled paths
	 *
	 * Paths you want to disable.
	 */
	disabledPaths?: string[];
	/**
	 * Telemetry configuration
	 */
	telemetry?: {
		/**
		 * Enable telemetry collection
		 *
		 * @default false
		 */
		enabled?: boolean;
		/**
		 * Enable debug mode
		 *
		 * @default false
		 */
		debug?: boolean;
	};
};
