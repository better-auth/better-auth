import { safeJSONParse } from "@better-auth/core/utils/json";
import { beforeEach, describe, expect, it } from "vitest";
import { getTestInstance } from "../test-utils/test-instance";
import type { Session } from "../types";

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

describe("preserveSessionInDatabase - revokeSession", async () => {
	let store = new Map<string, string>();

	const { client, signInWithTestUser, db } = await getTestInstance({
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

	it("should remove session from secondary storage but preserve it in DB with expired expiresAt", async () => {
		expect(store.size).toBe(0);
		const { headers } = await signInWithTestUser();
		expect(store.size).toBe(2); // session token + active-sessions list

		const s1 = await client.getSession({
			fetchOptions: { headers },
		});
		expect(s1.data).not.toBeNull();
		const token = s1.data!.session.token;
		const userId = s1.data!.session.userId;

		// Verify session exists in secondary storage
		const sessionInStorage = store.get(token);
		expect(sessionInStorage).toBeTruthy();

		// Verify session exists in DB
		const sessionInDbBefore = await db.findOne<Session>({
			model: "session",
			where: [{ field: "token", value: token }],
		});
		expect(sessionInDbBefore).not.toBeNull();
		const originalExpiresAt = sessionInDbBefore!.expiresAt;

		// Revoke the session
		const revoke = await client.revokeSession({
			fetchOptions: { headers },
			token,
		});
		expect(revoke.data?.status).toBe(true);

		// Verify session is removed from secondary storage
		const sessionInStorageAfter = store.get(token);
		expect(sessionInStorageAfter).toBeUndefined();
		expect(store.size).toBe(0); // Both session token and active-sessions list should be removed

		// Verify session still exists in DB but with expired expiresAt
		const sessionInDbAfter = await db.findOne<Session>({
			model: "session",
			where: [{ field: "token", value: token }],
		});
		expect(sessionInDbAfter).not.toBeNull();
		expect(sessionInDbAfter!.token).toBe(token);
		expect(sessionInDbAfter!.userId).toBe(userId);

		// Verify expiresAt is set to 2 days ago (expired)
		const expectedExpiresAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
		const actualExpiresAt = new Date(sessionInDbAfter!.expiresAt);
		// Allow 1 second tolerance for test execution time
		const timeDiff = Math.abs(
			actualExpiresAt.getTime() - expectedExpiresAt.getTime(),
		);
		expect(timeDiff).toBeLessThan(1000);

		// Verify expiresAt is in the past
		expect(actualExpiresAt.getTime()).toBeLessThan(Date.now());

		// Verify expiresAt is different from original
		expect(actualExpiresAt.getTime()).not.toBe(
			new Date(originalExpiresAt).getTime(),
		);

		// Verify session is no longer valid (getSession should return null)
		const after = await client.getSession({ fetchOptions: { headers } });
		expect(after.data).toBeNull();
	});
});
