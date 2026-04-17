import type { CookieOptions, EndpointContext } from "better-call";
import type {
	Account,
	BetterAuthDBSchema,
	ModelNames,
	SecondaryStorage,
	Session,
	SignInAttempt,
	User,
	Verification,
} from "../db";
import type { DBAdapter, Where } from "../db/adapter";
import type { createLogger } from "../env";
import type { OAuthProvider } from "../oauth2";
import type { BetterAuthCookie, BetterAuthCookies } from "./cookie";
import type { Awaitable, LiteralString } from "./helper";
import type {
	BetterAuthOptions,
	BetterAuthRateLimitOptions,
} from "./init-options";
import type { BetterAuthPlugin } from "./plugin";
import type { SecretConfig } from "./secret";

/**
 * @internal
 */
type InferPluginID<O extends BetterAuthOptions> =
	O["plugins"] extends Array<infer P>
		? P extends BetterAuthPlugin
			? P["id"]
			: never
		: never;

/**
 * @internal
 */
type InferPluginOptions<
	O extends BetterAuthOptions,
	ID extends BetterAuthPluginRegistryIdentifier | LiteralString,
> =
	O["plugins"] extends Array<infer P>
		? P extends BetterAuthPlugin
			? P["id"] extends ID
				? P extends { options: infer O }
					? O
					: never
				: never
			: never
		: never;

/**
 * Mutators are defined in each plugin
 *
 * @example
 * ```ts
 * interface MyPluginOptions {
 *   useFeature: boolean
 * }
 *
 * const createMyPlugin = <Options extends MyPluginOptions>(options?: Options) => ({
 *   id: 'my-plugin',
 *   version: '1.0.0',
 *   options,
 * } satisfies BetterAuthPlugin);
 *
 * declare module "@better-auth/core" {
 *  interface BetterAuthPluginRegistry<AuthOptions, Options> {
 *    'my-plugin': {
 *      creator: Options extends MyPluginOptions ? typeof createMyPlugin<Options>: typeof createMyPlugin
 *    }
 *  }
 * }
 * ```
 */
// biome-ignore lint/correctness/noUnusedVariables: Auth and Context is used in the declaration merging
export interface BetterAuthPluginRegistry<AuthOptions, Options> {}
export type BetterAuthPluginRegistryIdentifier = keyof BetterAuthPluginRegistry<
	unknown,
	unknown
>;

export type GenericEndpointContext<
	Options extends BetterAuthOptions = BetterAuthOptions,
> = EndpointContext<string, any> & {
	context: AuthContext<Options>;
};

export type PendingSignInAttempt = SignInAttempt & {
	user?: User & Record<string, any>;
};

export type FinalizedSignIn = {
	session: Session & Record<string, any>;
	user: User & Record<string, any>;
	attemptId?: string | undefined;
};

/**
 * Registry of sign-in challenge kinds. Plugins that pause sign-in before a
 * session is issued augment this interface with their own discriminant key so
 * the `SignInChallenge` union widens accordingly.
 *
 * ## Contract for challenge authors
 *
 * 1. Pick a unique string discriminant (e.g. `"two-factor"`) and declare it
 *    via module augmentation. The value type becomes the shape carried on the
 *    resume URL and returned to clients.
 * 2. Include an `attemptId: string` field. The resolver persists the pending
 *    attempt under this id (`internalAdapter.createSignInAttempt`), and your
 *    resume endpoint looks it up via `findSignInAttempt`.
 * 3. Any per-request context needed at resume time goes on the opaque
 *    `SignInAttempt.payload` bag, not in a cookie.
 * 4. A primary factor may request that your challenge be skipped by passing
 *    its discriminant in `resolveSignIn({ skipChallenges: [...] })`.
 *
 * @example
 * ```ts
 * declare module "@better-auth/core" {
 *   interface BetterAuthSignInChallengeRegistry {
 *     "two-factor": {
 *       attemptId: string;
 *       availableMethods: TwoFactorMethod[];
 *     };
 *   }
 * }
 * ```
 */
export interface BetterAuthSignInChallengeRegistry {}

export type SignInChallenge = {
	[K in keyof BetterAuthSignInChallengeRegistry]: {
		type: K;
	} & BetterAuthSignInChallengeRegistry[K];
}[keyof BetterAuthSignInChallengeRegistry];

/**
 * Discriminated envelope returned by the sign-in resolver.
 * `session` means a session was issued (commit-on-success scheduled).
 * `challenge` means sign-in is paused pending another step.
 */
export type SignInResolution<TUser extends User = User> =
	| {
			type: "session";
			session: Session & Record<string, any>;
			user: TUser & Record<string, any>;
	  }
	| {
			type: "challenge";
			challenge: SignInChallenge;
	  };

export interface InternalAdapter<
	_Options extends BetterAuthOptions = BetterAuthOptions,
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

	listSessions(
		userId: string,
		options?: { onlyActiveSessions?: boolean | undefined } | undefined,
	): Promise<Session[]>;

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
		options?:
			| {
					onlyActiveSessions?: boolean | undefined;
			  }
			| undefined,
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
	): Promise<{
		user: User;
		linkedAccount: Account | null;
		accounts: Account[];
	} | null>;

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

	deleteVerificationByIdentifier(identifier: string): Promise<void>;

	updateVerificationByIdentifier(
		identifier: string,
		data: Partial<Verification>,
	): Promise<Verification>;

	createSignInAttempt(
		data: Omit<
			SignInAttempt,
			"createdAt" | "failedVerifications" | "id" | "updatedAt"
		> &
			Partial<SignInAttempt>,
	): Promise<SignInAttempt>;

	findSignInAttempt(id: string): Promise<SignInAttempt | null>;

	updateSignInAttempt(
		id: string,
		data: Partial<Pick<SignInAttempt, "loginMethod">>,
	): Promise<SignInAttempt | null>;

	deleteSignInAttempt(id: string): Promise<void>;

	/**
	 * Atomically delete a sign-in attempt and return the deleted row. Uses
	 * `deleteMany` row-count as a concurrency fence: under concurrent callers,
	 * exactly one observes a delete count of 1 and receives the row; all
	 * others receive null. Returns null if the attempt does not exist.
	 */
	consumeSignInAttempt(id: string): Promise<SignInAttempt | null>;

	/**
	 * Increment the attempt's `failedVerifications` counter and, when the
	 * threshold is reached, set `lockedAt`. Returns the updated row or null
	 * if the attempt no longer exists.
	 */
	recordSignInAttemptFailure(
		id: string,
		options: { maxAttempts: number },
	): Promise<SignInAttempt | null>;
}

type CreateCookieGetterFn = (
	cookieName: string,
	overrideAttributes?: Partial<CookieOptions> | undefined,
) => BetterAuthCookie;

type CheckPasswordFn<Options extends BetterAuthOptions = BetterAuthOptions> = (
	userId: string,
	ctx: GenericEndpointContext<Options>,
) => Promise<boolean>;

export type PluginContext<Options extends BetterAuthOptions> = {
	getPlugin: <
		ID extends BetterAuthPluginRegistryIdentifier | LiteralString,
		PluginOptions extends InferPluginOptions<Options, ID>,
	>(
		pluginId: ID,
	) =>
		| (ID extends BetterAuthPluginRegistryIdentifier
				? BetterAuthPluginRegistry<Options, PluginOptions>[ID] extends {
						creator: infer C;
					}
					? C extends (...args: any[]) => infer R
						? R
						: never
					: never
				: BetterAuthPlugin)
		| null;
	/**
	 * Checks if a plugin is enabled by its ID.
	 *
	 * @param pluginId - The ID of the plugin to check
	 * @returns `true` if the plugin is enabled, `false` otherwise
	 *
	 * @example
	 * ```ts
	 * if (ctx.context.hasPlugin("organization")) {
	 *   // organization plugin is enabled
	 * }
	 * ```
	 */
	hasPlugin: <ID extends BetterAuthPluginRegistryIdentifier | LiteralString>(
		pluginId: ID,
	) => ID extends InferPluginID<Options> ? true : boolean;
};

export type InfoContext = {
	appName: string;
	baseURL: string;
	version: string;
};

export type AuthContext<Options extends BetterAuthOptions = BetterAuthOptions> =
	PluginContext<Options> &
		InfoContext & {
			options: Options;
			trustedOrigins: string[];
			/**
			 * Resolved list of trusted providers for account linking.
			 * Populated from "account.accountLinking.trustedProviders" (supports static array or async function).
			 */
			trustedProviders: string[];
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
			 * Any session created during the current request, regardless of origin
			 * (sign-in, sign-up, anonymous upgrade, device-authorization, etc.).
			 * Cookie publication happens later during request finalization.
			 * Consumers that care only about "a session exists" (bearer, jwt, mcp,
			 * multi-session, one-time-token, oidc-provider) read this.
			 */
			newSession: {
				session: Session & Record<string, any>;
				user: User & Record<string, any>;
			} | null;
			/**
			 * Set when a sign-in flow committed in this request. Narrower than
			 * `newSession`: sign-up, anonymous upgrades, and device-auth do not
			 * populate it. Consumers that care about "a sign-in completed" (e.g.
			 * last-login-method, anonymous linking) read this.
			 */
			finalizedSignIn: FinalizedSignIn | null;
			/**
			 * Request-scoped paused sign-in state. Not published auth state;
			 * exists only so the current request can finalize or replay work for
			 * the attempt that actually completed.
			 */
			signInAttempt: PendingSignInAttempt | null;
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
			setFinalizedSignIn: (signIn: FinalizedSignIn | null) => void;
			setSignInAttempt: (attempt: PendingSignInAttempt | null) => void;
			successFinalizers?: Array<() => Promise<void> | void>;
			addSuccessFinalizer?: (finalizer: () => Promise<void> | void) => void;
			socialProviders: OAuthProvider[];
			authCookies: BetterAuthCookies;
			logger: ReturnType<typeof createLogger>;
			rateLimit: {
				enabled: boolean;
				window: number;
				max: number;
				storage: "memory" | "database" | "secondary-storage";
			} & Omit<
				BetterAuthRateLimitOptions,
				"enabled" | "window" | "max" | "storage"
			>;
			adapter: DBAdapter<Options>;
			internalAdapter: InternalAdapter<Options>;
			createAuthCookie: CreateCookieGetterFn;
			secret: string;
			secretConfig: string | SecretConfig;
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
			 * Skip origin check for requests.
			 *
			 * - `true`: Skip for ALL requests (DANGEROUS - disables CSRF protection)
			 * - `string[]`: Skip only for specific paths (e.g., SAML callbacks)
			 * - `false`: Enable origin check (default)
			 *
			 * Paths support prefix matching (e.g., "/sso/saml2/callback" matches
			 * "/sso/saml2/callback/provider-name").
			 *
			 * @default false (true in test environments)
			 */
			skipOriginCheck: boolean | string[];
			/**
			 * This skips the CSRF check for all requests.
			 *
			 * This is inferred from the `options.advanced?.
			 * disableCSRFCheck` option.
			 *
			 * @default false
			 */
			skipCSRFCheck: boolean;
			/**
			 * Background task handler for deferred operations.
			 *
			 * This is inferred from the `options.advanced?.backgroundTasks?.handler` option.
			 * Defaults to a no-op that just runs the promise.
			 */
			runInBackground: (promise: Promise<unknown>) => void;
			/**
			 * Runs a task in the background if `runInBackground` is configured,
			 * otherwise awaits the task directly.
			 *
			 * This is useful for operations like sending emails where we want
			 * to avoid blocking the response when possible (for timing attack
			 * mitigation), but still ensure the operation completes.
			 */
			runInBackgroundOrAwait: (
				promise: Promise<unknown> | void,
			) => Awaitable<unknown>;
		};
