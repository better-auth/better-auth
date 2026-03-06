import { safeJSONParse } from "@better-auth/core/utils/json";
import { beforeEach, describe, expect, it } from "vitest";
import { getTestInstance } from "../test-utils/test-instance";

describe("secondary storage - get returns JSON string", async () => {
	const store = new Map<string, string>();

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
				id: expect.any(String),
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

describe("secondary storage - session id in storage (secondary only)", async () => {
	const store = new Map<string, string>();

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

	it("should include session id in secondary storage data", async () => {
		const { headers } = await signInWithTestUser();

		const s1 = await client.getSession({
			fetchOptions: { headers },
		});
		expect(s1.data).not.toBeNull();

		const sessionId = s1.data!.session.id;
		expect(sessionId).toBeDefined();
		expect(typeof sessionId).toBe("string");
		expect(sessionId.length).toBeGreaterThan(0);

		// Verify the raw stored data also contains the id
		const token = s1.data!.session.token;
		const raw = store.get(token);
		expect(raw).toBeDefined();
		const parsed = JSON.parse(raw!);
		expect(parsed.session.id).toBe(sessionId);
	});
});

describe("secondary storage - session id in storage (both storages)", async () => {
	const store = new Map<string, string>();

	const { client, signInWithTestUser } = await getTestInstance({
		session: {
			storeSessionInDatabase: true,
		},
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

	it("should include session id in secondary storage data when storeSessionInDatabase is true", async () => {
		const { headers } = await signInWithTestUser();

		const s1 = await client.getSession({
			fetchOptions: { headers },
		});
		expect(s1.data).not.toBeNull();

		const sessionId = s1.data!.session.id;
		expect(sessionId).toBeDefined();
		expect(typeof sessionId).toBe("string");
		expect(sessionId.length).toBeGreaterThan(0);

		// Verify the raw stored data also contains the id
		const token = s1.data!.session.token;
		const raw = store.get(token);
		expect(raw).toBeDefined();
		const parsed = JSON.parse(raw!);
		expect(parsed.session.id).toBe(sessionId);
	});
});

describe("secondary storage - get returns already-parsed object", async () => {
	const store = new Map<string, any>();

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
