import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "./schema";
import { runAdapterTest } from "../../test";
import { drizzleAdapter } from "..";
import { getMigrations } from "../../../db/get-migration";
import { drizzle } from "drizzle-orm/node-postgres";
import type { BetterAuthOptions } from "../../../types";
import { Pool } from "pg";
import { Kysely, PostgresDialect, sql } from "kysely";
import { betterAuth } from "../../../auth";

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
	user: {
		fields: { email: "email_address" },
		additionalFields: {
			test: {
				type: "string",
				defaultValue: "test",
			},
		},
	},
	session: {
		modelName: "sessions",
	},
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
		getAdapter: async (customOptions = {}) => {
			return adapter({ ...opts, ...customOptions });
		},
	});
});

describe("Authentication Flow Tests", async () => {
	const pg = createTestPool();
	let postgres: Kysely<any>;
	const opts = createTestOptions(pg);
	const testUser = {
		email: "test-email@email.com",
		password: "password",
		name: "Test Name",
	};
	beforeAll(async () => {
		postgres = createKyselyInstance(pg);

		const { runMigrations } = await getMigrations(opts);
		await runMigrations();
	});

	const auth = betterAuth({
		...opts,
		database: drizzleAdapter(drizzle(pg), { provider: "pg", schema }),
		emailAndPassword: {
			enabled: true,
		},
	});

	afterAll(async () => {
		await cleanupDatabase(postgres);
	});

	it("should successfully sign up a new user", async () => {
		const user = await auth.api.signUpEmail({ body: testUser });
		expect(user).toBeDefined();
	});

	it("should successfully sign in an existing user", async () => {
		const user = await auth.api.signInEmail({ body: testUser });
		expect(user.user).toBeDefined();
	});
});

// import { afterAll, beforeAll, describe, expect, it } from "vitest";
// import * as schema from "./schema";
// import { runAdapterTest } from "../../test";
// import { drizzleAdapter } from "..";
// import { getMigrations } from "../../../db/get-migration";
// import type { BetterAuthOptions } from "../../../types";
// import { Pool } from "pg"; // PostgreSQL pool
// import { createPool } from "mysql2"; // MySQL pool
// import { Kysely, PostgresDialect, MysqlDialect, sql } from "kysely"; // Both PostgreSQL and MySQL dialects
// import { drizzle } from "drizzle-orm/node-postgres";
// import { betterAuth } from "../../../auth";
// // PostgreSQL connection string
// // const POSTGRES_DB_URL = "postgres://user:password@localhost:5432/better_auth";

// const POSTGRES_DB_URL = "postgres://user:password@localhost:5432/better_auth";
// // MySQL connection string
// const MYSQL_DB_URL = "mysql://user:password@localhost:3306/better_auth";

// // PostgreSQL pool creation
// const createPostgresPool = () =>
//   new Pool({ connectionString: POSTGRES_DB_URL });
// // MySQL pool creation
// const createMysqlPool = () => createPool({ uri: MYSQL_DB_URL });

// const createKyselyInstance = (pool: any, isPostgres: boolean) =>
//   new Kysely({
//     dialect: isPostgres
//       ? new PostgresDialect({ pool })
//       : new MysqlDialect({ pool }),
//   });

// const cleanupDatabase = async (db: Kysely<any>, isPostgres: boolean) => {
//   const query = isPostgres
//     ? sql`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`
//     : sql`DROP DATABASE IF EXISTS better_auth; CREATE DATABASE better_auth;`;
//   await query.execute(db);
//   await db.destroy();
// };

// const createTestOptions = (
//   pool: any,
//   isPostgres: boolean,
// ): BetterAuthOptions => ({
//   database: pool,
//   user: {
//     fields: { email: "email_address" },
//     additionalFields: {
//       test: {
//         type: "string",
//         defaultValue: "test",
//       },
//     },
//   },
//   session: {
//     modelName: "sessions",
//   },
// });

// describe("Drizzle Adapter Tests (Postgres)", async () => {
//   let pg: Pool;
//   let postgres: Kysely<any>;
//   let opts: BetterAuthOptions;

//   pg = createPostgresPool();
//   postgres = createKyselyInstance(pg, true); // true for Postgres
//   opts = createTestOptions(pg, true); // true for Postgres
//   const { runMigrations } = await getMigrations(opts);
//   await runMigrations();

//   afterAll(async () => {
//     await cleanupDatabase(postgres, true);
//   });

//   const db = drizzle(pg);
//   const adapter = drizzleAdapter(db, { provider: "pg", schema });

//   await runAdapterTest({
//     getAdapter: async (customOptions = {}) => {
//       return adapter({ ...opts, ...customOptions });
//     },
//   });
// });

// describe("Drizzle Adapter Tests (MySQL)", async () => {
//   let mysql: ReturnType<typeof createPool>;
//   let mysqlInstance: Kysely<any>;
//   let opts: BetterAuthOptions;

//   mysql = createMysqlPool();
//   mysqlInstance = createKyselyInstance(mysql, false);
//   opts = createTestOptions(mysql, false);
//   const { runMigrations } = await getMigrations(opts);
//   await runMigrations();

//   afterAll(async () => {
//     await cleanupDatabase(mysqlInstance, false);
//   });

//   const db = drizzle(mysql);
//   const adapter = drizzleAdapter(db, { provider: "mysql", schema });
//   await runAdapterTest({
//     getAdapter: async (customOptions = {}) => {
//       return adapter({ ...opts, ...customOptions });
//     },
//   });
// });

// describe("Authentication Flow Tests (Postgres)", async () => {
//   const pg = createPostgresPool();
//   let postgres: Kysely<any>;
//   const opts = createTestOptions(pg, true);
//   const testUser = {
//     email: "test-email@email.com",
//     password: "password",
//     name: "Test Name",
//   };

//   beforeAll(async () => {
//     postgres = createKyselyInstance(pg, true);

//     const { runMigrations } = await getMigrations(opts);
//     await runMigrations();
//   });

//   const auth = betterAuth({
//     ...opts,
//     database: drizzleAdapter(drizzle(pg), { provider: "pg", schema }),
//     emailAndPassword: {
//       enabled: true,
//     },
//   });

//   afterAll(async () => {
//     await cleanupDatabase(postgres, true);
//   });

//   it("should successfully sign up a new user", async () => {
//     const user = await auth.api.signUpEmail({ body: testUser });
//     expect(user).toBeDefined();
//   });

//   it("should successfully sign in an existing user", async () => {
//     const user = await auth.api.signInEmail({ body: testUser });
//     expect(user.user).toBeDefined();
//   });
// });

// describe("Authentication Flow Tests (MySQL)", async () => {
//   const mysql = createMysqlPool();
//   let mysqlInstance: Kysely<any>;
//   const opts = createTestOptions(mysql, false); // false for MySQL
//   const testUser = {
//     email: "test-email@email.com",
//     password: "password",
//     name: "Test Name",
//   };

//   beforeAll(async () => {
//     mysqlInstance = createKyselyInstance(mysql, false); // false for MySQL

//     const { runMigrations } = await getMigrations(opts);
//     await runMigrations();
//   });

//   const auth = betterAuth({
//     ...opts,
//     database: drizzleAdapter(drizzle(mysql), { provider: "mysql", schema }), // MySQL provider
//     emailAndPassword: {
//       enabled: true,
//     },
//   });

//   afterAll(async () => {
//     await cleanupDatabase(mysqlInstance, false);
//   });

//   it("should successfully sign up a new user", async () => {
//     const user = await auth.api.signUpEmail({ body: testUser });
//     expect(user).toBeDefined();
//   });

//   it("should successfully sign in an existing user", async () => {
//     const user = await auth.api.signInEmail({ body: testUser });
//     expect(user.user).toBeDefined();
//   });
// });
