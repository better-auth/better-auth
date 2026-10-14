import type { DBAdapter } from "@better-auth/core/db/adapter";
import { describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../test-utils/test-instance";
import type { User } from "../types";
import { getWithHooks } from "./with-hooks";

/**
 * @see https://github.com/better-auth/better-auth/issues/11667
 */
describe("Issue #11667: deleteUser atomicity and deleteWithHooks error handling", () => {
	it("deleteWithHooks must propagate DB error when findMany fails instead of silently swallowing it", async () => {
		const mockAdapter: Partial<DBAdapter> = {
			findMany: vi
				.fn()
				.mockRejectedValue(new Error("Database connection failure")),
			delete: vi.fn().mockResolvedValue(true),
		};

		const withHooks = getWithHooks(mockAdapter as any, {
			options: {} as any,
			hooks: [],
		});

		await expect(
			withHooks.deleteWithHooks([{ field: "id", value: "user-123" }], "user"),
		).rejects.toThrow("Database connection failure");
	});

	it("deleteWithHooks returns null without throwing when record does not exist", async () => {
		const mockAdapter: Partial<DBAdapter> = {
			findMany: vi.fn().mockResolvedValue([]),
			delete: vi.fn().mockResolvedValue(true),
		};

		const withHooks = getWithHooks(mockAdapter as any, {
			options: {} as any,
			hooks: [],
		});

		const result = await withHooks.deleteWithHooks(
			[{ field: "id", value: "non-existent-user" }],
			"user",
		);
		expect(mockAdapter.findMany).toHaveBeenCalled();
		expect(mockAdapter.delete).not.toHaveBeenCalled();
		expect(result).toBeNull();
	});

	it("deleteManyWithHooks must propagate DB error when findMany fails instead of silently swallowing it", async () => {
		const mockAdapter: Partial<DBAdapter> = {
			findMany: vi
				.fn()
				.mockRejectedValue(new Error("Database connection failure")),
			delete: vi.fn().mockResolvedValue(true),
		};

		const withHooks = getWithHooks(mockAdapter as any, {
			options: {} as any,
			hooks: [],
		});

		await expect(
			withHooks.deleteManyWithHooks(
				[{ field: "userId", value: "user-123" }],
				"session",
			),
		).rejects.toThrow("Database connection failure");
	});

	it("/delete-user endpoint must NOT report success when user deletion fails or is skipped", async () => {
		const { client, auth, db, signInWithTestUser } = await getTestInstance({
			user: {
				deleteUser: {
					enabled: true,
				},
			},
		});

		const { headers, user } = await signInWithTestUser();
		const ctx = await auth.$context;

		const origTransaction = ctx.adapter.transaction;
		if (origTransaction) {
			vi.spyOn(ctx.adapter, "transaction").mockImplementation(
				async (cb: any) => {
					return origTransaction(async (trx: any) => {
						const origTrxFindMany = trx.findMany;
						vi.spyOn(trx, "findMany").mockImplementation(async (args: any) => {
							if (args?.model === "user") {
								throw new Error(
									"Simulated DB query error during user pre-fetch",
								);
							}
							return origTrxFindMany(args);
						});
						return cb(trx);
					});
				},
			);
		}

		const res = await client.deleteUser({
			fetchOptions: {
				headers,
			},
		});

		expect(res.error).toBeDefined();
		expect(res.data).toBeNull();

		// Verify user still exists in the database
		const userInDb = await db.findOne<User>({
			model: "user",
			where: [{ field: "id", value: user.id }],
		});
		expect(userInDb).not.toBeNull();
		expect(userInDb?.id).toBe(user.id);
	});

	it("internalAdapter.deleteUser must be atomic: if deleting user fails, transaction rolls back sessions and accounts", async () => {
		const { auth, db, signInWithTestUser } = await getTestInstance({
			user: {
				deleteUser: {
					enabled: true,
				},
			},
		});

		const { user } = await signInWithTestUser();
		const ctx = await auth.$context;
		const internalAdapter = ctx.internalAdapter;

		let sessionDeleteCalled = false;
		let accountDeleteCalled = false;

		const origTransaction = ctx.adapter.transaction;
		if (origTransaction) {
			vi.spyOn(ctx.adapter, "transaction").mockImplementation(
				async (cb: any) => {
					return origTransaction(async (trx: any) => {
						const origTrxDeleteMany = trx.deleteMany;
						vi.spyOn(trx, "deleteMany").mockImplementation(
							async (args: any) => {
								if (args?.model === "session") sessionDeleteCalled = true;
								if (args?.model === "account") accountDeleteCalled = true;
								return origTrxDeleteMany(args);
							},
						);
						const origTrxDelete = trx.delete;
						vi.spyOn(trx, "delete").mockImplementation(async (args: any) => {
							if (args?.model === "user") {
								throw new Error("DB error when deleting user row");
							}
							return origTrxDelete(args);
						});
						return cb(trx);
					});
				},
			);
		}

		await expect(internalAdapter.deleteUser(user.id)).rejects.toThrow(
			"DB error when deleting user row",
		);

		// Assert that session and account deletions succeeded inside the transaction before user deletion threw
		expect(sessionDeleteCalled).toBe(true);
		expect(accountDeleteCalled).toBe(true);

		// Because session and account deletes succeeded before user delete threw,
		// only transaction rollback preserves them. User, sessions, and accounts must remain intact.
		const remainingUser = await db.findOne<User>({
			model: "user",
			where: [{ field: "id", value: user.id }],
		});
		const remainingSessions = await db.findMany({
			model: "session",
			where: [{ field: "userId", value: user.id }],
		});
		const remainingAccounts = await db.findMany({
			model: "account",
			where: [{ field: "userId", value: user.id }],
		});
		expect(remainingUser).not.toBeNull();
		expect(remainingSessions.length).toBeGreaterThan(0);
		expect(remainingAccounts.length).toBeGreaterThan(0);
	});

	it("internalAdapter.deleteUser does not delete sessions/accounts when user is not found or vetoed", async () => {
		const { auth } = await getTestInstance({
			user: {
				deleteUser: {
					enabled: true,
				},
			},
		});

		const ctx = await auth.$context;
		const internalAdapter = ctx.internalAdapter;

		let childDeleteCalled = false;
		const origDeleteMany = ctx.adapter.deleteMany;
		vi.spyOn(ctx.adapter, "deleteMany").mockImplementation(
			async (args: any) => {
				if (args?.model === "session" || args?.model === "account") {
					childDeleteCalled = true;
				}
				return origDeleteMany(args);
			},
		);
		const origDelete = ctx.adapter.delete;
		vi.spyOn(ctx.adapter, "delete").mockImplementation(async (args: any) => {
			if (args?.model === "user") {
				childDeleteCalled = true;
			}
			return origDelete(args);
		});

		// Should resolve without error when user doesn't exist
		await expect(
			internalAdapter.deleteUser("non-existent-user-id"),
		).resolves.toBeUndefined();

		expect(childDeleteCalled).toBe(false);
	});

	it("internalAdapter.deleteUser respects veto hook on user deletion", async () => {
		const { auth, db, signInWithTestUser } = await getTestInstance({
			user: {
				deleteUser: {
					enabled: true,
				},
			},
			databaseHooks: {
				user: {
					delete: {
						before: async () => {
							return false; // veto
						},
					},
				},
			},
		});

		const { user } = await signInWithTestUser();
		const ctx = await auth.$context;
		const internalAdapter = ctx.internalAdapter;

		await internalAdapter.deleteUser(user.id);

		// Vetoed user deletion: user record must remain
		const remainingUser = await db.findOne<User>({
			model: "user",
			where: [{ field: "id", value: user.id }],
		});
		expect(remainingUser).not.toBeNull();

		const remainingSessions = await db.findMany({
			model: "session",
			where: [{ field: "userId", value: user.id }],
		});
		const remainingAccounts = await db.findMany({
			model: "account",
			where: [{ field: "userId", value: user.id }],
		});
		expect(remainingSessions.length).toBeGreaterThan(0);
		expect(remainingAccounts.length).toBeGreaterThan(0);
	});

	it("internalAdapter.deleteUser respects veto hook on session deletion and rolls back", async () => {
		const { auth, db, signInWithTestUser } = await getTestInstance({
			user: {
				deleteUser: {
					enabled: true,
				},
			},
			databaseHooks: {
				session: {
					delete: {
						before: async () => {
							return false; // veto
						},
					},
				},
			},
		});

		const { user } = await signInWithTestUser();
		const ctx = await auth.$context;
		const internalAdapter = ctx.internalAdapter;

		await internalAdapter.deleteUser(user.id);

		// Vetoed session deletion: user, session, and accounts must all remain
		const remainingUser = await db.findOne<User>({
			model: "user",
			where: [{ field: "id", value: user.id }],
		});
		expect(remainingUser).not.toBeNull();

		const remainingSessions = await db.findMany({
			model: "session",
			where: [{ field: "userId", value: user.id }],
		});
		const remainingAccounts = await db.findMany({
			model: "account",
			where: [{ field: "userId", value: user.id }],
		});
		expect(remainingSessions.length).toBeGreaterThan(0);
		expect(remainingAccounts.length).toBeGreaterThan(0);
	});

	it("internalAdapter.deleteUser evicts secondary storage session cache even if an after-hook throws", async () => {
		const store = new Map<string, string>();
		const secondaryStorage = {
			set: (key: string, value: string) => {
				store.set(key, value);
			},
			get: (key: string) => {
				return store.get(key) || null;
			},
			getAndDelete: (key: string) => {
				const value = store.get(key) || null;
				store.delete(key);
				return value;
			},
			increment: (key: string) => {
				const count = Number(store.get(key) ?? 0) + 1;
				store.set(key, String(count));
				return count;
			},
			delete: (key: string) => {
				store.delete(key);
			},
		};

		const { auth, db } = await getTestInstance({
			secondaryStorage,
			rateLimit: { enabled: false },
			session: {
				storeSessionInDatabase: true,
			},
			databaseHooks: {
				session: {
					delete: {
						after: async () => {
							throw new Error("Simulated failure in session.delete.after hook");
						},
					},
				},
			},
		});

		const { internalAdapter } = await auth.$context;
		const user = await internalAdapter.createUser(
			{
				name: "Cache Clean User",
				email: "cache-clean-user@test.com",
			},
			{ method: "test" },
		);
		const session = await internalAdapter.createSession(user.id);
		const activeSessionsKey = `active-sessions-${user.id}`;

		expect(store.has(session.token)).toBe(true);
		expect(store.has(activeSessionsKey)).toBe(true);

		// deleteUser must reject due to the failing after-hook
		await expect(internalAdapter.deleteUser(user.id)).rejects.toThrow(
			"Simulated failure in session.delete.after hook",
		);

		// Cache must have been evicted despite the after-hook throwing
		expect(await secondaryStorage.get(session.token)).toBeNull();
		expect(await secondaryStorage.get(activeSessionsKey)).toBeNull();

		// User and session must be deleted from the database
		const remainingUser = await db.findOne<User>({
			model: "user",
			where: [{ field: "id", value: user.id }],
		});
		expect(remainingUser).toBeNull();
	});
});
