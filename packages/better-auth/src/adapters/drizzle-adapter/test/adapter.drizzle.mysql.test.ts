import fs from "fs/promises";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "./schema.mysql"; // Your schema definitions
import { runAdapterTest } from "../../test"; // Your adapter test runner
import { drizzleAdapter } from ".."; // Your Drizzle adapter
import { getMigrations } from "../../../db/get-migration"; // Your migration utility
import { drizzle } from "drizzle-orm/mysql2"; // Drizzle MySQL driver
import type { BetterAuthOptions } from "../../../types"; // Your BetterAuth options type
import { createConnection, createPool } from "mysql2/promise"; // MySQL connection pool
import { Kysely, MysqlDialect, sql } from "kysely"; // Kysely for MySQL
import { betterAuth } from "../../../auth"; // Your BetterAuth instance

// MySQL connection URL
const TEST_DB_MYSQL_URL = "mysql://user:password@localhost:3306/better_auth";

// Create a MySQL connection pool
const createTestPool = () => createPool(TEST_DB_MYSQL_URL);
// createpool({
//   host: "localhost",
//   user: "user",
//   password: "password",
//   database: "better_auth",
//   port: "3306",
//   // uri: TEST_DB_MYSQL_URL,
// });
// createPool({
//   uri: TEST_DB_MYSQL_URL,
// });

// Create a Kysely instance for MySQL
const createKyselyInstance = (pool: any) =>
  new Kysely({
    dialect: new MysqlDialect({ pool }),
  });

// Clean up the database after tests
const cleanupDatabase = async (mysql: any) => {
  await mysql.query("DROP DATABASE IF EXISTS better_auth");
  await mysql.query("CREATE DATABASE better_auth");
  await mysql.end();
};

// Create test options for BetterAuth
const createTestOptions = (pool: any): BetterAuthOptions => ({
  database: pool,
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

describe("Drizzle Adapter Tests (MySQL)", async () => {
  let pool: any;
  let mysql: Kysely<any>;
  let opts: BetterAuthOptions;

  console.log("Creating pool");
  pool = createTestPool();
  mysql = createKyselyInstance(pool);
  opts = createTestOptions(pool);
  // Run migrations
  console.log({ pool });
  const { runMigrations } = await getMigrations(opts);
  await runMigrations();

  const mysql2 = createPool(TEST_DB_MYSQL_URL);
  afterAll(async () => {
    // Clean up the database
    await cleanupDatabase(pool);
  });

  // Initialize Drizzle and the adapter

  console.log({ pool });
  const db = drizzle({
    client: pool,
  });
  const adapter = drizzleAdapter(db, { provider: "mysql", schema });

  // Run adapter tests
  await runAdapterTest({
    getAdapter: async (customOptions = {}) => {
      return adapter({ ...opts, ...customOptions });
    },
  });
});

describe("Authentication Flow Tests (MySQL)", async () => {
  const pool = createTestPool();
  let mysql: Kysely<any>;
  const opts = createTestOptions(pool);
  const testUser = {
    email: "test-email@email.com",
    password: "password",
    name: "Test Name",
  };

  beforeAll(async () => {
    // Create a Kysely instance and run migrations
    mysql = createKyselyInstance(pool);
    const { runMigrations } = await getMigrations(opts);
    await runMigrations();
  });

  // Initialize BetterAuth with MySQL
  const auth = betterAuth({
    ...opts,
    database: drizzleAdapter(drizzle({ client: pool }), {
      provider: "mysql",
      schema,
    }),
    emailAndPassword: {
      enabled: true,
    },
  });

  afterAll(async () => {
    await cleanupDatabase(mysql);
  }, 100000);

  it("should successfully sign up a new user", async () => {
    const user = await auth.api.signUpEmail({ body: testUser });
    console.log("User ", { user });
    expect(user).toBeDefined();
    expect(user.user.id).toBeDefined(); // Ensure the `id` is returned
  });

  it("should successfully sign in an existing user", async () => {
    const user = await auth.api.signInEmail({ body: testUser });
    expect(user.user).toBeDefined();
    expect(user.user.id).toBeDefined(); // Ensure the `id` is returned
  });
}, 1000000);
