import type { AsyncLocalStorage } from "@better-auth/core/async_hooks";
import { getAsyncLocalStorage } from "@better-auth/core/async_hooks";
import type { DBAdapter, DBTransactionAdapter } from "../db/adapter";
import { runtimeSchemaCheckFor } from "../db/schema-check";
import { logger } from "../env";
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
	const existing = betterAuthGlobal.context.adapterAsyncStorage;
	if (existing) {
		return existing as AsyncLocalStorage<HookContext>;
	}
	const AsyncLocalStorage = await getAsyncLocalStorage();
	betterAuthGlobal.context.adapterAsyncStorage ??= new AsyncLocalStorage();
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

/**
 * Wraps a transaction adapter so the first error that `isRetryableError`
 * accepts is remembered, even if the caller catches it.
 */
const trackRetryableErrors = (
	trx: StoredAdapter,
	isRetryableError: (error: unknown) => boolean,
	abort: { failed: boolean; error?: unknown },
): StoredAdapter => {
	const track = (error: unknown): never => {
		if (!abort.failed && isRetryableError(error)) {
			abort.failed = true;
			abort.error = error;
		}
		throw error;
	};
	return new Proxy(trx, {
		get(target, property, receiver) {
			const value = Reflect.get(target, property, receiver);
			if (typeof value !== "function") return value;
			return (...args: unknown[]) => {
				try {
					const result = value.apply(target, args);
					return result instanceof Promise ? result.catch(track) : result;
				} catch (error) {
					return track(error);
				}
			};
		},
	});
};

/**
 * Runs `fn` in a transaction on `adapter`, joining the current one when
 * already inside it, then runs the hooks queued with
 * `queueAfterTransactionHook` once the work commits.
 *
 * When the adapter has no real transaction (`transaction: false`), writes are
 * applied as they happen and cannot roll back, so queued hooks also run when
 * `fn` throws. The original error is still rethrown; a hook failure on that
 * path goes to `onAfterCommitHookError`, or is logged when none is given.
 */
export const runWithTransaction = async <
	R,
	Options extends BetterAuthOptions = BetterAuthOptions,
>(
	adapter: DBAdapter<Options>,
	fn: () => R,
	options?: {
		onAfterCommitHookError?: (error: unknown) => void | Promise<void>;
	},
): Promise<R> => {
	let called = false;
	return ensureAsyncStorage()
		.then(async (als) => {
			called = true;
			const store = als.getStore();
			if (store?.isTransactionActive) {
				return fn();
			}
			// Settle the schema verdict before this transaction holds the
			// connection a single-connection store would need for the lookup.
			const pendingSchemaCheck = runtimeSchemaCheckFor(adapter)?.();
			if (pendingSchemaCheck) await pendingSchemaCheck;
			let pendingHooks: Array<() => Promise<void>> = [];
			let result: Awaited<R>;
			let error: unknown;
			let hasError = false;
			try {
				result = await adapter.transaction(async (trx) => {
					// An adapter may run this callback again after a transient abort.
					// Only the hooks of the attempt that commits may run.
					pendingHooks = [];
					const { isRetryableError } = adapter;
					if (!isRetryableError) {
						return als.run(
							{
								adapter: trx as unknown as StoredAdapter,
								pendingHooks,
								isTransactionActive: true,
							},
							fn,
						);
					}
					// Code inside `fn` may catch a database error and throw its own, or
					// carry on without it. If the adapter marked that error as
					// retryable, the transaction is already aborted, so the adapter
					// gets the original error back and can run the callback again.
					const abort: { failed: boolean; error?: unknown } = {
						failed: false,
					};
					let value: Awaited<R>;
					try {
						value = await als.run(
							{
								adapter: trackRetryableErrors(
									trx as unknown as StoredAdapter,
									isRetryableError,
									abort,
								),
								pendingHooks,
								isTransactionActive: true,
							},
							fn,
						);
					} catch (e) {
						throw abort.failed ? abort.error : e;
					}
					if (abort.failed) throw abort.error;
					return value;
				});
			} catch (e) {
				hasError = true;
				error = e;
			}
			const runPendingHooks = async (unhandledErrors: "throw" | "log") => {
				for (const hook of pendingHooks) {
					try {
						await hook();
					} catch (hookError) {
						if (!options?.onAfterCommitHookError) {
							if (unhandledErrors === "throw") throw hookError;
							try {
								logger.error(
									"Failed to run an after-commit hook for work that could not roll back",
									hookError,
								);
							} catch {
								// A failing logger must not skip later hooks or replace the original error.
							}
							continue;
						}
						try {
							await options.onAfterCommitHookError(hookError);
						} catch {
							// Reporting cannot roll back committed work or suppress later hooks.
						}
					}
				}
			};
			if (hasError) {
				// Without a real transaction (`transaction: false`), each write was
				// applied directly and nothing rolled back, so the hooks queued for
				// those writes still have to run. The original error wins over theirs.
				if (adapter.options?.adapterConfig.transaction === false) {
					await runPendingHooks("log");
				}
				throw error;
			}
			await runPendingHooks("throw");
			return result!;
		})
		.catch((err) => {
			if (!called) {
				return fn();
			}
			throw err;
		});
};

/**
 * Queue a hook to be executed after the current transaction commits.
 * If not in a transaction, the hook will execute immediately.
 *
 * When the adapter has no real transaction (`transaction: false`), the hook
 * also runs if the surrounding work fails, since its writes were kept.
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
