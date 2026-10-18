import { DatabaseSync } from "node:sqlite";
import type { SecondaryStorage } from "@better-auth/core/db";
import { describe, expect, it, vi } from "vitest";
import { init } from "../context/init";
import type { BetterAuthOptions } from "../types";
import { getMigrations } from "./get-migration";

/**
 * `ensureAsyncStorage` builds its `AsyncLocalStorage` through
 * `getAsyncLocalStorage`, which rejects on a runtime that cannot construct one —
 * Convex, or an edge runtime without the Node compatibility flag. There is then
 * no after-commit hook queue at all, so the internal adapter has to keep working
 * without one instead of treating its absence as a failure.
 *
 * The mock is file-scoped on purpose: every other internal-adapter test needs a
 * working queue, and this is the only way to take the queue away from
 * `transaction.ts` without editing it.
 */
vi.mock("@better-auth/core/async_hooks", () => ({
	getAsyncLocalStorage: () =>
		Promise.reject(new Error("AsyncLocalStorage is not available")),
}));

const SECONDARY_STORAGE_UNAVAILABLE = "secondary storage is unavailable";

/**
 * Drops the storage `ensureAsyncStorage` memoises on the process-wide Better Auth
 * singleton, so the next call has to build one — and fails to.
 */
function forgetAdapterAsyncStorage() {
	const betterAuthGlobal = (
		globalThis as unknown as Record<
			symbol,
			{ context: Record<string, unknown> } | undefined
		>
	)[Symbol.for("better-auth:global")];
	if (!betterAuthGlobal) throw new Error("the Better Auth global is missing");
	betterAuthGlobal.context.adapterAsyncStorage = undefined;
}

function createSecondaryStorage(
	store: Map<string, string>,
	shouldFail: (key: string) => boolean,
) {
	const deleteAttempts: string[] = [];
	const storage = {
		set(key, value) {
			store.set(key, value);
		},
		get(key) {
			return store.get(key) || null;
		},
		getAndDelete(key) {
			const value = store.get(key) || null;
			store.delete(key);
			return value;
		},
		increment(key) {
			const count = Number(store.get(key) ?? 0) + 1;
			store.set(key, String(count));
			return count;
		},
		delete(key) {
			deleteAttempts.push(key);
			// The index has to stay writable or the eviction stops at the
			// reconciliation instead of the token.
			if (shouldFail(key) && !key.startsWith("active-sessions-")) {
				throw new Error(SECONDARY_STORAGE_UNAVAILABLE);
			}
			store.delete(key);
		},
	} satisfies SecondaryStorage;
	return { deleteAttempts, storage };
}

function errorsLogged(logged: [string, string][]) {
	return logged.filter(([level]) => level === "error");
}

async function setupWithoutHookQueue(shouldFail: (key: string) => boolean) {
	const store = new Map<string, string>();
	const { deleteAttempts, storage } = createSecondaryStorage(store, shouldFail);
	const logged: [string, string][] = [];
	const testOpts = {
		database: new DatabaseSync(":memory:"),
		secondaryStorage: storage,
		logger: {
			log(level, message) {
				logged.push([level, message]);
			},
		},
	} satisfies BetterAuthOptions;
	await (await getMigrations(testOpts)).runMigrations();
	const testCtx = await init(testOpts);
	const user = await testCtx.internalAdapter.createUser(
		{
			name: "no-hook-queue-user",
			email: "no-hook-queue@example.com",
		},
		{ method: "test" },
	);
	const session = await testCtx.internalAdapter.createSession(user.id);

	// Everything above ran with a working queue. Drop it, so the revocation below
	// degrades the way it does on a runtime that cannot construct one.
	forgetAdapterAsyncStorage();
	return { deleteAttempts, logged, session, store, testCtx };
}

describe("internal adapter without an after-commit hook queue", () => {
	/**
	 * With no queue to read, `queueAfterTransactionHook` runs the eviction inline
	 * instead of deferring it. A failure there still has to reach the caller: the
	 * session the cache keeps serving is exactly what the caller revoked.
	 *
	 * @see https://github.com/better-auth/better-auth/issues/11326
	 */
	it("reports the eviction failure when there is no hook queue to defer into", async () => {
		let storageDown = false;
		const { deleteAttempts, logged, session, store, testCtx } =
			await setupWithoutHookQueue(() => storageDown);

		storageDown = true;
		await expect(
			testCtx.internalAdapter.deleteUserSessions(session.userId),
		).rejects.toThrow(SECONDARY_STORAGE_UNAVAILABLE);

		expect(deleteAttempts.filter((key) => key === session.token)).toHaveLength(
			1,
		);
		expect(store.has(session.token)).toBe(true);
		expect(errorsLogged(logged)).toContainEqual([
			"error",
			"Failed to delete committed user sessions from secondary storage",
		]);

		// The end state is retryable, exactly as it is with a queue in scope.
		storageDown = false;
		await expect(
			testCtx.internalAdapter.deleteUserSessions(session.userId),
		).resolves.toBeUndefined();
		expect(store.has(session.token)).toBe(false);
	});

	/**
	 * The same degradation with a healthy store. The eviction has nothing to
	 * reorder, so it must run rather than be re-queued into a queue nothing
	 * drains.
	 *
	 * @see https://github.com/better-auth/better-auth/issues/11326
	 */
	it("still evicts cached sessions when there is no hook queue to defer into", async () => {
		const { deleteAttempts, logged, session, store, testCtx } =
			await setupWithoutHookQueue(() => false);

		await testCtx.internalAdapter.deleteUserSessions(session.userId);

		expect(deleteAttempts.filter((key) => key === session.token)).toHaveLength(
			1,
		);
		expect(store.has(session.token)).toBe(false);
		expect(errorsLogged(logged)).toEqual([]);
	});
});
