import { DatabaseSync } from "node:sqlite";
import { runWithTransaction } from "@better-auth/core/context";
import type { DBAdapter } from "@better-auth/core/db/adapter";
import { describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../test-utils/test-instance";
import type { Session, User } from "../types";
import { getMigrations } from "./get-migration";
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
		const database = new DatabaseSync(":memory:");
		await (await getMigrations({ database })).runMigrations();
		const { auth, db } = await getTestInstance({
			database,
			user: {
				deleteUser: {
					enabled: true,
				},
			},
		});

		const ctx = await auth.$context;
		const internalAdapter = ctx.internalAdapter;

		// Seed orphaned session and account for a non-existent user
		const missingUserId = "non-existent-user-id";
		database.exec("PRAGMA foreign_keys = OFF");
		try {
			await db.create({
				model: "session",
				data: {
					id: "orphaned-session-id",
					userId: missingUserId,
					token: "orphaned-session-token",
					expiresAt: new Date(Date.now() + 1000 * 60 * 60),
					createdAt: new Date(),
					updatedAt: new Date(),
				},
				forceAllowId: true,
			});
			await db.create({
				model: "account",
				data: {
					id: "orphaned-account-id",
					userId: missingUserId,
					accountId: "orphaned-account-provider-id",
					providerId: "credential",
					createdAt: new Date(),
					updatedAt: new Date(),
				},
				forceAllowId: true,
			});
		} finally {
			database.exec("PRAGMA foreign_keys = ON");
		}

		const deleteSpy = vi.spyOn(ctx.adapter, "delete");
		const deleteManySpy = vi.spyOn(ctx.adapter, "deleteMany");

		// Should resolve without error when user doesn't exist
		await expect(
			internalAdapter.deleteUser(missingUserId),
		).resolves.toBeUndefined();

		expect(deleteSpy).not.toHaveBeenCalled();
		expect(deleteManySpy).not.toHaveBeenCalled();

		// Verify orphaned session and account rows still exist in DB
		const sessions = await db.findMany({
			model: "session",
			where: [{ field: "userId", value: missingUserId }],
		});
		expect(sessions.length).toBe(1);

		const accounts = await db.findMany({
			model: "account",
			where: [{ field: "userId", value: missingUserId }],
		});
		expect(accounts.length).toBe(1);
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

		const remainingSessions = await db.findMany({
			model: "session",
			where: [{ field: "userId", value: user.id }],
		});
		expect(remainingSessions).toHaveLength(0);
	});

	it("internalAdapter.deleteUser respects veto hook without deleting sessions or accounts when transactions are disabled (transaction: false)", async () => {
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

		// Configure adapter as non-transactional: writes are immediate and cannot rollback
		if (ctx.adapter.options?.adapterConfig) {
			ctx.adapter.options.adapterConfig.transaction = false;
		}
		vi.spyOn(ctx.adapter, "transaction").mockImplementation(async (cb: any) =>
			cb(ctx.adapter),
		);

		const deleteSpy = vi.spyOn(ctx.adapter, "delete");
		const deleteManySpy = vi.spyOn(ctx.adapter, "deleteMany");

		await internalAdapter.deleteUser(user.id);

		// Zero DB delete writes should occur when vetoed
		expect(deleteSpy).not.toHaveBeenCalled();
		expect(deleteManySpy).not.toHaveBeenCalled();

		// User, sessions, and accounts must remain intact
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

	it("internalAdapter.deleteUser respects account veto hook without deleting sessions when transactions are disabled", async () => {
		const { auth, db, signInWithTestUser } = await getTestInstance({
			user: {
				deleteUser: {
					enabled: true,
				},
			},
			databaseHooks: {
				account: {
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

		if (ctx.adapter.options?.adapterConfig) {
			ctx.adapter.options.adapterConfig.transaction = false;
		}
		vi.spyOn(ctx.adapter, "transaction").mockImplementation(async (cb: any) =>
			cb(ctx.adapter),
		);

		const deleteSpy = vi.spyOn(ctx.adapter, "delete");
		const deleteManySpy = vi.spyOn(ctx.adapter, "deleteMany");

		await internalAdapter.deleteUser(user.id);

		expect(deleteSpy).not.toHaveBeenCalled();
		expect(deleteManySpy).not.toHaveBeenCalled();

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

	it("internalAdapter.deleteUser respects veto hook inside outer runWithTransaction without committing child deletions", async () => {
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

		const deleteSpy = vi.spyOn(ctx.adapter, "delete");
		const deleteManySpy = vi.spyOn(ctx.adapter, "deleteMany");

		// Run deleteUser inside an outer transaction that commits successfully
		await runWithTransaction(ctx.adapter, async () => {
			await internalAdapter.deleteUser(user.id);
		});

		// Zero DB writes occurred inside the outer transaction
		expect(deleteSpy).not.toHaveBeenCalled();
		expect(deleteManySpy).not.toHaveBeenCalled();

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

	it("deleteManyWithHooks restricts deleteMany to preloaded IDs and skips deletion when preloadedEntities is empty", async () => {
		const deleteManySpy = vi.fn().mockResolvedValue(2);
		const mockAdapter: Partial<DBAdapter> = {
			findMany: vi.fn(),
			deleteMany: deleteManySpy,
		};

		const withHooks = getWithHooks(mockAdapter as any, {
			options: {} as any,
			hooks: [],
		});

		// 1. With non-empty preloadedEntities, where clause is scoped to preloaded IDs
		await withHooks.deleteManyWithHooks(
			[{ field: "userId", value: "user-123" }],
			"session",
			undefined,
			{
				preloadedEntities: [
					{ id: "s1", userId: "user-123" },
					{ id: "s2", userId: "user-123" },
				],
			},
		);

		expect(deleteManySpy).toHaveBeenCalledWith({
			model: "session",
			where: [
				{ field: "userId", value: "user-123" },
				{ field: "id", operator: "in", value: ["s1", "s2"] },
			],
		});

		deleteManySpy.mockClear();

		// 2. With empty preloadedEntities, adapter.deleteMany is NOT called
		const result = await withHooks.deleteManyWithHooks(
			[{ field: "userId", value: "user-123" }],
			"session",
			undefined,
			{
				preloadedEntities: [],
			},
		);

		expect(deleteManySpy).not.toHaveBeenCalled();
		expect(result).toBe(0);
	});

	it("deleteWithHooks restricts delete to preloaded entity ID and skips deletion when preloadedEntity is null", async () => {
		const deleteSpy = vi.fn().mockResolvedValue(true);
		const mockAdapter: Partial<DBAdapter> = {
			findMany: vi.fn(),
			delete: deleteSpy,
		};

		const withHooks = getWithHooks(mockAdapter as any, {
			options: {} as any,
			hooks: [],
		});

		// 1. With preloadedEntity, where is restricted to { field: "id", value: id }
		await withHooks.deleteWithHooks(
			[{ field: "email", value: "test@example.com" }],
			"user",
			undefined,
			{
				preloadedEntity: { id: "u-123", email: "test@example.com" },
			},
		);

		expect(deleteSpy).toHaveBeenCalledWith({
			model: "user",
			where: [{ field: "id", value: "u-123" }],
		});

		deleteSpy.mockClear();

		// 2. With null preloadedEntity, adapter.delete is NOT called
		const result = await withHooks.deleteWithHooks(
			[{ field: "email", value: "test@example.com" }],
			"user",
			undefined,
			{
				preloadedEntity: null,
			},
		);

		expect(deleteSpy).not.toHaveBeenCalled();
		expect(result).toBeNull();
	});

	it("deleteUser deletes all sessions when user has more sessions than the default findMany limit", async () => {
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

		// Create 105 sessions (exceeding default 100 limit)
		const sessionCount = 105;
		for (let i = 0; i < sessionCount; i++) {
			await internalAdapter.createSession(user.id);
		}

		const sessionsBefore = await db.findMany<Session>({
			model: "session",
			where: [{ field: "userId", value: user.id }],
			limit: 200,
		});
		expect(sessionsBefore.length).toBeGreaterThanOrEqual(sessionCount);

		await internalAdapter.deleteUser(user.id);

		const remainingSessions = await db.findMany<Session>({
			model: "session",
			where: [{ field: "userId", value: user.id }],
			limit: 200,
		});
		expect(remainingSessions.length).toBe(0);

		const userInDb = await db.findOne<User>({
			model: "user",
			where: [{ field: "id", value: user.id }],
		});
		expect(userInDb).toBeNull();
	});

	it("deleteManyWithHooks chunks preloaded entity IDs into chunks of 80 to respect parameter limits", async () => {
		const deleteManySpy = vi.fn().mockResolvedValue(10);
		const mockAdapter: Partial<DBAdapter> = {
			deleteMany: deleteManySpy,
		};

		const withHooks = getWithHooks(mockAdapter as any, {
			options: {} as any,
			hooks: [],
		});

		// 105 entities
		const preloadedEntities = Array.from({ length: 105 }, (_, i) => ({
			id: `session-${i}`,
			userId: "u-1",
		}));

		const result = await withHooks.deleteManyWithHooks(
			[{ field: "userId", value: "u-1" }],
			"session",
			undefined,
			{
				preloadedEntities,
				skipBeforeHooks: true,
			},
		);

		// With CHUNK_SIZE = 80, 105 entities should result in 2 chunks (80 + 25)
		expect(deleteManySpy).toHaveBeenCalledTimes(2);

		const firstCallWhere = deleteManySpy.mock.calls[0]?.[0]?.where;
		const secondCallWhere = deleteManySpy.mock.calls[1]?.[0]?.where;

		expect(firstCallWhere).toEqual([
			{ field: "userId", value: "u-1" },
			{
				field: "id",
				operator: "in",
				value: preloadedEntities.slice(0, 80).map((e) => e.id),
			},
		]);

		expect(secondCallWhere).toEqual([
			{ field: "userId", value: "u-1" },
			{
				field: "id",
				operator: "in",
				value: preloadedEntities.slice(80, 105).map((e) => e.id),
			},
		]);

		expect(result).toBe(20); // 10 + 10
	});

	it("deleteUser passes sortBy { field: 'id', direction: 'asc' } when paginating sessions and accounts", async () => {
		const { auth, signInWithTestUser } = await getTestInstance({
			user: {
				deleteUser: {
					enabled: true,
				},
			},
		});

		const { user } = await signInWithTestUser();
		const ctx = await auth.$context;

		const findManyCalls: any[] = [];
		const origTransaction = ctx.adapter.transaction;
		if (origTransaction) {
			vi.spyOn(ctx.adapter, "transaction").mockImplementation(
				async (cb: any) => {
					return origTransaction(async (trx: any) => {
						const origTrxFindMany = trx.findMany;
						vi.spyOn(trx, "findMany").mockImplementation(async (args: any) => {
							findManyCalls.push(args);
							return origTrxFindMany(args);
						});
						return cb(trx);
					});
				},
			);
		} else {
			vi.spyOn(ctx.adapter, "findMany").mockImplementation(
				async (args: any) => {
					findManyCalls.push(args);
					return (ctx.adapter as any).findMany(args);
				},
			);
		}

		await ctx.internalAdapter.deleteUser(user.id);

		// Verify findMany was called with sortBy: { field: "id", direction: "asc" } for session and account
		const sessionQueries = findManyCalls.filter(
			(call) => call?.model === "session",
		);
		const accountQueries = findManyCalls.filter(
			(call) => call?.model === "account",
		);

		expect(sessionQueries.length).toBeGreaterThanOrEqual(1);
		for (const call of sessionQueries) {
			expect(call).toMatchObject({
				sortBy: { field: "id", direction: "asc" },
			});
		}

		expect(accountQueries.length).toBeGreaterThanOrEqual(1);
		for (const call of accountQueries) {
			expect(call).toMatchObject({
				sortBy: { field: "id", direction: "asc" },
			});
		}
	});
});
