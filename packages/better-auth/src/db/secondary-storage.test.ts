import { safeJSONParse } from "@better-auth/core/utils/json";
import { beforeEach, describe, expect, it } from "vitest";
import { admin } from "../plugins/admin/admin";
import { adminClient } from "../plugins/admin/client";
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

describe("secondary storage - storeSessionInDatabase", () => {
	describe("preserveSessionInDatabase: false", async () => {
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
	});
});

describe("secondary storage - admin removeUser cleans up sessions", async () => {
	const store = new Map<string, string>();

	const { client, signInWithUser, customFetchImpl } = await getTestInstance({
		plugins: [admin()],
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
