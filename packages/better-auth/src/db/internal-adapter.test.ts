import { beforeAll, expect, it, describe } from "vitest";
import type { BetterAuthOptions } from "../types";
import Database from "better-sqlite3";
import { createInternalAdapter } from "./internal-adapter";
import { getAdapter } from "./utils";
import { getMigrations } from "./get-migration";
import { SqliteDialect } from "kysely";
import { getTestInstance } from "../test-utils/test-instance";

describe("adapter test", async () => {
	const sqliteDialect = new SqliteDialect({
		database: new Database(":memory:"),
	});
	const map = new Map();
	let id = 1;
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
			generateId() {
				return (id++).toString();
			},
		},
	} satisfies BetterAuthOptions;
	beforeAll(async () => {
		(await getMigrations(opts)).runMigrations();
	});
	const adapter = await getAdapter(opts);
	const internalAdapter = createInternalAdapter(adapter, {
		options: opts,
		hooks: [
			{
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
		],
		generateId() {
			return opts.advanced.generateId();
		},
	});
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
	it("should use hooks", async () => {
		await internalAdapter.createUser({
			email: "email",
			name: "name",
			emailVerified: false,
		});
		const res = await internalAdapter.createSession("1", undefined);
		const sessionId = res.token;
		const session = await internalAdapter.findSession(sessionId);
		expect(session?.session?.activeOrganizationId).toBe("1");
	});
});
