import type { CookieOptions, EndpointContext } from "better-call";
import type {
	Account,
	BetterAuthDBSchema,
	ModelNames,
	SecondaryStorage,
	Session,
	User,
	Verification,
} from "../db";
import type { DBAdapter, Where } from "../db/adapter";
import type { createLogger } from "../env";
import type { OAuthProvider } from "../oauth2";
import type { BetterAuthCookies } from "./cookie";
import type {
	BetterAuthOptions,
	BetterAuthRateLimitOptions,
} from "./init-options";

export type GenericEndpointContext<
	Options extends BetterAuthOptions = BetterAuthOptions,
> = EndpointContext<string, any> & {
	context: AuthContext<Options>;
};

export interface InternalAdapter<
	Options extends BetterAuthOptions = BetterAuthOptions,
> {
	createOAuthUser(
		user: Omit<User, "id" | "createdAt" | "updatedAt">,
		account: Omit<Account, "userId" | "id" | "createdAt" | "updatedAt"> &
			Partial<Account>,
	): Promise<{ user: User; account: Account }>;

	createUser<T extends Record<string, any>>(
		user: Omit<User, "id" | "createdAt" | "updatedAt" | "emailVerified"> &
			Partial<User> &
			Record<string, any>,
	): Promise<T & User>;

	createAccount<T extends Record<string, any>>(
		account: Omit<Account, "id" | "createdAt" | "updatedAt"> &
			Partial<Account> &
			T,
	): Promise<T & Account>;

	listSessions(userId: string): Promise<Session[]>;

	listUsers(
		limit?: number | undefined,
		offset?: number | undefined,
		sortBy?: { field: string; direction: "asc" | "desc" } | undefined,
		where?: Where[] | undefined,
	): Promise<User[]>;

	countTotalUsers(where?: Where[] | undefined): Promise<number>;

	deleteUser(userId: string): Promise<void>;

	createSession(
		userId: string,
		dontRememberMe?: boolean | undefined,
		override?: (Partial<Session> & Record<string, any>) | undefined,
		overrideAll?: boolean | undefined,
	): Promise<Session>;

	findSession(token: string): Promise<{
		session: Session & Record<string, any>;
		user: User & Record<string, any>;
	} | null>;

	findSessions(
		sessionTokens: string[],
	): Promise<{ session: Session; user: User }[]>;

	updateSession(
		sessionToken: string,
		session: Partial<Session> & Record<string, any>,
	): Promise<Session | null>;

	deleteSession(token: string): Promise<void>;

	deleteAccounts(userId: string): Promise<void>;

	deleteAccount(accountId: string): Promise<void>;

	deleteSessions(userIdOrSessionTokens: string | string[]): Promise<void>;

	findOAuthUser(
		email: string,
		accountId: string,
		providerId: string,
	): Promise<{ user: User; accounts: Account[] } | null>;

	findUserByEmail(
		email: string,
		options?: { includeAccounts: boolean } | undefined,
	): Promise<{ user: User; accounts: Account[] } | null>;

	findUserById(userId: string): Promise<User | null>;

	linkAccount(
		account: Omit<Account, "id" | "createdAt" | "updatedAt"> & Partial<Account>,
	): Promise<Account>;

	// Record<string, any> is to take into account additional fields or plugin-added fields
	updateUser<T extends Record<string, any>>(
		userId: string,
		data: Partial<User> & Record<string, any>,
	): Promise<User & T>;

	updateUserByEmail<T extends Record<string, any>>(
		email: string,
		data: Partial<User & Record<string, any>>,
	): Promise<User & T>;

	updatePassword(userId: string, password: string): Promise<void>;

	findAccounts(userId: string): Promise<Account[]>;

	findAccount(accountId: string): Promise<Account | null>;

	findAccountByProviderId(
		accountId: string,
		providerId: string,
	): Promise<Account | null>;

	findAccountByUserId(userId: string): Promise<Account[]>;

	updateAccount(id: string, data: Partial<Account>): Promise<Account>;

	createVerificationValue(
		data: Omit<Verification, "createdAt" | "id" | "updatedAt"> &
			Partial<Verification>,
	): Promise<Verification>;

	findVerificationValue(identifier: string): Promise<Verification | null>;

	deleteVerificationValue(id: string): Promise<void>;

	deleteVerificationByIdentifier(identifier: string): Promise<void>;

	updateVerificationValue(
		id: string,
		data: Partial<Verification>,
	): Promise<Verification>;
}

type CreateCookieGetterFn = (
	cookieName: string,
	overrideAttributes?: Partial<CookieOptions> | undefined,
) => {
	name: string;
	attributes: CookieOptions;
};

type CheckPasswordFn<Options extends BetterAuthOptions = BetterAuthOptions> = (
	userId: string,
	ctx: GenericEndpointContext<Options>,
) => Promise<boolean>;

export type AuthContext<Options extends BetterAuthOptions = BetterAuthOptions> =
	{
		options: Options;
		appName: string;
		baseURL: string;
		trustedOrigins: string[];
		/**
		 * Verifies whether url is a trusted origin according to the "trustedOrigins" configuration
		 * @param url The url to verify against the "trustedOrigins" configuration
		 * @param settings Specify supported pattern matching settings
		 * @returns {boolean} true if the URL matches the origin pattern, false otherwise.
		 */
		isTrustedOrigin: (
			url: string,
			settings?: { allowRelativePaths: boolean },
		) => boolean;
		oauthConfig: {
			/**
			 * This is dangerous and should only be used in dev or staging environments.
			 */
			skipStateCookieCheck?: boolean | undefined;
			/**
			 * Strategy for storing OAuth state
			 *
			 * - "cookie": Store state in an encrypted cookie (stateless)
			 * - "database": Store state in the database
			 *
			 * @default "cookie"
			 */
			storeStateStrategy: "database" | "cookie";
		};
		/**
		 * New session that will be set after the request
		 * meaning: there is a `set-cookie` header that will set
		 * the session cookie. This is the fetched session. And it's set
		 * by `setNewSession` method.
		 */
		newSession: {
			session: Session & Record<string, any>;
			user: User & Record<string, any>;
		} | null;
		session: {
			session: Session & Record<string, any>;
			user: User & Record<string, any>;
		} | null;
		setNewSession: (
			session: {
				session: Session & Record<string, any>;
				user: User & Record<string, any>;
			} | null,
		) => void;
		socialProviders: OAuthProvider[];
		authCookies: BetterAuthCookies;
		logger: ReturnType<typeof createLogger>;
		rateLimit: {
			enabled: boolean;
			window: number;
			max: number;
			storage: "memory" | "database" | "secondary-storage";
		} & BetterAuthRateLimitOptions;
		adapter: DBAdapter<Options>;
		internalAdapter: InternalAdapter<Options>;
		createAuthCookie: CreateCookieGetterFn;
		secret: string;
		sessionConfig: {
			updateAge: number;
			expiresIn: number;
			freshAge: number;
			cookieRefreshCache:
				| false
				| {
						enabled: true;
						updateAge: number;
				  };
		};
		generateId: (options: {
			model: ModelNames;
			size?: number | undefined;
		}) => string | false;
		secondaryStorage: SecondaryStorage | undefined;
		password: {
			hash: (password: string) => Promise<string>;
			verify: (data: { password: string; hash: string }) => Promise<boolean>;
			config: {
				minPasswordLength: number;
				maxPasswordLength: number;
			};
			checkPassword: CheckPasswordFn<Options>;
		};
		tables: BetterAuthDBSchema;
		runMigrations: () => Promise<void>;
		publishTelemetry: (event: {
			type: string;
			anonymousId?: string | undefined;
			payload: Record<string, any>;
		}) => Promise<void>;
		/**
		 * This skips the origin check for all requests.
		 *
		 * set to true by default for `test` environments and `false`
		 * for other environments.
		 *
		 * It's inferred from the `options.advanced?.disableCSRFCheck`
		 * option or `options.advanced?.disableOriginCheck` option.
		 *
		 * @default false
		 */
		skipOriginCheck: boolean;
		/**
		 * This skips the CSRF check for all requests.
		 *
		 * This is inferred from the `options.advanced?.
		 * disableCSRFCheck` option.
		 *
		 * @default false
		 */
		skipCSRFCheck: boolean;
	};
