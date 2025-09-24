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
});
