import type {
	Account,
	BetterAuthDBSchema,
	BetterAuthPluginDBSchema,
	SecondaryStorage,
	Session,
	User,
	Verification,
} from "../db";
import type { OAuthProvider } from "../oauth2";
import { createLogger } from "../env";
import type { DBAdapter, Where } from "../db/adapter";
import type { BetterAuthCookies } from "./cookie";
import type { DBPreservedModels } from "../db/type";
import type { LiteralUnion } from "./helper";
import type { CookieOptions, EndpointContext } from "better-call";
import type {
	BetterAuthOptions,
	BetterAuthRateLimitOptions,
} from "./init-options";
import type { schema } from "../db/schema";

export type GenericEndpointContext<
		Schema extends BetterAuthPluginDBSchema<typeof schema>,
		Options extends BetterAuthOptions<Schema> = BetterAuthOptions<Schema>,
	> = EndpointContext<string, any> & {
		context: AuthContext<Schema, Options>;
	};

export interface InternalAdapter<
		Schema extends BetterAuthPluginDBSchema<typeof schema>,
		Options extends BetterAuthOptions<Schema> = BetterAuthOptions<Schema>,
	> {
		createOAuthUser(
			user: Omit<User<Schema>, "id" | "createdAt" | "updatedAt">,
			account: Omit<
				Account<Schema>,
				"userId" | "id" | "createdAt" | "updatedAt"
			> &
				Partial<Account>,
			context?: GenericEndpointContext<Schema, Options>,
		): Promise<{ user: User<Schema>; account: Account<Schema> }>;

		createUser(
			user: Omit<
				User<Schema>,
				"id" | "createdAt" | "updatedAt" | "emailVerified"
			> &
				Partial<User<Schema>>,
			context?: GenericEndpointContext<Schema, Options>,
		): Promise<User<Schema>>;

		createAccount(
			account: Omit<Account<Schema>, "id" | "createdAt" | "updatedAt"> &
				Partial<Account<Schema>>,
			context?: GenericEndpointContext<Schema, Options>,
		): Promise<Account<Schema>>;

		listSessions(userId: string): Promise<Session<Schema>[]>;

		listUsers(
			limit?: number,
			offset?: number,
			sortBy?: { field: string; direction: "asc" | "desc" },
			where?: Where<Schema["user"]>[],
		): Promise<User<Schema>[]>;

		countTotalUsers(where?: Where<Schema["user"]>[]): Promise<number>;

		deleteUser(
			userId: string,
			context?: GenericEndpointContext<Schema, Options>,
		): Promise<void>;

		createSession(
			userId: string,
			ctx: GenericEndpointContext<Schema, Options>,
			dontRememberMe?: boolean,
			override?: Partial<Session<Schema>>,
			overrideAll?: boolean,
		): Promise<Session<Schema>>;

		findSession(token: string): Promise<{
			session: Session<Schema>;
			user: User<Schema>;
		} | null>;

		findSessions(
			sessionTokens: string[],
		): Promise<{ session: Session<Schema>; user: User<Schema> }[]>;

		updateSession(
			sessionToken: string,
			session: Partial<Session<Schema>>,
			context?: GenericEndpointContext<Schema, Options>,
		): Promise<Session<Schema> | null>;

		deleteSession(token: string): Promise<void>;

		deleteAccounts(
			userId: string,
			context?: GenericEndpointContext<Schema, Options>,
		): Promise<void>;

		deleteAccount(
			accountId: string,
			context?: GenericEndpointContext<Schema, Options>,
		): Promise<void>;

		deleteSessions(
			userIdOrSessionTokens: string | string[],
			context?: GenericEndpointContext<Schema, Options>,
		): Promise<void>;

		findOAuthUser(
			email: string,
			accountId: string,
			providerId: string,
		): Promise<{ user: User<Schema>; accounts: Account<Schema>[] } | null>;

		findUserByEmail(
			email: string,
			options?: { includeAccounts: boolean },
		): Promise<{ user: User<Schema>; accounts: Account<Schema>[] } | null>;

		findUserById(userId: string): Promise<User<Schema> | null>;

		linkAccount(
			account: Omit<Account<Schema>, "id" | "createdAt" | "updatedAt"> &
				Partial<Account<Schema>>,
			context?: GenericEndpointContext<Schema, Options>,
		): Promise<Account<Schema>>;

		// Fix me: any type
		updateUser(
			userId: string,
			data: Partial<User<Schema>> & Record<string, any>,
			context?: GenericEndpointContext<Schema, Options>,
		): Promise<User<Schema>>;

		updateUserByEmail(
			email: string,
			data: Partial<User<Schema> & Record<string, any>>,
			context?: GenericEndpointContext<Schema, Options>,
		): Promise<User<Schema>>;

		updatePassword(
			userId: string,
			password: string,
			context?: GenericEndpointContext<Schema, Options>,
		): Promise<void>;

		findAccounts(userId: string): Promise<Account<Schema>[]>;

		findAccount(accountId: string): Promise<Account<Schema> | null>;

		findAccountByProviderId(
			accountId: string,
			providerId: string,
		): Promise<Account<Schema> | null>;

		findAccountByUserId(userId: string): Promise<Account<Schema>[]>;

		updateAccount(
			id: string,
			data: Partial<Account<Schema>>,
			context?: GenericEndpointContext<Schema, Options>,
		): Promise<Account<Schema>>;

		createVerificationValue(
			data: Omit<Verification<Schema>, "createdAt" | "id" | "updatedAt"> &
				Partial<Verification<Schema>>,
			context?: GenericEndpointContext<Schema, Options>,
		): Promise<Verification<Schema>>;

		findVerificationValue(
			identifier: string,
		): Promise<Verification<Schema> | null>;

		deleteVerificationValue(
			id: string,
			context?: GenericEndpointContext<Schema, Options>,
		): Promise<void>;

		deleteVerificationByIdentifier(
			identifier: string,
			context?: GenericEndpointContext<Schema, Options>,
		): Promise<void>;

		updateVerificationValue(
			id: string,
			data: Partial<Verification>,
			context?: GenericEndpointContext<Schema, Options>,
		): Promise<Verification>;
	}

type CreateCookieGetterFn = (
	cookieName: string,
	overrideAttributes?: Partial<CookieOptions>,
) => {
	name: string;
	attributes: CookieOptions;
};

type CheckPasswordFn<
	Schema extends BetterAuthPluginDBSchema<typeof schema>,
	Options extends BetterAuthOptions<Schema> = BetterAuthOptions<Schema>,
> = (userId: string, ctx: GenericEndpointContext<Schema, Options>) => Promise<boolean>;

export type AuthContext<
		Schema extends BetterAuthPluginDBSchema<typeof schema>,
		Options extends BetterAuthOptions<Schema> = BetterAuthOptions<Schema>,
	> = {
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
			session: Session<Schema> & Record<string, any>;
			user: User & Record<string, any>;
		} | null;
		session: {
			session: Session<Schema> & Record<string, any>;
			user: User<Schema> & Record<string, any>;
		} | null;
		setNewSession: (
			session: {
				session: Session<Schema> & Record<string, any>;
				user: User<Schema> & Record<string, any>;
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
		adapter: DBAdapter<Schema, Options>;
		internalAdapter: InternalAdapter<Schema, Options>;
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
			checkPassword: CheckPasswordFn<Schema, Options>;
		};
		tables: BetterAuthDBSchema;
		runMigrations: () => Promise<void>;
		publishTelemetry: (event: {
			type: string;
			anonymousId?: string;
			payload: Record<string, any>;
		}) => Promise<void>;
	};
