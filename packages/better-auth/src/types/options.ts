import type { Dialect } from "kysely";
import type { User } from "../adapters/schema";
import type { FieldAttribute } from "../db/field";
import type { BetterAuthPlugin } from "./plugins";
import type { OAuthProviderList } from "./provider";
import type { SocialProviders } from "../social-providers";
import type { RateLimit } from "./models";

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
		| {
				provider: "postgres" | "sqlite" | "mysql";
				url: string;
		  }
		| Dialect;
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
	};
	session?: {
		modelName?: string;
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
		accountLinking?: {
			/**
			 * Enable account linking
			 *
			 * @default true
			 */
			enabled?: boolean;
			/**
			 * List of trusted providers. If the
			 * provider is not in this list
			 * `emailVerified` field is ignored.
			 */
			trustedProviders?: Array<OAuthProviderList[number] | "email-password">;
			/**
			 * Require email verified field
			 * to be true to link the account
			 */
			requireEmailVerified?: boolean;
		};
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
}
