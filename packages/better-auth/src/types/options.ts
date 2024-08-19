import { Dialect } from "kysely";
import { FieldAttribute } from "../db/field";
import { Provider } from "./provider";
import { Plugin } from "./plugins";
import { Adapter } from "./adapter";

export interface BetterAuthOptions {
	/**
	 * Base URL for the better auth. This is typically the
	 * root URL where your
	 * application server is hosted. If not explicitly set,
	 * the system will check the following environment variable:
	 *
	 * process.env.BETTER_AUTH_URL
	 *
	 * If not set it will default to the request origin.
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
	 * The secret used to sign the session token. This is required for the session to work.
	 * to generate a good secret you can use the following command:
	 *
	 * @example openssl rand -base64 32
	 */
	secret: string;
	/**
	 * list of oauth providers
	 */
	providers: Provider[];
	/**
	 * Plugins
	 */
	plugins?: Plugin[];
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
	organization?: {
		enabled: true;
	};
	/**
	 * Disable logging
	 *
	 * @default false
	 */
	disableLog?: boolean;
	/**
	 * Database configuration
	 */
	database:
		| {
				provider: "postgres" | "sqlite" | "mysql";
				url: string;
		  }
		| Adapter;
	/**
	 * User configuration
	 */
	user?: {
		/**
		 * The model name for the user. Defaults to "user".
		 */
		modelName?: string;
		/**
		 * Additional fields to add to the user model
		 */
		additionalFields?: Record<string, FieldAttribute>;
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
		 * The minimum length of the password.
		 *
		 * @default 8
		 */
		maxPasswordLength?: number;
		/**
		 * The maximum length of the password.
		 *
		 * @default 32
		 */
		minPasswordLength?: number;
	};
}
