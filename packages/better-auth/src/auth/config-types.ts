import type { BetterAuthOptions, InferDatabaseHooks } from "@better-auth/core";

/**
 * `const` type params infer readonly tuples; plugin endpoint inference uses
 * `extends Array` / mutable tuples — unwrap readonly without deep-mutating
 * plugin objects (which would break schema field inference).
 */
export type WritableTuple<T> = T extends readonly [...infer U] ? [...U] : T;

export type AuthModelsSlice<
	Plugins,
	UserConfig,
	SessionConfig,
	AccountConfig,
	VerificationConfig,
> = {
	plugins: WritableTuple<Plugins>;
	user: UserConfig;
	session: SessionConfig;
	account: AccountConfig;
	verification: VerificationConfig;
};

export type BetterAuthConfigInput<
	Plugins,
	UserConfig,
	SessionConfig,
	AccountConfig,
	VerificationConfig,
	Options extends BetterAuthOptions,
> = {
	plugins?: Plugins;
	user?: UserConfig;
	session?: SessionConfig;
	account?: AccountConfig;
	verification?: VerificationConfig;
	databaseHooks?: InferDatabaseHooks<
		AuthModelsSlice<
			Plugins,
			UserConfig,
			SessionConfig,
			AccountConfig,
			VerificationConfig
		>
	>;
} & Omit<Options, "databaseHooks">;

/**
 * True for `const` plugin/model slices (tuples / concrete objects). False for
 * widened `BetterAuthOptions` property types so `betterAuth(x as BetterAuthOptions)`
 * still returns `Auth`-compatible options.
 */
type IsConcreteSlice<T, Wide> = [T] extends [undefined]
	? false
	: [Wide] extends [T]
		? false
		: true;

/**
 * Resolved options stored on `Auth`. Starts from `Options` and only overrides
 * model slices that were provided as concrete config, so wide
 * `BetterAuthOptions` inputs stay assignable to `Auth`.
 */
export type ResolvedAuthOptions<
	Plugins,
	UserConfig,
	SessionConfig,
	AccountConfig,
	VerificationConfig,
	Options extends BetterAuthOptions,
> = Options &
	(IsConcreteSlice<
		Plugins,
		NonNullable<BetterAuthOptions["plugins"]>
	> extends true
		? { plugins: WritableTuple<Plugins> }
		: {}) &
	(IsConcreteSlice<
		UserConfig,
		NonNullable<BetterAuthOptions["user"]>
	> extends true
		? { user: UserConfig }
		: {}) &
	(IsConcreteSlice<
		SessionConfig,
		NonNullable<BetterAuthOptions["session"]>
	> extends true
		? { session: SessionConfig }
		: {}) &
	(IsConcreteSlice<
		AccountConfig,
		NonNullable<BetterAuthOptions["account"]>
	> extends true
		? { account: AccountConfig }
		: {}) &
	(IsConcreteSlice<
		VerificationConfig,
		NonNullable<BetterAuthOptions["verification"]>
	> extends true
		? { verification: VerificationConfig }
		: {});
