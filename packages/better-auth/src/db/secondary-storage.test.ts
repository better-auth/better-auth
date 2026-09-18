import type { SecondaryStorage } from "@better-auth/core/db";
import { safeJSONParse } from "@better-auth/core/utils/json";
import { beforeEach, describe, expect, it } from "vitest";
import { admin } from "../plugins/admin/admin";
import { adminClient } from "../plugins/admin/client";
import { anonymous } from "../plugins/anonymous";
import { anonymousClient } from "../plugins/anonymous/client";
import { getTestInstance } from "../test-utils/test-instance";

function createStringSecondaryStorage(
	store: Map<string, string>,
): SecondaryStorage {
	return {
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
			store.delete(key);
		},
	};
}

function createParsedSecondaryStorage(
	store: Map<string, unknown>,
): SecondaryStorage {
	return {
		set(key, value) {
			store.set(key, safeJSONParse<unknown>(value));
		},
		get(key) {
			return store.get(key) ?? null;
		},
		getAndDelete(key) {
			const value = store.get(key) ?? null;
			store.delete(key);
			return value;
		},
		increment(key) {
			const count = Number(store.get(key) ?? 0) + 1;
			store.set(key, count);
			return count;
		},
		delete(key) {
			store.delete(key);
		},
	};
}

describe("secondary storage - get returns JSON string", async () => {
	const store = new Map<string, string>();

	const { client, signInWithTestUser } = await getTestInstance({
		secondaryStorage: createStringSecondaryStorage(store),
		rateLimit: {
			enabled: false,
		},
	});

	beforeEach(() => {
		store.clear();
	});

	it("should work end-to-end with string return", async () => {
		expect(store.size).toBe(0);
		const { headers } = await signInWithTestUser();
		expect(store.size).toBe(2);

		const s1 = await client.getSession({
			fetchOptions: { headers },
		});
		expect(s1.data).toMatchObject({
			session: {
				userId: expect.any(String),
				token: expect.any(String),
				expiresAt: expect.any(Date),
				ipAddress: expect.any(String),
				userAgent: expect.any(String),
			},
			user: {
				id: expect.any(String),
				name: "test user",
				email: "test@test.com",
				emailVerified: false,
				image: null,
				createdAt: expect.any(Date),
				updatedAt: expect.any(Date),
			},
		});

		const list = await client.listSessions({ fetchOptions: { headers } });
		expect(list.data?.length).toBe(1);

		const token = s1.data!.session.token;
		const revoke = await client.revokeSession({
			fetchOptions: { headers },
			token,
		});
		expect(revoke.data?.status).toBe(true);

		const after = await client.getSession({ fetchOptions: { headers } });
		expect(after.data).toBeNull();
		expect(store.size).toBe(0);
	});
});

describe("secondary storage - get returns already-parsed object", async () => {
	const store = new Map<string, unknown>();

	const { client, signInWithTestUser } = await getTestInstance({
		secondaryStorage: createParsedSecondaryStorage(store),
		rateLimit: {
			enabled: false,
		},
	});

	beforeEach(() => {
		store.clear();
	});

	it("should work end-to-end with object return", async () => {
		const { headers } = await signInWithTestUser();

		const s1 = await client.getSession({ fetchOptions: { headers } });
		expect(s1.data).not.toBeNull();

		const userId = s1.data!.session.userId;
		const activeList = store.get(`active-sessions-${userId}`);
		expect(Array.isArray(activeList)).toBe(true);
		if (!Array.isArray(activeList)) {
			throw new Error("Expected active sessions to be stored as an array");
		}
		expect(activeList.length).toBe(1);

		const list = await client.listSessions({ fetchOptions: { headers } });
		expect(list.data?.length).toBe(1);

		const token = s1.data!.session.token;
		const revoke = await client.revokeSession({
			fetchOptions: { headers },
			token,
		});
		expect(revoke.data?.status).toBe(true);

		const after = await client.getSession({ fetchOptions: { headers } });
		expect(after.data).toBeNull();
		const activeAfter = store.get(`active-sessions-${userId}`);
		expect(activeAfter ?? null).toBeNull();
	});
});

describe("secondary storage - storeSessionInDatabase", () => {
	describe("preserveSessionInDatabase: false", async () => {
		const store = new Map<string, string>();

		const { client, signInWithTestUser } = await getTestInstance({
			secondaryStorage: createStringSecondaryStorage(store),
			session: {
				storeSessionInDatabase: true,
				preserveSessionInDatabase: false,
			},
			rateLimit: {
				enabled: false,
			},
		});

		beforeEach(() => {
			store.clear();
		});

		it("should not return a revoked session when it is deleted from both storages", async () => {
			const { headers } = await signInWithTestUser();

			const s1 = await client.getSession({ fetchOptions: { headers } });
			expect(s1.data).not.toBeNull();
			const token = s1.data!.session.token;

			expect(store.has(token)).toBe(true);

			const revoke = await client.revokeSession({
				fetchOptions: { headers },
				token,
			});
			expect(revoke.data?.status).toBe(true);

			expect(store.has(token)).toBe(false);

			// Revoke deletes from both secondary storage and database,
			// so the session should not be usable
			const after = await client.getSession({ fetchOptions: { headers } });
			expect(after.data).toBeNull();
		});
	});

	describe("preserveSessionInDatabase: true", async () => {
		const store = new Map<string, string>();

		const { client, signInWithTestUser } = await getTestInstance({
			secondaryStorage: createStringSecondaryStorage(store),
			session: {
				storeSessionInDatabase: true,
				preserveSessionInDatabase: true,
			},
			rateLimit: {
				enabled: false,
			},
		});

		beforeEach(() => {
			store.clear();
		});

		it("should not return a revoked session even if it exists in database", async () => {
			const { headers } = await signInWithTestUser();

			const s1 = await client.getSession({ fetchOptions: { headers } });
			expect(s1.data).not.toBeNull();
			const token = s1.data!.session.token;

			// Session should exist in secondary storage
			expect(store.has(token)).toBe(true);

			// Revoke the session
			const revoke = await client.revokeSession({
				fetchOptions: { headers },
				token,
			});
			expect(revoke.data?.status).toBe(true);

			// Session should be removed from secondary storage
			expect(store.has(token)).toBe(false);

			// Session should NOT be usable anymore, even though it's preserved in database
			const after = await client.getSession({ fetchOptions: { headers } });
			expect(after.data).toBeNull();
		});

		it("runs the session-delete hook and marks the preserved row ended", async () => {
			const store = new Map<string, string>();
			const deletedSessionIds: string[] = [];

			const { auth, client, db, signInWithTestUser } = await getTestInstance({
				secondaryStorage: createStringSecondaryStorage(store),
				session: {
					storeSessionInDatabase: true,
					preserveSessionInDatabase: true,
				},
				databaseHooks: {
					session: {
						delete: {
							before: async (session) => {
								deletedSessionIds.push(session.id);
							},
						},
					},
				},
				rateLimit: { enabled: false },
			});

			const { headers } = await signInWithTestUser();
			const token = (await client.getSession({ fetchOptions: { headers } }))
				.data!.session.token;

			await client.revokeSession({ fetchOptions: { headers }, token });

			// The hook fires even though the row is preserved, so OAuth token
			// revocation and back-channel logout run on session end.
			expect(deletedSessionIds).toHaveLength(1);

			// The row is kept for audit but marked ended, so session-row liveness
			// checks (introspection, /userinfo) treat bound tokens as inactive.
			const preserved = await db.findOne<{ id: string; expiresAt: Date }>({
				model: "session",
				where: [{ field: "token", value: token }],
			});
			expect(preserved).not.toBeNull();
			expect(new Date(preserved!.expiresAt).getTime()).toBeLessThanOrEqual(
				Date.now(),
			);

			// Ending an already-ended session must not re-fire the hook. The
			// preserved row outlives the session, so a repeat delete would
			// otherwise re-dispatch back-channel logout.
			await (await auth.$context).internalAdapter.deleteSession(token);
			expect(deletedSessionIds).toHaveLength(1);
		});
	});
});

describe("secondary storage - deleteUser", () => {
	/**
	 * @see https://github.com/better-auth/better-auth/pull/10687#discussion_r3716703104
	 */
	it("keeps cached sessions when user deletion is vetoed", async () => {
		const store = new Map<string, string>();
		const { auth } = await getTestInstance({
			secondaryStorage: createStringSecondaryStorage(store),
			databaseHooks: {
				user: {
					delete: {
						before: async () => false,
					},
				},
			},
			rateLimit: { enabled: false },
		});
		const { internalAdapter } = await auth.$context;
		const user = await internalAdapter.createUser(
			{
				name: "Retained User",
				email: "retained-user@test.com",
			},
			{ method: "test" },
		);
		const session = await internalAdapter.createSession(user.id);
		const activeSessionsKey = `active-sessions-${user.id}`;

		await internalAdapter.deleteUser(user.id);

		expect(await internalAdapter.findUserById(user.id)).not.toBeNull();
		expect(store.has(session.token)).toBe(true);
		expect(store.has(activeSessionsKey)).toBe(true);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/pull/10687#discussion_r3716703104
	 */
	it("evicts cached sessions even when the session row deletion is vetoed", async () => {
		const store = new Map<string, string>();
		const { auth, db } = await getTestInstance({
			secondaryStorage: createStringSecondaryStorage(store),
			session: { storeSessionInDatabase: true },
			databaseHooks: {
				session: {
					delete: {
						before: async () => false,
					},
				},
			},
			rateLimit: { enabled: false },
		});
		const { internalAdapter } = await auth.$context;
		const user = await internalAdapter.createUser(
			{
				name: "Retained Session User",
				email: "retained-session-user@test.com",
			},
			{ method: "test" },
		);
		const session = await internalAdapter.createSession(user.id);
		const activeSessionsKey = `active-sessions-${user.id}`;

		await internalAdapter.deleteUserSessions(user.id);

		// The vetoed row survives, so the session is not lost.
		expect(
			await db.findMany({
				model: "session",
				where: [{ field: "userId", value: user.id }],
			}),
		).toHaveLength(1);
		// Eviction runs before the database work, so the cache is cleared even
		// though the row deletion is vetoed. The session rehydrates from the row.
		expect(store.has(session.token)).toBe(false);
		expect(store.has(activeSessionsKey)).toBe(false);
		expect(
			(await internalAdapter.findSession(session.token))?.session.token,
		).toBe(session.token);
	});

	it("deletes user sessions from secondary storage and database", async () => {
		const store = new Map<string, string>();
		const { auth, db } = await getTestInstance({
			secondaryStorage: createStringSecondaryStorage(store),
			session: {
				storeSessionInDatabase: true,
				preserveSessionInDatabase: true,
			},
			rateLimit: { enabled: false },
		});
		const { internalAdapter } = await auth.$context;
		const user = await internalAdapter.createUser(
			{
				name: "Deleted User",
				email: "deleted-user@test.com",
			},
			{ method: "test" },
		);
		const session = await internalAdapter.createSession(user.id);
		const activeSessionsKey = `active-sessions-${user.id}`;

		expect(store.has(session.token)).toBe(true);
		expect(store.has(activeSessionsKey)).toBe(true);
		expect(
			await db.findMany({
				model: "session",
				where: [{ field: "userId", value: user.id }],
			}),
		).toHaveLength(1);

		await internalAdapter.deleteUser(user.id);

		expect(store.has(session.token)).toBe(false);
		expect(store.has(activeSessionsKey)).toBe(false);
		expect(
			await db.findMany({
				model: "session",
				where: [{ field: "userId", value: user.id }],
			}),
		).toHaveLength(0);
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/11326
 */
describe("secondary storage - deleteUserSessions is fail-closed", () => {
	/**
	 * A storage whose `delete` rejects while `failDeletes()` returns true.
	 * Reads keep working, so session lookup and the active-session index remain
	 * usable while eviction is failing.
	 */
	function createFlakyDeleteStorage(
		store: Map<string, string>,
		failDeletes: () => boolean,
	): SecondaryStorage {
		const storage = createStringSecondaryStorage(store);
		return {
			...storage,
			delete(key) {
				if (failDeletes()) {
					throw new Error("secondary storage is unavailable");
				}
				storage.delete(key);
			},
		};
	}

	describe("secondary-storage-only sessions (no storeSessionInDatabase)", () => {
		it("rejects on eviction failure and leaves the cached sessions intact", async () => {
			const store = new Map<string, string>();
			const { auth } = await getTestInstance({
				secondaryStorage: createFlakyDeleteStorage(store, () => true),
				rateLimit: { enabled: false },
			});
			const { internalAdapter } = await auth.$context;
			const user = await internalAdapter.createUser(
				{ name: "Fail-Closed User", email: "fail-closed@test.com" },
				{ method: "test" },
			);
			const session = await internalAdapter.createSession(user.id);
			const activeSessionsKey = `active-sessions-${user.id}`;

			await expect(internalAdapter.deleteUserSessions(user.id)).rejects.toThrow(
				"secondary storage is unavailable",
			);

			expect(store.has(session.token)).toBe(true);
			expect(store.has(activeSessionsKey)).toBe(true);

			const found = await internalAdapter.findSession(session.token);
			expect(found?.session.token).toBe(session.token);
		});

		it("completes the revocation on retry once the eviction failure recovers", async () => {
			const store = new Map<string, string>();
			let failDeletes = true;
			const { auth } = await getTestInstance({
				secondaryStorage: createFlakyDeleteStorage(store, () => failDeletes),
				rateLimit: { enabled: false },
			});
			const { internalAdapter } = await auth.$context;
			const user = await internalAdapter.createUser(
				{ name: "Retry User", email: "retry@test.com" },
				{ method: "test" },
			);
			const session = await internalAdapter.createSession(user.id);

			await expect(internalAdapter.deleteUserSessions(user.id)).rejects.toThrow(
				"secondary storage is unavailable",
			);
			expect(store.has(session.token)).toBe(true);

			failDeletes = false;
			await internalAdapter.deleteUserSessions(user.id);

			expect(store.has(session.token)).toBe(false);
			expect(store.has(`active-sessions-${user.id}`)).toBe(false);
		});

		it("evicts the cached sessions when eviction succeeds", async () => {
			const store = new Map<string, string>();
			const { auth } = await getTestInstance({
				secondaryStorage: createFlakyDeleteStorage(store, () => false),
				rateLimit: { enabled: false },
			});
			const { internalAdapter } = await auth.$context;
			const user = await internalAdapter.createUser(
				{ name: "Evict User", email: "evict@test.com" },
				{ method: "test" },
			);
			const session = await internalAdapter.createSession(user.id);

			await internalAdapter.deleteUserSessions(user.id);

			expect(store.has(session.token)).toBe(false);
			expect(store.has(`active-sessions-${user.id}`)).toBe(false);
		});
	});

	describe("storeSessionInDatabase", () => {
		it("rejects on eviction failure and leaves the session rows intact", async () => {
			const store = new Map<string, string>();
			const { auth, db } = await getTestInstance({
				secondaryStorage: createFlakyDeleteStorage(store, () => true),
				session: { storeSessionInDatabase: true },
				rateLimit: { enabled: false },
			});
			const { internalAdapter } = await auth.$context;
			const user = await internalAdapter.createUser(
				{ name: "Stored User", email: "stored@test.com" },
				{ method: "test" },
			);
			const session = await internalAdapter.createSession(user.id);

			await expect(internalAdapter.deleteUserSessions(user.id)).rejects.toThrow(
				"secondary storage is unavailable",
			);

			expect(store.has(session.token)).toBe(true);
			expect(
				await db.findMany({
					model: "session",
					where: [{ field: "userId", value: user.id }],
				}),
			).toHaveLength(1);

			const found = await internalAdapter.findSession(session.token);
			expect(found?.session.token).toBe(session.token);
		});

		it("completes the revocation on retry once the eviction failure recovers", async () => {
			const store = new Map<string, string>();
			let failDeletes = true;
			const { auth, db } = await getTestInstance({
				secondaryStorage: createFlakyDeleteStorage(store, () => failDeletes),
				session: { storeSessionInDatabase: true },
				rateLimit: { enabled: false },
			});
			const { internalAdapter } = await auth.$context;
			const user = await internalAdapter.createUser(
				{ name: "Stored Retry User", email: "stored-retry@test.com" },
				{ method: "test" },
			);
			const session = await internalAdapter.createSession(user.id);

			await expect(internalAdapter.deleteUserSessions(user.id)).rejects.toThrow(
				"secondary storage is unavailable",
			);
			expect(store.has(session.token)).toBe(true);

			failDeletes = false;
			await internalAdapter.deleteUserSessions(user.id);

			expect(store.has(session.token)).toBe(false);
			expect(store.has(`active-sessions-${user.id}`)).toBe(false);
			expect(
				await db.findMany({
					model: "session",
					where: [{ field: "userId", value: user.id }],
				}),
			).toHaveLength(0);
		});

		it("deletes the session rows when eviction succeeds", async () => {
			const store = new Map<string, string>();
			const { auth, db } = await getTestInstance({
				secondaryStorage: createFlakyDeleteStorage(store, () => false),
				session: { storeSessionInDatabase: true },
				rateLimit: { enabled: false },
			});
			const { internalAdapter } = await auth.$context;
			const user = await internalAdapter.createUser(
				{ name: "Stored Evict User", email: "stored-evict@test.com" },
				{ method: "test" },
			);
			const session = await internalAdapter.createSession(user.id);

			await internalAdapter.deleteUserSessions(user.id);

			expect(store.has(session.token)).toBe(false);
			expect(store.has(`active-sessions-${user.id}`)).toBe(false);
			expect(
				await db.findMany({
					model: "session",
					where: [{ field: "userId", value: user.id }],
				}),
			).toHaveLength(0);
		});

		it("still rejects when the database deletion fails after a successful eviction", async () => {
			const store = new Map<string, string>();
			let failDbDelete = true;
			const { auth, db } = await getTestInstance({
				secondaryStorage: createFlakyDeleteStorage(store, () => false),
				session: { storeSessionInDatabase: true },
				databaseHooks: {
					session: {
						delete: {
							before: async () => {
								if (failDbDelete) {
									throw new Error("database deletion failed");
								}
							},
						},
					},
				},
				rateLimit: { enabled: false },
			});
			const { internalAdapter } = await auth.$context;
			const user = await internalAdapter.createUser(
				{ name: "Db Failure User", email: "db-failure@test.com" },
				{ method: "test" },
			);
			const session = await internalAdapter.createSession(user.id);

			await expect(internalAdapter.deleteUserSessions(user.id)).rejects.toThrow(
				"database deletion failed",
			);

			expect(store.has(session.token)).toBe(false);
			expect(
				await db.findMany({
					model: "session",
					where: [{ field: "userId", value: user.id }],
				}),
			).toHaveLength(1);

			failDbDelete = false;
			await internalAdapter.deleteUserSessions(user.id);

			expect(
				await db.findMany({
					model: "session",
					where: [{ field: "userId", value: user.id }],
				}),
			).toHaveLength(0);
		});
	});

	describe("preserveSessionInDatabase", () => {
		it("rejects on eviction failure without expiring the preserved rows", async () => {
			const store = new Map<string, string>();
			const { auth, db } = await getTestInstance({
				secondaryStorage: createFlakyDeleteStorage(store, () => true),
				session: {
					storeSessionInDatabase: true,
					preserveSessionInDatabase: true,
				},
				rateLimit: { enabled: false },
			});
			const { internalAdapter } = await auth.$context;
			const user = await internalAdapter.createUser(
				{ name: "Preserved User", email: "preserved@test.com" },
				{ method: "test" },
			);
			const session = await internalAdapter.createSession(user.id);

			await expect(internalAdapter.deleteUserSessions(user.id)).rejects.toThrow(
				"secondary storage is unavailable",
			);

			expect(store.has(session.token)).toBe(true);

			const preserved = await db.findOne<{ expiresAt: Date }>({
				model: "session",
				where: [{ field: "token", value: session.token }],
			});
			expect(preserved).not.toBeNull();
			expect(new Date(preserved!.expiresAt).getTime()).toBeGreaterThan(
				Date.now(),
			);

			const found = await internalAdapter.findSession(session.token);
			expect(found?.session.token).toBe(session.token);
		});

		it("completes the revocation on retry once the eviction failure recovers", async () => {
			const store = new Map<string, string>();
			let failDeletes = true;
			const { auth, db } = await getTestInstance({
				secondaryStorage: createFlakyDeleteStorage(store, () => failDeletes),
				session: {
					storeSessionInDatabase: true,
					preserveSessionInDatabase: true,
				},
				rateLimit: { enabled: false },
			});
			const { internalAdapter } = await auth.$context;
			const user = await internalAdapter.createUser(
				{ name: "Preserved Retry User", email: "preserved-retry@test.com" },
				{ method: "test" },
			);
			const session = await internalAdapter.createSession(user.id);

			await expect(internalAdapter.deleteUserSessions(user.id)).rejects.toThrow(
				"secondary storage is unavailable",
			);
			expect(store.has(session.token)).toBe(true);

			failDeletes = false;
			await internalAdapter.deleteUserSessions(user.id);

			expect(store.has(session.token)).toBe(false);
			expect(store.has(`active-sessions-${user.id}`)).toBe(false);

			const preserved = await db.findOne<{ expiresAt: Date }>({
				model: "session",
				where: [{ field: "token", value: session.token }],
			});
			expect(preserved).not.toBeNull();
			expect(new Date(preserved!.expiresAt).getTime()).toBeLessThanOrEqual(
				Date.now(),
			);
		});

		it("expires the preserved rows when eviction succeeds", async () => {
			const store = new Map<string, string>();
			const { auth, db } = await getTestInstance({
				secondaryStorage: createFlakyDeleteStorage(store, () => false),
				session: {
					storeSessionInDatabase: true,
					preserveSessionInDatabase: true,
				},
				rateLimit: { enabled: false },
			});
			const { internalAdapter } = await auth.$context;
			const user = await internalAdapter.createUser(
				{ name: "Preserved Evict User", email: "preserved-evict@test.com" },
				{ method: "test" },
			);
			const session = await internalAdapter.createSession(user.id);

			await internalAdapter.deleteUserSessions(user.id);

			expect(store.has(session.token)).toBe(false);
			expect(store.has(`active-sessions-${user.id}`)).toBe(false);

			const preserved = await db.findOne<{ expiresAt: Date }>({
				model: "session",
				where: [{ field: "token", value: session.token }],
			});
			expect(preserved).not.toBeNull();
			expect(new Date(preserved!.expiresAt).getTime()).toBeLessThanOrEqual(
				Date.now(),
			);
		});
	});
});

/**
 * @see https://github.com/better-auth/better-auth/security/advisories/GHSA-2vg6-77g8-24mp
 */
describe("secondary storage - admin removeUser cleans up sessions", async () => {
	const store = new Map<string, string>();

	beforeEach(() => {
		store.clear();
	});

	const { client, signInWithUser, customFetchImpl } = await getTestInstance({
		plugins: [admin()],
		secondaryStorage: createStringSecondaryStorage(store),
		databaseHooks: {
			user: {
				create: {
					before: async (user) => {
						if (user.email === "admin@test.com") {
							return { data: { ...user, role: "admin" } };
						}
					},
				},
			},
		},
		rateLimit: {
			enabled: false,
		},
	});

	const { createAuthClient } = await import("../client");
	const adminAuthClient = createAuthClient({
		fetchOptions: { customFetchImpl },
		plugins: [adminClient()],
		baseURL: "http://localhost:3000",
	});

	it("should clear secondary storage sessions when removing a user via admin", async () => {
		await client.signUp.email({
			email: "admin@test.com",
			password: "password",
			name: "Admin",
		});
		const { headers: adminHeaders } = await signInWithUser(
			"admin@test.com",
			"password",
		);

		await client.signUp.email({
			email: "victim@test.com",
			password: "password",
			name: "Victim",
		});
		const { headers: victimHeaders } = await signInWithUser(
			"victim@test.com",
			"password",
		);

		const victimSession = await client.getSession({
			fetchOptions: { headers: victimHeaders },
		});
		expect(victimSession.data).not.toBeNull();

		const victimId = victimSession.data!.user.id;
		const victimToken = victimSession.data!.session.token;
		expect(store.has(victimToken)).toBe(true);

		await adminAuthClient.admin.removeUser(
			{ userId: victimId },
			{ headers: adminHeaders },
		);

		expect(store.has(victimToken)).toBe(false);

		const after = await client.getSession({
			fetchOptions: { headers: victimHeaders },
		});
		expect(after.data).toBeNull();
	});
});

/**
 * @see https://github.com/better-auth/better-auth/security/advisories/GHSA-2vg6-77g8-24mp
 */
describe("secondary storage - /delete-anonymous-user cleans up sessions", async () => {
	const store = new Map<string, string>();

	beforeEach(() => {
		store.clear();
	});

	const { client, auth, sessionSetter } = await getTestInstance(
		{
			plugins: [anonymous()],
			secondaryStorage: createStringSecondaryStorage(store),
			rateLimit: {
				enabled: false,
			},
		},
		{
			clientOptions: {
				plugins: [anonymousClient()],
			},
		},
	);

	it("should clear secondary storage sessions when an anonymous user calls /delete-anonymous-user", async () => {
		const headers = new Headers();
		await client.signIn.anonymous({
			fetchOptions: { onSuccess: sessionSetter(headers) },
		});

		const session = await client.getSession({ fetchOptions: { headers } });
		expect(session.data).not.toBeNull();

		const sessionToken = session.data!.session.token;
		expect(store.has(sessionToken)).toBe(true);

		await auth.api.deleteAnonymousUser({ headers });

		expect(store.has(sessionToken)).toBe(false);

		const after = await client.getSession({ fetchOptions: { headers } });
		expect(after.data).toBeNull();
	});
});
