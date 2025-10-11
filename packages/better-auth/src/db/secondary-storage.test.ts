import { beforeEach, describe, expect, it } from "vitest";
import { getTestInstance } from "../test-utils/test-instance";
import { safeJSONParse } from "../utils/json";

describe("secondary storage - get returns JSON string", async () => {
	let store = new Map<string, string>();

	const { client, signInWithTestUser } = await getTestInstance({
		secondaryStorage: {
			set(key, value, ttl) {
				store.set(key, value);
			},
			get(key) {
				return store.get(key) || null;
			},
			delete(key) {
				store.delete(key);
			},
		},
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
	let store = new Map<string, any>();

	const { client, signInWithTestUser } = await getTestInstance({
		secondaryStorage: {
			set(key, value, ttl) {
				store.set(key, safeJSONParse(value));
			},
			get(key) {
				return store.get(key);
			},
			delete(key) {
				store.delete(key);
			},
		},
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

describe("secondary storage with preserveSessionInDatabase", async () => {
	let store = new Map<string, string>();

	const { client, signInWithTestUser, auth, db } = await getTestInstance({
		secondaryStorage: {
			set(key, value, ttl) {
				store.set(key, value);
			},
			get(key) {
				return store.get(key) || null;
			},
			delete(key) {
				store.delete(key);
			},
		},
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

	it("should preserve session in database when revoked", async () => {
		const { headers } = await signInWithTestUser();
		expect(store.size).toBe(2);

		const s1 = await client.getSession({
			fetchOptions: { headers },
		});
		expect(s1.data).not.toBeNull();
		const token = s1.data!.session.token;
		const userId = s1.data!.session.userId;

		// Verify session exists in database before revocation
		const sessionBeforeRevoke = (await db.findOne({
			model: "session",
			where: [{ field: "token", value: token }],
		})) as { token: string; expiresAt: Date } | null;
		expect(sessionBeforeRevoke).toBeDefined();
		const originalExpiresAt = sessionBeforeRevoke!.expiresAt;
		expect(originalExpiresAt.getTime()).toBeGreaterThan(Date.now());

		// Revoke the session
		const revoke = await client.revokeSession({
			fetchOptions: { headers },
			token,
		});
		expect(revoke.data?.status).toBe(true);

		// Verify session is deleted from secondary storage
		const afterRevoke = await client.getSession({ fetchOptions: { headers } });
		expect(afterRevoke.data).toBeNull();
		expect(store.size).toBe(0);

		// Verify session still exists in database but with updated expiresAt
		const sessionAfterRevoke = (await db.findOne({
			model: "session",
			where: [{ field: "token", value: token }],
		})) as { token: string; expiresAt: Date } | null;
		expect(sessionAfterRevoke).toBeDefined();
		expect(sessionAfterRevoke?.token).toBe(token);
		// The expiresAt should be set to epoch (new Date(0))
		const revokedExpiresAt = sessionAfterRevoke!.expiresAt;
		expect(revokedExpiresAt.getTime()).toBe(0);
		expect(revokedExpiresAt.getTime()).not.toBe(originalExpiresAt.getTime());
	});

	it("should preserve all sessions in database when revokeSessions is called", async () => {
		// Create multiple sessions
		const { headers: headers1 } = await signInWithTestUser();
		const { headers: headers2 } = await signInWithTestUser();

		const s1 = await client.getSession({ fetchOptions: { headers: headers1 } });
		const s2 = await client.getSession({ fetchOptions: { headers: headers2 } });
		expect(s1.data).not.toBeNull();
		expect(s2.data).not.toBeNull();

		const token1 = s1.data!.session.token;
		const token2 = s2.data!.session.token;
		const userId = s1.data!.session.userId;

		// Verify both specific sessions exist and are active in database before revocation
		const session1Before = (await db.findOne({
			model: "session",
			where: [{ field: "token", value: token1 }],
		})) as { token: string; expiresAt: Date } | null;
		const session2Before = (await db.findOne({
			model: "session",
			where: [{ field: "token", value: token2 }],
		})) as { token: string; expiresAt: Date } | null;
		expect(session1Before).toBeDefined();
		expect(session2Before).toBeDefined();
		expect(session1Before!.expiresAt.getTime()).toBeGreaterThan(Date.now());
		expect(session2Before!.expiresAt.getTime()).toBeGreaterThan(Date.now());

		// Revoke all sessions
		const revoke = await client.revokeSessions({
			fetchOptions: { headers: headers1 },
		});
		expect(revoke.data?.status).toBe(true);

		// Verify sessions are deleted from secondary storage
		// Note: revokeSessions might keep the active-sessions list temporarily
		expect(store.get(token1)).toBeUndefined();
		expect(store.get(token2)).toBeUndefined();

		// Verify sessions still exist in database but with updated expiresAt
		const allSessions = (await db.findMany({
			model: "session",
			where: [{ field: "userId", value: userId }],
		})) as { token: string; expiresAt: Date }[];
		expect(allSessions).toBeDefined();
		// There may be more than 2 sessions from previous tests, but we check our specific ones
		expect(allSessions.length).toBeGreaterThanOrEqual(2);
		// Both of our specific sessions should have expiresAt set to epoch
		const session1 = allSessions!.find((s) => s.token === token1);
		const session2 = allSessions!.find((s) => s.token === token2);
		expect(session1).toBeDefined();
		expect(session2).toBeDefined();
		expect(session1!.expiresAt.getTime()).toBe(0);
		expect(session2!.expiresAt.getTime()).toBe(0);
	});
});
