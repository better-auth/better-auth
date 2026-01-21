import { DatabaseSync } from "node:sqlite";
import type { GenericEndpointContext } from "@better-auth/core";
import { safeJSONParse } from "@better-auth/core/utils/json";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { betterAuth } from "../auth/full";
import { init } from "../context/init";
import { getTestInstance } from "../test-utils/test-instance";
import type {
	BetterAuthOptions,
	BetterAuthPlugin,
	Session,
	User,
} from "../types";
import { getMigrations } from "./get-migration";

describe("internal adapter test", async () => {
	const map = new Map();
	const expirationMap = new Map();
	let id = 1;
	const hookUserCreateBefore = vi.fn();
	const hookUserCreateAfter = vi.fn();
	const hookVerificationCreateBefore = vi.fn();
	const hookVerificationCreateAfter = vi.fn();
	const hookVerificationDeleteBefore = vi.fn();
	const hookVerificationDeleteAfter = vi.fn();
	const pluginHookUserCreateBefore = vi.fn();
	const pluginHookUserCreateAfter = vi.fn();
	const opts = {
		database: new DatabaseSync(":memory:"),
		user: {
			fields: {
				email: "email_address",
				emailVerified: "email_verified",
			},
		},
		verification: {
			storeInDatabase: true,
		},
		secondaryStorage: {
			set(key, value, ttl) {
				map.set(key, value);
				expirationMap.set(key, ttl);
			},
			get(key) {
				return map.get(key);
			},
			delete(key) {
				map.delete(key);
				expirationMap.delete(key);
			},
		},
		advanced: {
			database: {
				generateId() {
					return (id++).toString();
				},
			},
		},
		databaseHooks: {
			user: {
				create: {
					async before(user, context) {
						hookUserCreateBefore(user, context);
						return { data: user };
					},
					async after(user, context) {
						hookUserCreateAfter(user, context);
						return;
					},
				},
			},
			verification: {
				create: {
					async before(verification, context) {
						hookVerificationCreateBefore(verification, context);
						return { data: verification };
					},
					async after(verification, context) {
						hookVerificationCreateAfter(verification, context);
						return;
					},
				},
				delete: {
					async before(verification, context) {
						hookVerificationDeleteBefore(verification, context);
						return;
					},
					async after(verification, context) {
						hookVerificationDeleteAfter(verification, context);
						return;
					},
				},
			},
		},
		plugins: [
			{
				id: "test-plugin",
				init(ctx) {
					return {
						options: {
							databaseHooks: {
								user: {
									create: {
										async before(user, context) {
											pluginHookUserCreateBefore(user, context);
											return { data: user };
										},
										async after(user, context) {
											pluginHookUserCreateAfter(user, context);
										},
									},
								},
								session: {
									create: {
										before: async (session) => {
											return {
												data: {
													...session,
													activeOrganizationId: "1",
												},
											};
										},
									},
								},
							},
						},
					};
				},
			} satisfies BetterAuthPlugin,
		],
	} satisfies BetterAuthOptions;
	beforeAll(async () => {
		(await getMigrations(opts)).runMigrations();
	});
	afterEach(async () => {
		vi.clearAllMocks();
		map.clear();
	});
	const authContext = await init(opts);
	const internalAdapter = authContext.internalAdapter;

	it("should create oauth user with custom generate id", async () => {
		const user = await internalAdapter.createOAuthUser(
			{
				email: "email@email.com",
				name: "name",
				emailVerified: false,
			},
			{
				providerId: "provider",
				accountId: "account",
				accessTokenExpiresAt: new Date(),
				refreshTokenExpiresAt: new Date(),
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		);
		expect(user).toMatchObject({
			user: {
				id: "1",
				name: "name",
				email: "email@email.com",
				emailVerified: false,
				image: null,
				createdAt: expect.any(Date),
				updatedAt: expect.any(Date),
			},
			account: {
				id: "2",
				userId: expect.any(String),
				providerId: "provider",
				accountId: "account",
				accessToken: null,
				refreshToken: null,
				refreshTokenExpiresAt: expect.any(Date),
				accessTokenExpiresAt: expect.any(Date),
			},
		});
		expect(user?.user.id).toBe(user?.account.userId);
		expect(pluginHookUserCreateAfter).toHaveBeenCalledOnce();
		expect(pluginHookUserCreateBefore).toHaveBeenCalledOnce();
		expect(hookUserCreateAfter).toHaveBeenCalledOnce();
		expect(hookUserCreateBefore).toHaveBeenCalledOnce();
	});
	it("should find session with custom userId", async () => {
		const { client, signInWithTestUser } = await getTestInstance({
			session: {
				fields: {
					userId: "user_id",
				},
			},
		});
		const { headers } = await signInWithTestUser();
		const session = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(session.data?.session).toBeDefined();
	});

	it("should delete expired verification values on find", async () => {
		await internalAdapter.createVerificationValue({
			identifier: `test-id-1`,
			value: "test-id-1",
			expiresAt: new Date(Date.now() - 1000),
		});
		expect(hookVerificationCreateBefore).toHaveBeenCalledOnce();
		expect(hookVerificationCreateAfter).toHaveBeenCalledOnce();

		const value = await internalAdapter.findVerificationValue("test-id-1");
		expect(value).toMatchObject({
			identifier: "test-id-1",
		});
		expect(hookVerificationDeleteBefore).toHaveBeenCalledOnce();
		expect(hookVerificationDeleteAfter).toHaveBeenCalledOnce();

		const value2 = await internalAdapter.findVerificationValue("test-id-1");
		expect(value2).toBeNull();
		await internalAdapter.createVerificationValue({
			identifier: `test-id-1`,
			value: "test-id-1",
			expiresAt: new Date(Date.now() + 1000),
		});
		const value3 = await internalAdapter.findVerificationValue("test-id-1");
		expect(value3).toMatchObject({
			identifier: "test-id-1",
		});
		const value4 = await internalAdapter.findVerificationValue("test-id-1");
		expect(value4).toMatchObject({
			identifier: "test-id-1",
		});
	});

	it("should delete verification by value with hooks", async () => {
		const verification = await internalAdapter.createVerificationValue({
			identifier: `test-id-1`,
			value: "test-id-1",
			expiresAt: new Date(Date.now() + 1000),
		});

		await internalAdapter.deleteVerificationValue(verification.id);
		expect(hookVerificationDeleteBefore).toHaveBeenCalledOnce();
		expect(hookVerificationDeleteAfter).toHaveBeenCalledOnce();
	});

	it("should delete verification by identifier with hooks", async () => {
		const verification = await internalAdapter.createVerificationValue({
			identifier: `test-id-1`,
			value: "test-id-1",
			expiresAt: new Date(Date.now() + 1000),
		});

		await internalAdapter.deleteVerificationByIdentifier(
			verification.identifier,
		);
		expect(hookVerificationDeleteBefore).toHaveBeenCalledOnce();
		expect(hookVerificationDeleteAfter).toHaveBeenCalledOnce();
	});

	describe("verification token storage", () => {
		it("should hash identifier when storeIdentifier is 'hashed'", async () => {
			const hashedOpts = {
				database: new DatabaseSync(":memory:"),
				verification: {
					storeIdentifier: "hashed" as const,
				},
			} satisfies BetterAuthOptions;

			(await getMigrations(hashedOpts)).runMigrations();
			const hashedCtx = await init(hashedOpts);
			const hashedAdapter = hashedCtx.internalAdapter;

			const verification = await hashedAdapter.createVerificationValue({
				identifier: "reset-password:my-token-123",
				value: "user-id-123",
				expiresAt: new Date(Date.now() + 60000),
			});

			// Stored identifier should be hashed (not equal to original)
			expect(verification.identifier).not.toBe("reset-password:my-token-123");

			// Should be able to find by original identifier
			const found = await hashedAdapter.findVerificationValue(
				"reset-password:my-token-123",
			);
			expect(found).toBeDefined();
			expect(found?.value).toBe("user-id-123");

			// Should be able to delete by original identifier
			await hashedAdapter.deleteVerificationByIdentifier(
				"reset-password:my-token-123",
			);
			const deleted = await hashedAdapter.findVerificationValue(
				"reset-password:my-token-123",
			);
			expect(deleted).toBeNull();
		});

		it("should use overrides for specific prefixes", async () => {
			const overrideOpts = {
				database: new DatabaseSync(":memory:"),
				verification: {
					storeIdentifier: {
						default: "plain" as const,
						overrides: {
							"reset-password": "hashed" as const,
						},
					},
				},
			} satisfies BetterAuthOptions;

			(await getMigrations(overrideOpts)).runMigrations();
			const overrideCtx = await init(overrideOpts);
			const overrideAdapter = overrideCtx.internalAdapter;

			// reset-password should be hashed
			const hashedVerification = await overrideAdapter.createVerificationValue({
				identifier: "reset-password:token-abc",
				value: "user-1",
				expiresAt: new Date(Date.now() + 60000),
			});
			expect(hashedVerification.identifier).not.toBe(
				"reset-password:token-abc",
			);

			// other identifiers should be plain
			const plainVerification = await overrideAdapter.createVerificationValue({
				identifier: "magic-link:token-xyz",
				value: "user-2",
				expiresAt: new Date(Date.now() + 60000),
			});
			expect(plainVerification.identifier).toBe("magic-link:token-xyz");
		});

		it("should fallback to plain lookup for old tokens", async () => {
			const database = new DatabaseSync(":memory:");

			// First create with plain storage
			const plainOpts = {
				database,
				verification: { storeIdentifier: "plain" as const },
			} satisfies BetterAuthOptions;

			(await getMigrations(plainOpts)).runMigrations();
			const plainCtx = await init(plainOpts);
			await plainCtx.internalAdapter.createVerificationValue({
				identifier: "old-token:abc123",
				value: "old-value",
				expiresAt: new Date(Date.now() + 60000),
			});

			// Now switch to hashed storage (simulating config change)
			const hashedOpts = {
				database,
				verification: { storeIdentifier: "hashed" as const },
			} satisfies BetterAuthOptions;

			const hashedCtx = await init(hashedOpts);

			// Should still find old plain token via fallback
			const found =
				await hashedCtx.internalAdapter.findVerificationValue(
					"old-token:abc123",
				);
			expect(found).toBeDefined();
			expect(found?.value).toBe("old-value");
		});
	});

	it("runs the after hook after adding user to db", async () => {
		const sampleUser = {
			name: "sample",
			email: "sample@sampling.com",
			password: "some-sample-password",
		};
		const hookUserCreateAfter = vi.fn();

		const database = new DatabaseSync(":memory:");

		const opts = {
			database,
			databaseHooks: {
				user: {
					create: {
						async after(user, context) {
							hookUserCreateAfter(user, context);

							const userFromDb = database
								.prepare("SELECT * FROM user WHERE id = ?")
								.get(user.id)!;

							expect(user.id).toBe(userFromDb.id);
							expect(user.name).toBe(userFromDb.name);
							expect(user.email).toBe(userFromDb.email);
							expect(user.image).toBe(userFromDb.image);
							expect(user.emailVerified).toBe(
								Boolean(userFromDb.emailVerified),
							);
							expect(user.createdAt).toStrictEqual(
								new Date(userFromDb.createdAt as string),
							);
							expect(user.updatedAt).toStrictEqual(
								new Date(userFromDb.updatedAt as string),
							);
						},
					},
				},
			},
			emailAndPassword: { enabled: true },
		} satisfies BetterAuthOptions;

		const migrations = await getMigrations(opts);
		await migrations.runMigrations();

		const auth = betterAuth(opts);

		await auth.api.signUpEmail({
			body: {
				name: sampleUser.name,
				email: sampleUser.email,
				password: sampleUser.password,
			},
		});

		expect(hookUserCreateAfter).toHaveBeenCalledOnce();
	});

	it("should calculate TTL correctly with Math.floor for secondary storage", async () => {
		const mockStorage = new Map<
			string,
			{ value: string; ttl?: number | undefined }
		>();
		const capturedTTLs: number[] = [];

		const testOpts = {
			database: new DatabaseSync(":memory:"),
			secondaryStorage: {
				set(key: string, value: string, ttl?: number | undefined) {
					if (ttl !== undefined) {
						capturedTTLs.push(ttl);
						mockStorage.set(key, { value, ttl });
					} else {
						mockStorage.set(key, { value });
					}
				},
				get(key: string) {
					const item = mockStorage.get(key);
					return item?.value || null;
				},
				delete(key: string) {
					mockStorage.delete(key);
				},
			},
		} satisfies BetterAuthOptions;

		// Run migrations for the new database
		(await getMigrations(testOpts)).runMigrations();

		// Test the actual refreshUserSessions functionality from internal adapter
		const testCtx = await init(testOpts);
		const ctx = {
			context: testCtx,
		} as GenericEndpointContext;

		const testUser = {
			id: "test-user-id",
			name: "Test User",
			email: "test@example.com",
			emailVerified: true,
			image: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		};

		// Create a user in the database first
		await ctx.context.internalAdapter.createUser(testUser);

		// Test case 1: Session with fractional seconds in TTL
		const expiresAt = new Date(Date.now() + 3599500); // 59 minutes and 59.5 seconds from now
		const expectedTTL = Math.floor(3599500 / 1000); // Should be 3599 seconds (rounded down)

		const session = {
			id: "test-session-id",
			userId: testUser.id,
			token: "test-token",
			expiresAt,
			ipAddress: "127.0.0.1",
			userAgent: "test-agent",
		};

		// Set up active sessions and session data for refresh test
		const activeSessions = [
			{ token: session.token, expiresAt: expiresAt.getTime() },
		];

		await testCtx.options.secondaryStorage?.set(
			`active-sessions-${testUser.id}`,
			JSON.stringify(activeSessions),
		);

		await testCtx.options.secondaryStorage?.set(
			session.token,
			JSON.stringify({ session, user: testUser }),
		);

		// Trigger refreshUserSessions by updating the user
		await ctx.context.internalAdapter.updateUser(testUser.id, {
			name: "Updated Name",
		});

		// The TTL should be properly rounded down
		const lastTTL = capturedTTLs[capturedTTLs.length - 1];
		expect(lastTTL).toBeLessThanOrEqual(expectedTTL);
		expect(lastTTL).toBeGreaterThanOrEqual(expectedTTL - 1); // Allow for 1 second of test execution time

		// Test case 2: Very small TTL (less than 1 second should round to 0)
		capturedTTLs.length = 0; // Clear array
		const almostExpiredSession = {
			...session,
			token: "almost-expired-token",
			expiresAt: new Date(Date.now() + 500), // 0.5 seconds from now
		};

		await testCtx.options.secondaryStorage?.set(
			`active-sessions-${testUser.id}`,
			JSON.stringify([
				{
					token: almostExpiredSession.token,
					expiresAt: almostExpiredSession.expiresAt.getTime(),
				},
			]),
		);

		await testCtx.options.secondaryStorage?.set(
			almostExpiredSession.token,
			JSON.stringify({ session: almostExpiredSession, user: testUser }),
		);

		await ctx.context.internalAdapter.updateUser(testUser.id, {
			name: "Updated Again",
		});

		// Should be rounded down to 0
		expect(capturedTTLs.at(-1)).toBe(0);

		// Test case 3: Large TTL with fractional component
		capturedTTLs.length = 0; // Clear array
		const longSession = {
			...session,
			token: "long-token",
			expiresAt: new Date(Date.now() + 7199999), // ~2 hours from now (7199.999 seconds)
		};

		await testCtx.options.secondaryStorage?.set(
			`active-sessions-${testUser.id}`,
			JSON.stringify([
				{
					token: longSession.token,
					expiresAt: longSession.expiresAt.getTime(),
				},
			]),
		);

		await testCtx.options.secondaryStorage?.set(
			longSession.token,
			JSON.stringify({ session: longSession, user: testUser }),
		);

		await ctx.context.internalAdapter.updateUser(testUser.id, {
			name: "Final Update",
		});

		// Should be rounded down to 7199
		const finalTTL = capturedTTLs.at(-1);
		expect(finalTTL).toBeLessThanOrEqual(7199);
		expect(finalTTL).toBeGreaterThanOrEqual(7198); // Allow for test execution time
	});

	it("should create on secondary storage", async () => {
		// Create session
		const now = Date.now();
		const expiresAt = new Date(now + 60 * 60 * 24 * 7 * 1000);
		const user = await internalAdapter.createUser({
			name: "test-user",
			email: "test@email.com",
		});
		const session = await internalAdapter.createSession(user.id);

		// Session should have an id
		expect(session.id).toBeDefined();
		expect(typeof session.id).toBe("string");

		const storedSessions: { token: string; expiresAt: number }[] = JSON.parse(
			map.get(`active-sessions-${user.id}`),
		);
		const token = session.token;
		// Check stored sessions
		expect(storedSessions.length).toBe(1);
		expect(storedSessions.at(0)?.token).toBe(session.token);
		// Check expiration time set is the last expiration set
		const lastExpiration = storedSessions.reduce((prev, curr) =>
			prev.expiresAt >= curr.expiresAt ? prev : curr,
		);
		const actualExp = expirationMap.get(`active-sessions-${user.id}`);
		const expectedExp = Math.floor(
			(lastExpiration.expiresAt - Date.now()) / 1000,
		);
		// max 1s clock drift between check and set
		expect(actualExp - expectedExp).toBeLessThanOrEqual(1);
		expect(actualExp - expectedExp).toBeGreaterThanOrEqual(0);

		const storedSession = safeJSONParse<{
			session: Session;
			user: User;
		}>(map.get(token));
		expect(storedSession?.user).toMatchObject(user);
		expect(storedSession?.session).toMatchObject({
			...session,
			activeOrganizationId: "1",
		});
		const actualTokenExp = expirationMap.get(token);
		const expectedTokenExp = Math.floor(
			(expiresAt.getTime() - Date.now()) / 1000,
		);
		// max 1s clock drift between check and set
		expect(actualTokenExp - expectedTokenExp).toBeLessThanOrEqual(1);
		expect(actualTokenExp - expectedTokenExp).toBeGreaterThanOrEqual(0);
	});

	it("should delete on secondary storage", async () => {
		// Create multiple sessions in past and future
		const now = Date.now();
		const userId = "test-user";
		// 10 consecutive days (5 in past, 1 now, 4 in future)
		for (let i = -5; i < 5; i++) {
			const expiresIn = i * 60 * 60 * 24 * 1000;
			const expiresAt = new Date(now + expiresIn);
			await internalAdapter.createSession(
				userId,
				undefined,
				{
					expiresAt,
				},
				true,
			);
			if (i > 0) {
				const actualExp = expirationMap.get(`active-sessions-${userId}`);
				const expectedExp = Math.floor(
					(expiresAt.getTime() - Date.now()) / 1000,
				);
				expect(actualExp - expectedExp).toBeLessThanOrEqual(1); // max 1s clock drift between check and set
				expect(actualExp - expectedExp).toBeGreaterThanOrEqual(0); // max 1s clock drift between check and set
			} else {
				expect(expirationMap.get(`active-sessions-${userId}`)).toBeUndefined();
			}
		}
		const storedSessions: { token: string; expiresAt: number }[] = JSON.parse(
			map.get(`active-sessions-${userId}`),
		);
		expect(storedSessions.length).toBe(4);
		const token = storedSessions.at(-1)?.token;
		const tokenStored = map.get(token);
		expect(tokenStored).toBeDefined();

		// Delete session should clean expiresAt and token
		await internalAdapter.deleteSession(token!);
		const afterDeleted: { token: string; expiresAt: number }[] = JSON.parse(
			map.get(`active-sessions-${userId}`),
		);
		expect(afterDeleted.length).toBe(3);
		const removedToken = map.get(token);
		expect(removedToken).toBeUndefined();
		// Check expiration time set is the last expiration set
		const lastExpiration = afterDeleted.reduce((prev, curr) =>
			prev.expiresAt >= curr.expiresAt ? prev : curr,
		);
		const actualExp = expirationMap.get(`active-sessions-${userId}`);
		const expectedExp = Math.floor(
			(lastExpiration.expiresAt - Date.now()) / 1000,
		);
		expect(actualExp - expectedExp).toBeLessThanOrEqual(1); // max 1s clock drift between check and set
		expect(actualExp - expectedExp).toBeGreaterThanOrEqual(0); // max 1s clock drift between check and set
	});

	it("should delete a single account", async () => {
		const user = await internalAdapter.createUser({
			name: "Account Delete User",
			email: "account.delete@example.com",
		});

		const account = await internalAdapter.createAccount({
			userId: user.id,
			providerId: "test-provider",
			accountId: "test-account-id-1",
		});

		let foundAccount = await internalAdapter.findAccount(account.accountId);
		expect(foundAccount).toBeDefined();

		await internalAdapter.deleteAccount(account.id);

		foundAccount = await internalAdapter.findAccount(account.accountId);
		expect(foundAccount).toBeNull();
	});

	it("should delete multiple accounts for a user", async () => {
		const user = await internalAdapter.createUser({
			name: "Accounts Delete User",
			email: "accounts.delete@example.com",
		});

		await internalAdapter.createAccount({
			userId: user.id,
			providerId: "test-provider-1",
			accountId: "test-account-id-2",
		});

		await internalAdapter.createAccount({
			userId: user.id,
			providerId: "test-provider-2",
			accountId: "test-account-id-3",
		});

		let accounts = await internalAdapter.findAccounts(user.id);
		expect(accounts.length).toBe(2);

		await internalAdapter.deleteAccounts(user.id);

		accounts = await internalAdapter.findAccounts(user.id);
		expect(accounts.length).toBe(0);
	});

	it("should update session and active-sessions list in secondary storage", async () => {
		const testMap = new Map<string, string>();
		const testExpirationMap = new Map<string, number>();

		const testOpts = {
			database: new DatabaseSync(":memory:"),
			secondaryStorage: {
				set(key: string, value: string, ttl?: number) {
					testMap.set(key, value);
					if (ttl !== undefined) {
						testExpirationMap.set(key, ttl);
					}
				},
				get(key: string) {
					return testMap.get(key) || null;
				},
				delete(key: string) {
					testMap.delete(key);
					testExpirationMap.delete(key);
				},
			},
		} satisfies BetterAuthOptions;

		// Run migrations for the new database
		(await getMigrations(testOpts)).runMigrations();

		const testCtx = await init(testOpts);
		const testInternalAdapter = testCtx.internalAdapter;

		// Create a user first
		const user = await testInternalAdapter.createUser({
			name: "test-user-update",
			email: "test-update@email.com",
		});

		// Create a session
		const session = await testInternalAdapter.createSession(user.id);

		// Verify session is in secondary storage
		const storedSessionStr = testMap.get(session.token);
		expect(storedSessionStr).toBeDefined();

		const storedSession = safeJSONParse<{
			session: Session;
			user: User;
		}>(storedSessionStr!);

		expect(storedSession?.session.ipAddress).toBe("");

		// Get initial active-sessions list
		const initialListStr = testMap.get(`active-sessions-${user.id}`);
		expect(initialListStr).toBeDefined();
		const initialList = safeJSONParse<{ token: string; expiresAt: number }[]>(
			initialListStr!,
		);
		expect(initialList).toBeDefined();
		expect(initialList!.length).toBe(1);
		const initialExpiresAt = initialList![0]!.expiresAt;

		// Update the session with new ipAddress and expiresAt
		const updatedIpAddress = "192.168.1.1";
		const newExpiresAt = new Date(initialExpiresAt + 60 * 60 * 1000);
		await testInternalAdapter.updateSession(session.token, {
			ipAddress: updatedIpAddress,
			expiresAt: newExpiresAt,
		});

		// Get the session from secondary storage again
		const updatedStoredSessionStr = testMap.get(session.token);
		expect(updatedStoredSessionStr).toBeDefined();

		const updatedStoredSession = safeJSONParse<{
			session: Session;
			user: User;
		}>(updatedStoredSessionStr!);

		// The session in secondary storage MUST have the updated data
		expect(updatedStoredSession?.session.ipAddress).toBe(updatedIpAddress);

		// User should still be intact
		expect(updatedStoredSession?.user.id).toBe(user.id);

		// Get updated active-sessions list
		const updatedListStr = testMap.get(`active-sessions-${user.id}`);
		expect(updatedListStr).toBeDefined();
		const updatedList = safeJSONParse<{ token: string; expiresAt: number }[]>(
			updatedListStr!,
		);
		expect(updatedList).toBeDefined();

		// The expiresAt in active-sessions list should be updated
		expect(updatedList!.length).toBe(1);
		expect(updatedList![0]!.token).toBe(session.token);
		expect(updatedList![0]!.expiresAt).toBe(newExpiresAt.getTime());

		// TTL should also be updated
		const updatedTTL = testExpirationMap.get(`active-sessions-${user.id}`);
		const expectedTTL = Math.floor(
			(newExpiresAt.getTime() - Date.now()) / 1000,
		);
		expect(updatedTTL).toBeDefined();
		expect(updatedTTL! - expectedTTL).toBeLessThanOrEqual(1);
		expect(updatedTTL! - expectedTTL).toBeGreaterThanOrEqual(0);
	});

	it("should deduplicate sessions when active-sessions list contains duplicates", async () => {
		const testMap = new Map<string, string>();
		const testExpirationMap = new Map<string, number>();

		const testOpts = {
			database: new DatabaseSync(":memory:"),
			secondaryStorage: {
				set(key: string, value: string, ttl?: number) {
					testMap.set(key, value);
					if (ttl !== undefined) {
						testExpirationMap.set(key, ttl);
					}
				},
				get(key: string) {
					return testMap.get(key) || null;
				},
				delete(key: string) {
					testMap.delete(key);
					testExpirationMap.delete(key);
				},
			},
		} satisfies BetterAuthOptions;

		(await getMigrations(testOpts)).runMigrations();
		const testAuthContext = await init(testOpts);
		const testInternalAdapter = testAuthContext.internalAdapter;

		// Create a user
		const user = await testInternalAdapter.createUser({
			name: "corrupt-sessions-test-user",
			email: "corrupt-sessions-test@example.com",
		});

		// Create a session
		const session = await testInternalAdapter.createSession(user.id);

		// Manually corrupt the active-sessions list by adding duplicate tokens
		const listStr = testMap.get(`active-sessions-${user.id}`);
		const list = safeJSONParse<{ token: string; expiresAt: number }[]>(
			listStr!,
		);

		// Add duplicates of the same token
		const corruptedList = [
			...list!,
			{ token: session.token, expiresAt: session.expiresAt.getTime() },
			{ token: session.token, expiresAt: session.expiresAt.getTime() },
		];
		testMap.set(`active-sessions-${user.id}`, JSON.stringify(corruptedList));

		// Verify corruption
		const corruptedListStr = testMap.get(`active-sessions-${user.id}`);
		const parsed = safeJSONParse<{ token: string; expiresAt: number }[]>(
			corruptedListStr!,
		);
		expect(parsed!.length).toBe(3); // 1 original + 2 duplicates

		// listSessions should deduplicate and return only unique sessions
		const sessions = await testInternalAdapter.listSessions(user.id);
		expect(sessions.length).toBe(1);
	});

	describe("verification secondary storage", () => {
		function createMockStorage() {
			const dataMap = new Map<string, string>();
			const ttlMap = new Map<string, number>();
			return {
				dataMap,
				ttlMap,
				storage: {
					set(key: string, value: string, ttl?: number) {
						dataMap.set(key, value);
						if (ttl) ttlMap.set(key, ttl);
					},
					get(key: string) {
						return dataMap.get(key) || null;
					},
					delete(key: string) {
						dataMap.delete(key);
						ttlMap.delete(key);
					},
				},
			};
		}

		it("should store verification in secondary storage by default", async () => {
			const { dataMap, ttlMap, storage } = createMockStorage();

			const secondaryOnlyOpts = {
				database: new DatabaseSync(":memory:"),
				secondaryStorage: storage,
			} satisfies BetterAuthOptions;

			(await getMigrations(secondaryOnlyOpts)).runMigrations();
			const ctx = await init(secondaryOnlyOpts);

			const verification = await ctx.internalAdapter.createVerificationValue({
				identifier: "test-verification",
				value: "test-value",
				expiresAt: new Date(Date.now() + 60000),
			});

			expect(dataMap.has(`verification:${verification.identifier}`)).toBe(true);
			expect(ttlMap.has(`verification:${verification.identifier}`)).toBe(true);
		});

		it("should find verification from secondary storage", async () => {
			const { storage } = createMockStorage();

			const secondaryOnlyOpts = {
				database: new DatabaseSync(":memory:"),
				secondaryStorage: storage,
			} satisfies BetterAuthOptions;

			(await getMigrations(secondaryOnlyOpts)).runMigrations();
			const ctx = await init(secondaryOnlyOpts);

			await ctx.internalAdapter.createVerificationValue({
				identifier: "find-test",
				value: "find-value",
				expiresAt: new Date(Date.now() + 60000),
			});

			const found =
				await ctx.internalAdapter.findVerificationValue("find-test");
			expect(found).not.toBeNull();
			expect(found?.identifier).toBe("find-test");
			expect(found?.value).toBe("find-value");
		});

		it("should NOT store in database when secondary-only mode", async () => {
			const { dataMap, storage } = createMockStorage();

			const secondaryOnlyOpts = {
				database: new DatabaseSync(":memory:"),
				secondaryStorage: storage,
			} satisfies BetterAuthOptions;

			(await getMigrations(secondaryOnlyOpts)).runMigrations();
			const ctx = await init(secondaryOnlyOpts);

			await ctx.internalAdapter.createVerificationValue({
				identifier: "secondary-only-test",
				value: "test-value",
				expiresAt: new Date(Date.now() + 60000),
			});

			expect(dataMap.has("verification:secondary-only-test")).toBe(true);

			dataMap.clear();
			const found = await ctx.internalAdapter.findVerificationValue(
				"secondary-only-test",
			);
			expect(found).toBeNull(); // Proves DB was NOT used
		});

		it("should delete verification from secondary storage", async () => {
			const { dataMap, storage } = createMockStorage();

			const secondaryOnlyOpts = {
				database: new DatabaseSync(":memory:"),
				secondaryStorage: storage,
			} satisfies BetterAuthOptions;

			(await getMigrations(secondaryOnlyOpts)).runMigrations();
			const ctx = await init(secondaryOnlyOpts);

			await ctx.internalAdapter.createVerificationValue({
				identifier: "delete-test",
				value: "delete-value",
				expiresAt: new Date(Date.now() + 60000),
			});

			expect(dataMap.has("verification:delete-test")).toBe(true);

			await ctx.internalAdapter.deleteVerificationByIdentifier("delete-test");

			expect(dataMap.has("verification:delete-test")).toBe(false);
		});

		it("should store in both when storeInDatabase is true", async () => {
			const { dataMap, storage } = createMockStorage();

			const dualStorageOpts = {
				database: new DatabaseSync(":memory:"),
				verification: {
					storeInDatabase: true,
				},
				secondaryStorage: storage,
			} satisfies BetterAuthOptions;

			(await getMigrations(dualStorageOpts)).runMigrations();
			const ctx = await init(dualStorageOpts);

			await ctx.internalAdapter.createVerificationValue({
				identifier: "both-test",
				value: "both-value",
				expiresAt: new Date(Date.now() + 60000),
			});

			expect(dataMap.has("verification:both-test")).toBe(true);

			dataMap.clear();
			const found =
				await ctx.internalAdapter.findVerificationValue("both-test");
			expect(found).not.toBeNull();
			expect(found?.value).toBe("both-value");
		});

		it("should fallback to database when not in secondary storage", async () => {
			const { dataMap, storage } = createMockStorage();

			const dualStorageOpts = {
				database: new DatabaseSync(":memory:"),
				verification: {
					storeInDatabase: true,
				},
				secondaryStorage: storage,
			} satisfies BetterAuthOptions;

			(await getMigrations(dualStorageOpts)).runMigrations();
			const ctx = await init(dualStorageOpts);

			await ctx.internalAdapter.createVerificationValue({
				identifier: "fallback-test",
				value: "fallback-value",
				expiresAt: new Date(Date.now() + 60000),
			});

			dataMap.clear();

			const found =
				await ctx.internalAdapter.findVerificationValue("fallback-test");
			expect(found).not.toBeNull();
			expect(found?.value).toBe("fallback-value");
		});

		it("should set correct TTL based on expiresAt", async () => {
			const { ttlMap, storage } = createMockStorage();

			const secondaryOnlyOpts = {
				database: new DatabaseSync(":memory:"),
				secondaryStorage: storage,
			} satisfies BetterAuthOptions;

			(await getMigrations(secondaryOnlyOpts)).runMigrations();
			const ctx = await init(secondaryOnlyOpts);

			const expiresIn = 300000; // 5 minutes in ms
			const expiresAt = new Date(Date.now() + expiresIn);

			await ctx.internalAdapter.createVerificationValue({
				identifier: "ttl-test",
				value: "ttl-value",
				expiresAt,
			});

			const ttl = ttlMap.get("verification:ttl-test");
			expect(ttl).toBeDefined();
			expect(ttl).toBeGreaterThanOrEqual(298);
			expect(ttl).toBeLessThanOrEqual(300);
		});
	});
});
