import { beforeAll, expect, it, describe, vi, afterEach } from "vitest";
import type { BetterAuthOptions, BetterAuthPlugin } from "../types";
import Database from "better-sqlite3";
import { init } from "../init";
import { betterAuth } from "../auth";
import { getMigrations } from "./get-migration";
import { Kysely, SqliteDialect } from "kysely";
import { getTestInstance } from "../test-utils/test-instance";

describe("adapter test", async () => {
	const sqliteDialect = new SqliteDialect({
		database: new Database(":memory:"),
	});
	const map = new Map();
	let id = 1;
	const hookUserCreateBefore = vi.fn();
	const hookUserCreateAfter = vi.fn();
	const pluginHookUserCreateBefore = vi.fn();
	const pluginHookUserCreateAfter = vi.fn();
	const opts = {
		database: {
			dialect: sqliteDialect,
			type: "sqlite",
		},
		user: {
			fields: {
				email: "email_address",
				emailVerified: "email_verified",
			},
		},
		secondaryStorage: {
			set(key, value, ttl) {
				map.set(key, value);
			},
			get(key) {
				return map.get(key);
			},
			delete(key) {
				map.delete(key);
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
	});
	const ctx = await init(opts);
	const internalAdapter = ctx.internalAdapter;

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
		const value = await internalAdapter.findVerificationValue("test-id-1");
		expect(value).toMatchObject({
			identifier: "test-id-1",
		});
		const value2 = await internalAdapter.findVerificationValue("test-id-1");
		expect(value2).toBe(undefined);
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

	it("runs the after hook after adding user to db", async () => {
		const sampleUser = {
			name: "sample",
			email: "sample@sampling.com",
			password: "sampliiiiiing",
		};
		const hookUserCreateAfter = vi.fn();

		const dialect = new SqliteDialect({
			database: new Database(":memory:"),
		});

		const db = new Kysely<any>({
			dialect,
		});

		const opts: BetterAuthOptions = {
			database: {
				dialect,
				type: "sqlite",
			},
			databaseHooks: {
				user: {
					create: {
						async after(user, context) {
							hookUserCreateAfter(user, context);

							const userFromDb: any = await db
								.selectFrom("user")
								.selectAll()
								.where("id", "=", user.id)
								.executeTakeFirst();

							expect(user.id).toBe(userFromDb.id);
							expect(user.name).toBe(userFromDb.name);
							expect(user.email).toBe(userFromDb.email);
							expect(user.image).toBe(userFromDb.image);
							expect(user.emailVerified).toBe(
								Boolean(userFromDb.emailVerified),
							);
							expect(user.createdAt).toStrictEqual(
								new Date(userFromDb.createdAt),
							);
							expect(user.updatedAt).toStrictEqual(
								new Date(userFromDb.updatedAt),
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
		const mockStorage = new Map<string, { value: string; ttl?: number }>();
		const capturedTTLs: number[] = [];

		const testOpts = {
			database: {
				dialect: new SqliteDialect({
					database: new Database(":memory:"),
				}),
				type: "sqlite",
			},
			secondaryStorage: {
				set(key: string, value: string, ttl?: number) {
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
		await testCtx.internalAdapter.createUser(testUser);

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
		await testCtx.internalAdapter.updateUser(testUser.id, {
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

		await testCtx.internalAdapter.updateUser(testUser.id, {
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

		await testCtx.internalAdapter.updateUser(testUser.id, {
			name: "Final Update",
		});

		// Should be rounded down to 7199
		const finalTTL = capturedTTLs.at(-1);
		expect(finalTTL).toBeLessThanOrEqual(7199);
		expect(finalTTL).toBeGreaterThanOrEqual(7198); // Allow for test execution time
	});

	it("should remove subaddressing if option is true in createUser", async () => {
		const optsWithSubaddressing = {
			...opts,
			user: {
				...opts.user,
				normalizeEmailSubaddressing: true,
			},
		} satisfies BetterAuthOptions;
		const ctxSubaddressing = await init(optsWithSubaddressing);
		const internalAdapterSubaddressing = ctxSubaddressing.internalAdapter;
		
		const user = await internalAdapterSubaddressing.createUser({
			email: "user+tag@example.com",
			name: "name",
		});
		expect(user.email).toBe("user@example.com");

		const fetchedUser = await internalAdapterSubaddressing.findUserByEmail("user+someothertag@example.com");
		expect(fetchedUser?.user.id).toBe(user.id);
		expect(fetchedUser?.user.email).toBe("user@example.com");

		const updatedUser = await internalAdapterSubaddressing.updateUserByEmail("user+someothertag@example.com", {
			name: "new name",
		});
		expect(updatedUser?.email).toBe("user@example.com");
	});

	it("should create and find oauth user with subaddressing normalized email", async () => {
		const optsWithSubaddressing = {
			...opts,
			user: {
				...opts.user,
				normalizeEmailSubaddressing: true,
			},
		} satisfies BetterAuthOptions;
		const ctxSubaddressing = await init(optsWithSubaddressing);
		const internalAdapterSubaddressing = ctxSubaddressing.internalAdapter;

		const user = await internalAdapterSubaddressing.createOAuthUser(
			{
				email: "user+tag@example.com",
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
		expect(user.user.email).toBe("user@example.com")

		const fetchedUser = await internalAdapterSubaddressing.findUserByEmail("user+tag@example.com");
		expect(fetchedUser?.user.id).toBe(user.user.id);
		expect(fetchedUser?.user.email).toBe("user@example.com");

		const fetchedUser2 = await internalAdapterSubaddressing.findUserByEmail("user@example.com");
		expect(fetchedUser2?.user.id).toBe(user.user.id);
		expect(fetchedUser2?.user.email).toBe("user@example.com");
	});
});
