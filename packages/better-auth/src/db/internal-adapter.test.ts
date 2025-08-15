import { beforeAll, expect, it, describe, vi, afterEach } from "vitest";
import type {
	BetterAuthOptions,
	BetterAuthPlugin,
	GenericEndpointContext,
	Session,
	User,
} from "../types";
import Database from "better-sqlite3";
import { init } from "../init";
import { getMigrations } from "./get-migration";
import { SqliteDialect } from "kysely";
import { getTestInstance } from "../test-utils/test-instance";
import { safeJSONParse } from "../utils/json";

describe("adapter test", async () => {
	const sqliteDialect = new SqliteDialect({
		database: new Database(":memory:"),
	});
	const map = new Map();
	const expirationMap = new Map();
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

	it("should create on secondary storage", async () => {
		// Create session
		const now = Date.now();
		const user = await internalAdapter.createUser(
			{
				name: "test-user",
				email: "test@email.com",
			},
			ctx as unknown as GenericEndpointContext,
		);
		const session = await internalAdapter.createSession(
			user.id,
			ctx as unknown as GenericEndpointContext,
		);
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
		expect(actualExp - expectedExp).toBeLessThanOrEqual(1); // max 1s clock drift between check and set
		expect(actualExp - expectedExp).toBeGreaterThanOrEqual(0); // max 1s clock drift between check and set

		const storedSession = safeJSONParse<{
			session: Session;
			user: User;
		}>(map.get(token));
		expect(storedSession?.user).toMatchObject(user);
		expect(storedSession?.session).toMatchObject({
			...session,
			activeOrganizationId: "1",
		});
		expect(expirationMap.get(token)).toBe(60 * 60 * 24 * 7); // 7 days();
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
				ctx as unknown as GenericEndpointContext,
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
});
