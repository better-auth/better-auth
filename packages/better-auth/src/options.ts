import type { createInternalAdapter } from "./adapters";
import type {
	Adapter,
	FieldAttributes,
	InternalFieldAttributes,
	SessionAdapter,
} from "./adapters/types";
import type { getCookies } from "./cookies/cookies";
import type { CookieSerializeOptions } from "./cookies/types";
import type { TokenResponse } from "./oauth2/tokens";
import type { BetterAuthPlugin } from "./plugins/types";
import type { Provider } from "./providers/types";

export interface BetterAuthOptions {
	/**
	 * Base URL for the better auth. This is typically the
	 * root URL where your
	 * application server is hosted. If not explicitly set,
	 * the system will
	 * check the following environment variables in order:
	 * process.env.BETTER_AUTH_URL, process.env.AUTH_URL,
	 * process.env.VERCEL_URL.
	 * If none of these environment variables are set it will
	 * throw an error.
	 */
	baseURL?: string;
	/**
	 * Base path for the better auth. This is typically the path where the
	 * better auth routes are mounted. If not explicitly set, the system will
	 * check if the following environment variables includes a path in order:
	 * process.env.BETTER_AUTH_BASE_PATH, process.env.AUTH_BASE_PATH. If none
	 * of these environment variables are set, it will default to /api/auth/.
	 */
	basePath?: string;
	/**
	 * The secret used to sign the session token. This is required for the session to work. If not explicitly set, the system will check the following environment variables in order: process.env.BETTER_AUTH_SECRET, process.env.AUTH_SECRET. If none of these environment variables are set, on development mode, it will default to "better_auth_secret". On production mode, it will throw an error.
	 *
	 * to generate a good secret you can use the following command:
	 *
	 * @example openssl rand -base64 32
	 */
	secret?: string;
	/**
	 * List of providers for better auth
	 */
	providers: Provider[];
	/**
	 * List of plugins
	 */
	plugins?: [BetterAuthPlugin, ...BetterAuthPlugin[]];
	/**
	 * Database configuration.
	 */
	/**
	 * The adapter to use. Make sure to install the appropriate package for
	 * your ORM or database.
	 */
	adapter: Adapter;
	/**
	 *	Adapter for session
	 */
	sessionAdapter?: SessionAdapter;
	/**
	 * Session configuration
	 */
	session?: {
		/**
		 * The name of the table.
		 * @default "session"
		 */
		modelName?: string;
		/**
		 * Additional fields on session table.
		 */
		additionalFields?: {
			[key: string]: FieldAttributes;
		};
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
	/**
	 * Schema configuration for the user table.
	 */
	user: {
		/**
		 * The name of the table.
		 * @default "user"
		 */
		modelName?: string;
		/**
		 * fields on user table other than id.
		 *
		 * Make sure these fields are added on you actual
		 * database table.
		 * @example
		 * ```ts
		 * name: {
		 * 	type: "string",
		 * 	required: false,
		 * 	returned: true
		 * }
		 * ```
		 */
		fields: {
			[key: string]: FieldAttributes;
		};
	};
	/**
	 * Schema configuration for the account table.
	 */
	account?: {
		/**
		 * The name of the table.
		 * @default "account"
		 */
		modelName?: string;
		/**
		 * Additional fields on account table.
		 * The key should map to a field on your database
		 * table and the value is the value you want to save.
		 *
		 * @example
		 * ```ts
		 * {
		 * 	accessToken: "access_token"
		 * }
		 * ```
		 */
		additionalFields?: {
			[key: string]: keyof TokenResponse;
		};
	};
	/**
	 * Advanced options. Don't change these unless you know
	 * what you are doing.
	 */
	advanced?: {
		/**
		 * ⚠ Advanced Option: When set to `true` then all
		 * cookies set by HTTPS.
		 * By default this is set to false for URL begin with
		 * http:// and true for URL begin with https://
		 */
		useSecureCookies?: boolean;
		/** ⚠ Danger Option:
		 * The skipCSRFCheck option is a critical security feature that helps
		 * protect against Cross-Site Request Forgery attacks. It should only
		 * be modified if you are certain your application has an alternative,
		 * robust CSRF protection mechanism in place. Improper use of this
		 * option can expose your application to security vulnerabilities.
		 */
		skipCSRFCheck?: boolean;
		/**
		 * ⚠ Advanced Option: session cookie configuration
		 */
		sessionCookie?: CookieSerializeOptions;
	};
}

export type InternalAdapter = ReturnType<typeof createInternalAdapter>;

export interface InternalOptions {
	_db: Adapter;
	adapter: InternalAdapter;
	cookies: ReturnType<typeof getCookies>;
	disableCSRF?: boolean;
	plugins: BetterAuthPlugin[];
	providers: Provider[];
	secret: string;
	basePath: string;
	session: {
		expiresIn: number;
		updateAge: number;
		modelName: string;
		additionalFields?: Record<string, InternalFieldAttributes>;
		selectFields: string[];
	};
	sessionAdapter?: SessionAdapter;
	user: {
		modelName: string;
		fields: Record<string, InternalFieldAttributes>;
		selectFields: string[];
	};
	account: {
		modelName: string;
		additionalFields?: Record<string, keyof TokenResponse>;
		selectFields: string[];
	};
	baseURL: string;
}

export type TypeOrTypeReturning<T, P = void, PR = false> =
	| T
	| ((
			param: P extends infer R ? R : never,
	  ) => PR extends true ? Promise<T> : T);
