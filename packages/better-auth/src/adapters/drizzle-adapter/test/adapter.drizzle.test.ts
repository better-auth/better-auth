import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "./schema";
import { runAdapterTest } from "../../test";
import { drizzleAdapter } from "..";
import { getMigrations } from "../../../db/get-migration";
import { drizzle } from "drizzle-orm/node-postgres";
import type { BetterAuthOptions } from "../../../types";
import { Pool } from "pg";
import { Kysely, PostgresDialect, sql } from "kysely";
import { getTestInstance } from "../../../test-utils/test-instance";

const TEST_DB_URL = "postgres://user:password@localhost:5432/better_auth";

const createTestPool = () => new Pool({ connectionString: TEST_DB_URL });

const createKyselyInstance = (pool: Pool) =>
	new Kysely({
		dialect: new PostgresDialect({ pool }),
	});

const cleanupDatabase = async (postgres: Kysely<any>) => {
	await sql`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`.execute(
		postgres,
	);
	await postgres.destroy();
};

const createTestOptions = (pg: Pool): BetterAuthOptions => ({
	database: pg,
	user: { fields: { email: "email_address" } },
	session: { modelName: "sessions" },
});

describe("Drizzle Adapter Tests", async () => {
	let pg: Pool;
	let postgres: Kysely<any>;
	let opts: BetterAuthOptions;

	pg = createTestPool();
	postgres = createKyselyInstance(pg);
	opts = createTestOptions(pg);
	const { runMigrations } = await getMigrations(opts);
	await runMigrations();

	afterAll(async () => {
		await cleanupDatabase(postgres);
	});

	const db = drizzle(pg);
	const adapter = drizzleAdapter(db, { provider: "pg", schema });

	await runAdapterTest({
		adapter: adapter(opts),
	});
});

describe("Authentication Flow Tests", () => {
	let pg: Pool;
	let postgres: Kysely<any>;
	let auth: any;
	let client: any;
	let sessionSetter: any;
	let db: any;

	const testUser = {
		email: "test-email@email.com",
		password: "password",
		name: "Test Name",
	};

	beforeAll(async () => {
		pg = createTestPool();
		postgres = createKyselyInstance(pg);
		const opts = createTestOptions(pg);

		const { runMigrations } = await getMigrations(opts);
		await runMigrations();

		const testInstance = await getTestInstance(
			{
				...opts,
				database: drizzleAdapter(drizzle(pg), { provider: "pg", schema }),
			},
			{ disableTestUser: true },
		);

		({ auth, client, sessionSetter, db } = testInstance);
	});

	afterAll(async () => {
		await cleanupDatabase(postgres);
	});

	it("should successfully sign up a new user", async () => {
		const user = await auth.api.signUpEmail({ body: testUser });
		expect(user.user).toBeDefined();
		expect(user.session).toBeDefined();
	});

	it("should successfully sign in an existing user", async () => {
		const user = await auth.api.signInEmail({ body: testUser });
		expect(user.user).toBeDefined();
		expect(user.session).toBeDefined();
	});

	it("should retrieve a valid session for an authenticated user", async () => {
		const headers = new Headers();
		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onSuccess: sessionSetter(headers),
			},
		);
		const { data: session } = await client.getSession({
			fetchOptions: { headers },
		});
		expect(session?.user).toBeDefined();
	});
});
