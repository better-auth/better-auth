import type { AsyncLocalStorage } from "node:async_hooks";
import { getAsyncLocalStorage } from "@better-auth/core/async_hooks";
import type {
	AtomicWriteOperation,
	AtomicWriteResult,
	DBAdapter,
	DBTransactionAdapter,
} from "../db/adapter";
import { BetterAuthError } from "../error";
import type { BetterAuthOptions } from "../types";
import { __getBetterAuthGlobal } from "./global";

type StoredAdapter = DBTransactionAdapter<BetterAuthOptions>;

type HookContext = {
	adapter: StoredAdapter;
	pendingHooks: Array<() => Promise<void>>;
	isTransactionActive: boolean;
};

const ensureAsyncStorage = async () => {
	const betterAuthGlobal = __getBetterAuthGlobal();
	if (!betterAuthGlobal.context.adapterAsyncStorage) {
		const AsyncLocalStorage = await getAsyncLocalStorage();
		betterAuthGlobal.context.adapterAsyncStorage = new AsyncLocalStorage();
	}
	return betterAuthGlobal.context
		.adapterAsyncStorage as AsyncLocalStorage<HookContext>;
};

/**
 * This is for internal use only. Most users should use `getCurrentAdapter` instead.
 *
 * It is exposed for advanced use cases where you need direct access to the AsyncLocalStorage instance.
 */
export const getCurrentDBAdapterAsyncLocalStorage = async () => {
	return ensureAsyncStorage();
};

export const getCurrentAdapter = async <
	Options extends BetterAuthOptions = BetterAuthOptions,
>(
	fallback: DBTransactionAdapter<Options>,
): Promise<DBTransactionAdapter<Options>> => {
	return ensureAsyncStorage()
		.then((als) => {
			const store = als.getStore();
			return (
				(store?.adapter as DBTransactionAdapter<Options> | undefined) ||
				fallback
			);
		})
		.catch(() => {
			return fallback;
		});
};

export const runWithAdapter = async <
	R,
	Options extends BetterAuthOptions = BetterAuthOptions,
>(
	adapter: DBAdapter<Options>,
	fn: () => R,
): Promise<R> => {
	let called = false;
	return ensureAsyncStorage()
		.then(async (als) => {
			called = true;
			const pendingHooks: Array<() => Promise<void>> = [];
			let result: Awaited<R>;
			let error: unknown;
			let hasError = false;
			try {
				result = await als.run(
					{
						adapter: adapter as unknown as StoredAdapter,
						pendingHooks,
						isTransactionActive: false,
					},
					fn,
				);
			} catch (err) {
				error = err;
				hasError = true;
			}
			// Execute pending hooks after the function completes (even if it threw)
			for (const hook of pendingHooks) {
				await hook();
			}
			if (hasError) {
				throw error;
			}
			return result!;
		})
		.catch((err) => {
			if (!called) {
				return fn();
			}
			throw err;
		});
};

export const runWithTransaction = async <
	R,
	Options extends BetterAuthOptions = BetterAuthOptions,
>(
	adapter: DBAdapter<Options>,
	fn: () => R,
): Promise<R> => {
	let called = false;
	return ensureAsyncStorage()
		.then(async (als) => {
			called = true;
			const store = als.getStore();
			if (store?.isTransactionActive) {
				return fn();
			}
			const pendingHooks: Array<() => Promise<void>> = [];
			let result: Awaited<R>;
			let error: unknown;
			let hasError = false;
			try {
				result = await adapter.transaction(async (trx) => {
					return als.run(
						{
							adapter: trx as unknown as StoredAdapter,
							pendingHooks,
							isTransactionActive: true,
						},
						fn,
					);
				});
			} catch (e) {
				hasError = true;
				error = e;
			}
			if (hasError) {
				throw error;
			}
			for (const hook of pendingHooks) {
				await hook();
			}
			return result!;
		})
		.catch((err) => {
			if (!called) {
				return fn();
			}
			throw err;
		});
};

/** Returns whether an adapter exposes a real transaction callback. */
export function hasNativeTransactionSupport<
	Options extends BetterAuthOptions = BetterAuthOptions,
>(adapter: Pick<DBAdapter<Options>, "options">): boolean {
	return typeof adapter.options?.adapterConfig.transaction === "function";
}

/** Stable error code for adapters that cannot commit a multi-record mutation. */
export const ATOMIC_WRITES_UNSUPPORTED = "ATOMIC_WRITES_UNSUPPORTED" as const;

/** An atomic mutation rejected before hooks or writes because no capability exists. */
export type AtomicWritesUnsupportedError = BetterAuthError & {
	readonly code: typeof ATOMIC_WRITES_UNSUPPORTED;
	readonly adapterId: string;
};

/** A predeclared atomic write set and its post-commit result resolver. */
export type AtomicMutationPlan<R> = {
	operations: readonly AtomicWriteOperation[];
	afterCommit: (results: readonly AtomicWriteResult[]) => R | Promise<R>;
};

/** Returns whether an unknown error reports missing atomic-write support. */
export function isAtomicWritesUnsupportedError(
	error: unknown,
): error is AtomicWritesUnsupportedError {
	return (
		error instanceof BetterAuthError &&
		"code" in error &&
		error.code === ATOMIC_WRITES_UNSUPPORTED
	);
}

const createAtomicWritesUnsupportedError = <
	Options extends BetterAuthOptions = BetterAuthOptions,
>(
	adapter: Pick<DBAdapter<Options>, "id">,
): AtomicWritesUnsupportedError => {
	return Object.assign(
		new BetterAuthError(
			`Adapter "${adapter.id}" cannot commit this mutation atomically. Configure a native transaction or implement commitAtomicWrites.`,
		),
		{
			code: ATOMIC_WRITES_UNSUPPORTED,
			adapterId: adapter.id,
		},
	);
};

/**
 * Run a multi-record mutation through a real transaction or a declarative
 * atomic-write capability. Adapters without either capability fail before
 * either mutation branch is invoked.
 */
export async function runAtomicMutation<
	R,
	Options extends BetterAuthOptions = BetterAuthOptions,
>(
	adapter: DBAdapter<Options>,
	mutation: {
		runInTransaction: () => Promise<R>;
		prepareAtomicWrites: () => Promise<AtomicMutationPlan<R>>;
	},
): Promise<R> {
	if (hasNativeTransactionSupport(adapter)) {
		return runWithTransaction(adapter, mutation.runInTransaction);
	}

	const commitAtomicWrites = adapter.commitAtomicWrites;
	if (!commitAtomicWrites) {
		throw createAtomicWritesUnsupportedError(adapter);
	}

	const atomicWritePlan = await mutation.prepareAtomicWrites();
	if (atomicWritePlan.operations.length === 0) {
		return atomicWritePlan.afterCommit([]);
	}
	const committedResults = await commitAtomicWrites(atomicWritePlan.operations);
	return atomicWritePlan.afterCommit(committedResults);
}

/**
 * Queue a hook to be executed after the current transaction commits.
 * If not in a transaction, the hook will execute immediately.
 */
export const queueAfterTransactionHook = async (
	hook: () => Promise<void>,
	options?: {
		/** Handles a queued hook failure after the surrounding work has committed. */
		onError?: (error: unknown) => void | Promise<void>;
	},
): Promise<void> => {
	const executeHook = async () => {
		try {
			await hook();
		} catch (error) {
			if (!options?.onError) throw error;
			await options.onError(error);
		}
	};
	let storage: Awaited<ReturnType<typeof ensureAsyncStorage>>;
	try {
		storage = await ensureAsyncStorage();
	} catch {
		return executeHook();
	}

	const store = storage.getStore();
	if (!store?.isTransactionActive) return executeHook();
	store.pendingHooks.push(executeHook);
};
