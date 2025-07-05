import { describe, expect, it } from "vitest";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { generatePrismaSchema } from "../src/generators/prisma";
import { twoFactor, username } from "better-auth/plugins";
import { generateDrizzleSchema } from "../src/generators/drizzle";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { generateMigrations } from "../src/generators/kysely";
import Database from "better-sqlite3";
import type { BetterAuthOptions } from "better-auth";
import fs from "node:fs/promises";
import path from "node:path";

describe("generate", async () => {
	it("should generate prisma schema", async () => {
		const schema = await generatePrismaSchema({
			file: "test.prisma",
			adapter: prismaAdapter(
				{},
				{
					provider: "postgresql",
				},
			)({} as BetterAuthOptions),
			options: {
				database: prismaAdapter(
					{},
					{
						provider: "postgresql",
					},
				),
				plugins: [twoFactor(), username()],
			},
		});
		expect(schema.code).toMatchFileSnapshot("./__snapshots__/schema.prisma");
	});

	it("should generate prisma schema with number id", async () => {
		const schema = await generatePrismaSchema({
			file: "test.prisma",
			adapter: prismaAdapter(
				{},
				{
					provider: "postgresql",
				},
			)({} as BetterAuthOptions),
			options: {
				database: prismaAdapter(
					{},
					{
						provider: "postgresql",
					},
				),
				plugins: [twoFactor(), username()],
				advanced: {
					database: {
						useNumberId: true,
					},
				},
			},
		});
		expect(schema.code).toMatchFileSnapshot(
			"./__snapshots__/schema-numberid.prisma",
		);
	});

	it("should generate prisma schema for mongodb", async () => {
		const schema = await generatePrismaSchema({
			file: "test.prisma",
			adapter: prismaAdapter(
				{},
				{
					provider: "mongodb",
				},
			)({} as BetterAuthOptions),
			options: {
				database: prismaAdapter(
					{},
					{
						provider: "mongodb",
					},
				),
				plugins: [twoFactor(), username()],
			},
		});
		expect(schema.code).toMatchFileSnapshot(
			"./__snapshots__/schema-mongodb.prisma",
		);
	});

	it("should generate prisma schema for mysql", async () => {
		const schema = await generatePrismaSchema({
			file: "test.prisma",
			adapter: prismaAdapter(
				{},
				{
					provider: "mysql",
				},
			)({} as BetterAuthOptions),
			options: {
				database: prismaAdapter(
					{},
					{
						provider: "mongodb",
					},
				),
				plugins: [twoFactor(), username()],
			},
		});
		expect(schema.code).toMatchFileSnapshot(
			"./__snapshots__/schema-mysql.prisma",
		);
	});

	it("should generate drizzle schema", async () => {
		const schema = await generateDrizzleSchema({
			file: "test.drizzle",
			adapter: drizzleAdapter(
				{},
				{
					provider: "pg",
					schema: {},
				},
			)({} as BetterAuthOptions),
			options: {
				database: drizzleAdapter(
					{},
					{
						provider: "pg",
						schema: {},
					},
				),
				plugins: [twoFactor(), username()],
			},
		});
		expect(schema.code).toMatchFileSnapshot("./__snapshots__/auth-schema.txt");
	});

	it("should generate drizzle schema with number id", async () => {
		const schema = await generateDrizzleSchema({
			file: "test.drizzle",
			adapter: drizzleAdapter(
				{},
				{
					provider: "pg",
					schema: {},
				},
			)({} as BetterAuthOptions),
			options: {
				database: drizzleAdapter(
					{},
					{
						provider: "pg",
						schema: {},
					},
				),
				plugins: [twoFactor(), username()],
				advanced: {
					database: {
						useNumberId: true,
					},
				},
			},
		});
		expect(schema.code).toMatchFileSnapshot(
			"./__snapshots__/auth-schema-number-id.txt",
		);
	});

	it("should generate kysely schema", async () => {
		const schema = await generateMigrations({
			file: "test.sql",
			options: {
				database: new Database(":memory:"),
			},
			adapter: {} as any,
		});
		expect(schema.code).toMatchFileSnapshot("./__snapshots__/migrations.sql");
	});

	it("should use schema from drizzle.config.ts if present and no file is provided", async () => {
		const tmpDir = await fs.mkdtemp(
			path.join(process.cwd(), "drizzle_generate_test-"),
		);
		const schemaPath = "./src/schema.ts";
		const expectedAuthSchemaPath = "./src/auth-schema.ts";
		const configPath = path.join(tmpDir, "drizzle.config.ts");
		await fs.mkdir(path.join(tmpDir, "src"), { recursive: true });
		await fs.writeFile(
			configPath,
			`import { defineConfig } from "drizzle-kit";

			export default defineConfig({
				schema: '${schemaPath}'
			});`,
		);
		const adapter = drizzleAdapter(
			{},
			{
				provider: "sqlite",
				schema: {},
			},
		)({} as BetterAuthOptions);
		const schema = await generateDrizzleSchema({
			file: expectedAuthSchemaPath,
			adapter,
			options: {
				database: adapter,
				plugins: [],
			} as unknown as BetterAuthOptions,
		});
		expect(schema.fileName).toBe(expectedAuthSchemaPath);
		expect(schema.code).toBeTruthy();
		await fs.rm(tmpDir, { recursive: true });
	});

	it("should extract directory from drizzle config schema and emit auth-schema.ts in that directory", async () => {
		const tmpDir = await fs.mkdtemp(
			path.join(process.cwd(), "drizzle_auth_schema_test-"),
		);
		const schemaDir = "./src/db";
		const schemaPath = path.join(schemaDir, "schema.ts");
		const expectedAuthSchemaPath = path.join(schemaDir, "auth-schema.ts");
		const configPath = path.join(tmpDir, "drizzle.config.ts");

		await fs.mkdir(path.join(tmpDir, "src", "db"), { recursive: true });
		await fs.writeFile(
			configPath,
			`import { defineConfig } from "drizzle-kit";

			export default defineConfig({
				schema: '${schemaPath}'
			});`,
		);

		const adapter = drizzleAdapter(
			{},
			{
				provider: "sqlite",
				schema: {},
			},
		)({} as BetterAuthOptions);

		const schema = await generateDrizzleSchema({
			file: expectedAuthSchemaPath,
			adapter,
			options: {
				database: adapter,
				plugins: [],
			} as unknown as BetterAuthOptions,
		});

		expect(schema.fileName).toBe(expectedAuthSchemaPath);
		expect(schema.code).toBeTruthy();
		await fs.rm(tmpDir, { recursive: true });
	});

	it("should handle array schema paths in drizzle config", async () => {
		const tmpDir = await fs.mkdtemp(
			path.join(process.cwd(), "drizzle_array_schema_test-"),
		);
		const schemaDir = "./src/db";
		const schemaPath1 = path.join(schemaDir, "schema1.ts");
		const schemaPath2 = path.join(schemaDir, "schema2.ts");
		const expectedAuthSchemaPath = path.join(schemaDir, "auth-schema.ts");
		const configPath = path.join(tmpDir, "drizzle.config.ts");

		await fs.mkdir(path.join(tmpDir, "src", "db"), { recursive: true });
		await fs.writeFile(
			configPath,
			`import { defineConfig } from "drizzle-kit";

			export default defineConfig({
				schema: ['${schemaPath1}', '${schemaPath2}']
			});`,
		);

		const adapter = drizzleAdapter(
			{},
			{
				provider: "sqlite",
				schema: {},
			},
		)({} as BetterAuthOptions);

		const schema = await generateDrizzleSchema({
			file: expectedAuthSchemaPath,
			adapter,
			options: {
				database: adapter,
				plugins: [],
			} as unknown as BetterAuthOptions,
		});

		expect(schema.fileName).toBe(expectedAuthSchemaPath);
		expect(schema.code).toBeTruthy();

		await fs.rm(tmpDir, { recursive: true });
	});

	it("should handle directory schema paths in drizzle config", async () => {
		const tmpDir = await fs.mkdtemp(
			path.join(process.cwd(), "drizzle_directory_schema_test-"),
		);
		const schemaDir = "./src/db";
		const expectedAuthSchemaPath = path.join(schemaDir, "auth-schema.ts");
		const configPath = path.join(tmpDir, "drizzle.config.ts");

		await fs.mkdir(path.join(tmpDir, "src", "db"), { recursive: true });
		await fs.writeFile(
			configPath,
			`import { defineConfig } from "drizzle-kit";

			export default defineConfig({
				schema: '${schemaDir}'
			});`,
		);

		const adapter = drizzleAdapter(
			{},
			{
				provider: "sqlite",
				schema: {},
			},
		)({} as BetterAuthOptions);

		const schema = await generateDrizzleSchema({
			file: expectedAuthSchemaPath,
			adapter,
			options: {
				database: adapter,
				plugins: [],
			} as unknown as BetterAuthOptions,
		});

		expect(schema.fileName).toBe(expectedAuthSchemaPath);
		expect(schema.code).toBeTruthy();

		await fs.rm(tmpDir, { recursive: true });
	});

	it("should handle array with mixed file and directory paths", async () => {
		const tmpDir = await fs.mkdtemp(
			path.join(process.cwd(), "drizzle_mixed_schema_test-"),
		);
		const schemaDir = "./src/db";
		const schemaPath1 = path.join(schemaDir, "schema1.ts");
		const schemaPath2 = "./src/models";
		const expectedAuthSchemaPath = path.join(schemaDir, "auth-schema.ts");
		const configPath = path.join(tmpDir, "drizzle.config.ts");

		await fs.mkdir(path.join(tmpDir, "src", "db"), { recursive: true });
		await fs.mkdir(path.join(tmpDir, "src", "models"), { recursive: true });
		await fs.writeFile(
			configPath,
			`import { defineConfig } from "drizzle-kit";

			export default defineConfig({
				schema: ['${schemaPath1}', '${schemaPath2}']
			});`,
		);

		const adapter = drizzleAdapter(
			{},
			{
				provider: "sqlite",
				schema: {},
			},
		)({} as BetterAuthOptions);

		const schema = await generateDrizzleSchema({
			file: expectedAuthSchemaPath,
			adapter,
			options: {
				database: adapter,
				plugins: [],
			} as unknown as BetterAuthOptions,
		});

		expect(schema.fileName).toBe(expectedAuthSchemaPath);
		expect(schema.code).toBeTruthy();

		await fs.rm(tmpDir, { recursive: true });
	});
});
