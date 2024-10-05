import type { Dialect, PostgresPool } from "kysely";
import type { Account, Session, User, Verification } from "../db/schema";
import type { BetterAuthPlugin } from "./plugins";
import type { OAuthProviderList } from "../social-providers/types";
import type { SocialProviders } from "../social-providers";
import type { RateLimit } from "./models";
import type { Adapter } from "./adapter";
import type { BetterSqlite3Database, MysqlPool } from "./database";

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
		| Adapter;
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
		 * send reset password email
		 */
		sendResetPassword?: (url: string, user: User) => Promise<void>;
		/**
		 * @param email the email to send the verification email to
		 * @param url the url to send the verification
		 * email to
		 * @param token the actual token. You can use this
		 * if you want to custom endpoint to verify the
		 * email.
		 */
		sendVerificationEmail?: (
			email: string,
			url: string,
			token: string,
		) => Promise<void>;
		/**
		 * Send a verification email automatically
		 * after sign up
		 *
		 * @default false
		 */
		sendEmailVerificationOnSignUp?: boolean;
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
	};
	session?: {
		modelName?: string;
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
			trustedProviders?: Array<OAuthProviderList[number] | "email-password">;
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
		 * @default 60 sec
		 */
		window?: number;
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
		 * The default maximum number of requests allowed within the window.
		 *
		 * @default 100
		 */
		max?: number;
		/**
		 * Storage configuration
		 *
		 * @default "memory"
		 */
		storage?: "memory" | "database";
		/**
		 * If database is used as storage, the name of the table to
		 * use for rate limiting.
		 *
		 * @default "rateLimit"
		 */
		tableName?: string;
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
		 * Disable CSRF check
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
			 * List of cookies that should be shared across subdomains
			 *
			 * by default, only sessionToken, csrfToken and dontRememberToken
			 * cookies will be shared across subdomains
			 */
			eligibleCookies?: string[];
			/**
			 * The domain to use for the cookies
			 *
			 * By default, the domain will be the root
			 * domain from the base URL.
			 */
			domain?: string;
		};
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
}
