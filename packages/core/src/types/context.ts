import type { CookieOptions, EndpointContext } from "better-call";
import type {
	Account,
	BetterAuthDBSchema,
	SecondaryStorage,
	Session,
	User,
	Verification,
} from "../db";
import type { DBAdapter, Where } from "../db/adapter";
import type { DBPreservedModels } from "../db/type";
import { createLogger } from "../env";
import type { OAuthProvider } from "../oauth2";
import type { BetterAuthCookies } from "./cookie";
import type { LiteralUnion } from "./helper";
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
		context?: GenericEndpointContext<Options>,
	): Promise<{ user: User; account: Account }>;

	createUser<T extends Record<string, any>>(
		user: Omit<User, "id" | "createdAt" | "updatedAt" | "emailVerified"> &
			Partial<User> &
			Record<string, any>,
		context?: GenericEndpointContext<Options>,
	): Promise<T & User>;

	createAccount<T extends Record<string, any>>(
		account: Omit<Account, "id" | "createdAt" | "updatedAt"> &
			Partial<Account> &
			T,
		context?: GenericEndpointContext<Options>,
	): Promise<T & Account>;

	listSessions(userId: string): Promise<Session[]>;

	listUsers(
		limit?: number,
		offset?: number,
		sortBy?: { field: string; direction: "asc" | "desc" },
		where?: Where[],
	): Promise<User[]>;

	countTotalUsers(where?: Where[]): Promise<number>;

	deleteUser(
		userId: string,
		context?: GenericEndpointContext<Options>,
	): Promise<void>;

	createSession(
		userId: string,
		ctx: GenericEndpointContext<Options>,
		dontRememberMe?: boolean,
		override?: Partial<Session> & Record<string, any>,
		overrideAll?: boolean,
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
		context?: GenericEndpointContext<Options>,
	): Promise<Session | null>;

	deleteSession(token: string): Promise<void>;

	deleteAccounts(
		userId: string,
		context?: GenericEndpointContext<Options>,
	): Promise<void>;

	deleteAccount(
		accountId: string,
		context?: GenericEndpointContext<Options>,
	): Promise<void>;

	deleteSessions(
		userIdOrSessionTokens: string | string[],
		context?: GenericEndpointContext<Options>,
	): Promise<void>;

	findOAuthUser(
		email: string,
		accountId: string,
		providerId: string,
	): Promise<{ user: User; accounts: Account[] } | null>;

	findUserByEmail(
		email: string,
		options?: { includeAccounts: boolean },
	): Promise<{ user: User; accounts: Account[] } | null>;

	findUserById(userId: string): Promise<User | null>;

	linkAccount(
		account: Omit<Account, "id" | "createdAt" | "updatedAt"> & Partial<Account>,
		context?: GenericEndpointContext<Options>,
	): Promise<Account>;

	// fixme: any type
	updateUser(
		userId: string,
		data: Partial<User> & Record<string, any>,
		context?: GenericEndpointContext<Options>,
	): Promise<any>;

	updateUserByEmail(
		email: string,
		data: Partial<User & Record<string, any>>,
		context?: GenericEndpointContext<Options>,
	): Promise<User>;

	updatePassword(
		userId: string,
		password: string,
		context?: GenericEndpointContext<Options>,
	): Promise<void>;

	findAccounts(userId: string): Promise<Account[]>;

	findAccount(accountId: string): Promise<Account | null>;

	findAccountByProviderId(
		accountId: string,
		providerId: string,
	): Promise<Account | null>;

	findAccountByUserId(userId: string): Promise<Account[]>;

	updateAccount(
		id: string,
		data: Partial<Account>,
		context?: GenericEndpointContext<Options>,
	): Promise<Account>;

	createVerificationValue(
		data: Omit<Verification, "createdAt" | "id" | "updatedAt"> &
			Partial<Verification>,
		context?: GenericEndpointContext<Options>,
	): Promise<Verification>;

	findVerificationValue(identifier: string): Promise<Verification | null>;

	deleteVerificationValue(
		id: string,
		context?: GenericEndpointContext<Options>,
	): Promise<void>;

	deleteVerificationByIdentifier(
		identifier: string,
		context?: GenericEndpointContext<Options>,
	): Promise<void>;

	updateVerificationValue(
		id: string,
		data: Partial<Verification>,
		context?: GenericEndpointContext<Options>,
	): Promise<Verification>;
}

type CreateCookieGetterFn = (
	cookieName: string,
	overrideAttributes?: Partial<CookieOptions>,
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
		oauthConfig?: {
			/**
			 * This is dangerous and should only be used in dev or staging environments.
			 */
			skipStateCookieCheck?: boolean;
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
		};
		generateId: (options: {
			model: LiteralUnion<DBPreservedModels, string>;
			size?: number;
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
			anonymousId?: string;
			payload: Record<string, any>;
		}) => Promise<void>;
	};
