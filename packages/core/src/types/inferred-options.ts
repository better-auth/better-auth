import type { Account, Session, User, Verification } from "../db";
import type { GenericEndpointContext } from "./context";
import type { BetterAuthOptions } from "./init-options";

type Optional<T> = {
	[P in keyof T]?: T[P] | undefined;
};

type AuthModelsConfig = {
	user?: unknown;
	session?: unknown;
	account?: unknown;
	verification?: unknown;
	plugins?: unknown;
};

type BeforeCreateHook<T> = (
	data: T,
	context: GenericEndpointContext | null,
) => Promise<
	| boolean
	| void
	| {
			data: Optional<T>;
	  }
>;

type BeforeUpdateHook<T> = (
	data: Partial<T>,
	context: GenericEndpointContext | null,
) => Promise<
	| boolean
	| void
	| {
			data: Optional<T>;
	  }
>;

type BeforeDeleteHook<T> = (
	data: T,
	context: GenericEndpointContext | null,
) => Promise<boolean | void>;

type AfterHook<T> = (
	data: T,
	context: GenericEndpointContext | null,
) => Promise<void>;

type ModelHooks<T> = {
	create?: {
		/**
		 * Called before a row is created.
		 * Return `false` to abort, or `{ data }` to replace the insert payload.
		 */
		before?: BeforeCreateHook<T>;
		/**
		 * Called after a row is created.
		 */
		after?: AfterHook<T>;
	};
	update?: {
		/**
		 * Called before a row is updated.
		 * Return `false` to abort, or `{ data }` to replace the update payload.
		 */
		before?: BeforeUpdateHook<T>;
		/**
		 * Called after a row is updated.
		 */
		after?: AfterHook<T>;
	};
	delete?: {
		/**
		 * Called before a row is deleted.
		 * Return `false` to abort.
		 */
		before?: BeforeDeleteHook<T>;
		/**
		 * Called after a row is deleted.
		 */
		after?: AfterHook<T>;
	};
};

type AsUserOptions<T> = T extends BetterAuthOptions["user"]
	? T
	: BetterAuthOptions["user"];
type AsSessionOptions<T> = T extends BetterAuthOptions["session"]
	? T
	: BetterAuthOptions["session"];
type AsAccountOptions<T> = T extends BetterAuthOptions["account"]
	? T
	: BetterAuthOptions["account"];
type AsVerificationOptions<T> = T extends BetterAuthOptions["verification"]
	? T
	: BetterAuthOptions["verification"];

/**
 * Same bound as `User` / `Session` / `Account` / `Verification` plugin params.
 * Use `infer P extends …` so the result is known to satisfy that bound (plain
 * `T extends X ? T : …` can leave indexed `O["plugins"]` as `unknown` for
 * constraint checking).
 */
type ModelPlugins =
	| BetterAuthOptions["plugins"]
	| readonly unknown[]
	| undefined;

type AsPlugins<T> = T extends infer P extends ModelPlugins ? P : undefined;

/**
 * Database hooks typed from the resolved auth options (plugins + additionalFields).
 */
export type InferDatabaseHooks<O extends AuthModelsConfig> = {
	user?: ModelHooks<User<AsUserOptions<O["user"]>, AsPlugins<O["plugins"]>>>;
	session?: ModelHooks<
		Session<AsSessionOptions<O["session"]>, AsPlugins<O["plugins"]>>
	>;
	account?: ModelHooks<
		Account<AsAccountOptions<O["account"]>, AsPlugins<O["plugins"]>>
	>;
	verification?: ModelHooks<
		Verification<
			AsVerificationOptions<O["verification"]>,
			AsPlugins<O["plugins"]>
		>
	>;
};
