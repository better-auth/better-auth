import type { Dialect, Kysely, PostgresPool } from "kysely";
import type { Account, Session, User, Verification } from "../db/schema";
import type { BetterAuthPlugin } from "./plugins";
import type { SocialProviderList, SocialProviders } from "../social-providers";
import type { Adapter, SecondaryStorage } from "./adapter";
import type { BetterSqlite3Database, MysqlPool } from "./database";
import type { KyselyDatabaseType } from "../adapters/kysely-adapter/types";
import type { FieldAttribute } from "../db";
import type { RateLimit } from "./models";
import type { AuthContext } from ".";
import type { CookieOptions } from "better-call";

export interface BetterAuthOptions {
	/**
	 * The name of the application
	 *
	 * process.env.APP_NAME
	 *
	 * @default "Better Auth"
	 */
	appName?: string;
	/**
	 * Base URL for the better auth. This is typically the
	 * root URL where your application server is hosted. If not explicitly set,
	 * the system will check the following environment variable:
	 *
	 * process.env.BETTER_AUTH_URL || process.env.AUTH_URL
	 *
	 * If not set it will throw an error.
	 */
	baseURL?: string;
	/**
	 * Base path for the better auth. This is typically the path where the
	 * better auth routes are mounted.
	 *
	 * @default "/api/auth"
	 */
	basePath?: string;
	/**
	 * The secret to use for encryption,
	 * signing and hashing.
	 *
	 * By default better auth will look for
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
	database:
		| PostgresPool
		| MysqlPool
		| BetterSqlite3Database
		| Dialect
		| Adapter
		| {
				dialect: Dialect;
				type: KyselyDatabaseType;
				/**
				 * Custom generateId function.
				 *
				 * If not provided, nanoid will be used.
				 * If set to false, the database's auto generated id will be used.
				 *
				 * @default nanoid
				 */
				generateId?: ((size?: number) => string) | false;
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
				 * Custom generateId function.
				 *
				 * If not provided, nanoid will be used.
				 * If set to false, the database's auto generated id will be used.
				 *
				 * @default nanoid
				 */
				generateId?: ((size?: number) => string) | false;
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
		 * @param user the user to send the
		 * verification email to
		 * @param url the url to send the verification email to
		 * it contains the token as well
		 * @param token the token to send the verification email to
		 */
		sendVerificationEmail?: (
			user: User,
			url: string,
			token: string,
		) => Promise<void>;
		/**
		 * Send a verification email automatically
		 * after sign up
		 *
		 * @default false
		 */
		sendOnSignUp?: boolean;
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
		sendResetPassword?: (user: User, url: string) => Promise<void>;
		/**
		 * Number of seconds the reset password token is valid for.
		 * @default 1 hour
		 */
		resetPasswordTokenExpiresIn?: number;
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
			verify?: (password: string, hash: string) => Promise<boolean>;
		};
		/**
		 * Automatically sign in the user after sign up
		 */
		autoSignIn?: boolean;
	};
	/**
	 * list of social providers
	 */
	socialProviders?: SocialProviders;
	/**
	 * List of Better Auth plugins
	 */
	plugins?: BetterAuthPlugin[];
	/**
	 * User configuration
	 */
	user?: {
		/**
		 * The model name for the user. Defaults to "user".
		 */
		modelName?: string;
		fields?: Partial<Record<keyof User, string>>;
		/**
		 * Additional fields for the session
		 */
		additionalFields?: {
			[key: string]: FieldAttribute;
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
			 */
			sendChangeEmailVerification?: (
				user: User,
				newEmail: string,
				url: string,
				token: string,
			) => Promise<void>;
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
		fields?: Partial<Record<keyof Session, string>>;
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
		 * Additional fields for the session
		 */
		additionalFields?: {
			[key: string]: FieldAttribute;
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
	};
	account?: {
		modelName?: string;
		fields?: Partial<Record<keyof Account, string>>;
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
			trustedProviders?: Array<SocialProviderList[number] | "email-password">;
		};
	};
	/**
	 * Verification configuration
	 */
	verification?: {
		modelName?: string;
		fields?: Partial<Record<keyof Verification, string>>;
	};
	/**
	 * List of trusted origins.
	 */
	trustedOrigins?: string[];
	/**
	 * Rate limiting configuration
	 */
	rateLimit?: {
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
			[key: string]: {
				/**
				 * The window to use for the custom rule.
				 */
				window: number;
				/**
				 * The maximum number of requests allowed within the window.
				 */
				max: number;
			};
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
		tableName?: string;
		/**
		 * Custom field names for the rate limit table
		 */
		fields?: Record<keyof RateLimit, string>;
		/**
		 * custom storage configuration.
		 *
		 * NOTE: If custom storage is used storage
		 * is ignored
		 */
		customStorage?: {
			get: (key: string) => Promise<RateLimit | undefined>;
			set: (key: string, value: RateLimit) => Promise<void>;
		};
	};
	/**
	 * Advanced options
	 */
	advanced?: {
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
	};
	logger?: {
		/**
		 * Disable logging
		 *
		 * @default false
		 */
		disabled?: boolean;
		/**
		 * log verbose information
		 */
		verboseLogging?: boolean;
	};
	/**
	 * allows you to define custom hooks that can be
	 * executed during lifecycle of core database
	 * operations.
	 */
	databaseHooks?: {
		user?: {
			[key in "create" | "update"]?: {
				/**
				 * Hook that is called before a user is created.
				 * if the hook returns false, the user will not be created.
				 * If the hook returns an object, it'll be used instead of the original data
				 */
				before?: (user: User) => Promise<
					| boolean
					| void
					| {
							data: User & Record<string, any>;
					  }
				>;
				/**
				 * Hook that is called after a user is created.
				 */
				after?: (user: User) => Promise<void>;
			};
		};
		session?: {
			[key in "create" | "update"]?: {
				/**
				 * Hook that is called before a user is created.
				 * if the hook returns false, the user will not be created.
				 * If the hook returns an object, it'll be used instead of the original data
				 */
				before?: (session: Session) => Promise<
					| boolean
					| void
					| {
							data: Session & Record<string, any>;
					  }
				>;
				/**
				 * Hook that is called after a user is created.
				 */
				after?: (session: Session) => Promise<void>;
			};
		};
		account?: {
			[key in "create" | "update"]?: {
				/**
				 * Hook that is called before a user is created.
				 * If the hook returns false, the user will not be created.
				 * If the hook returns an object, it'll be used instead of the original data
				 */
				before?: (account: Account) => Promise<
					| boolean
					| void
					| {
							data: Account & Record<string, any>;
					  }
				>;
				/**
				 * Hook that is called after a user is created.
				 */
				after?: (account: Account) => Promise<void>;
			};
		};
		verification?: {
			[key in "create" | "update"]: {
				/**
				 * Hook that is called before a user is created.
				 * if the hook returns false, the user will not be created.
				 * If the hook returns an object, it'll be used instead of the original data
				 */
				before?: (verification: Verification) => Promise<
					| boolean
					| void
					| {
							data: Verification & Record<string, any>;
					  }
				>;
				/**
				 * Hook that is called after a user is created.
				 */
				after?: (verification: Verification) => Promise<void>;
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
		onError?: (error: unknown, ctx: AuthContext) => void | Promise<void>;
	};
}
