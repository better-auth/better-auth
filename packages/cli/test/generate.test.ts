import { describe, expect, it } from "vitest";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { generatePrismaSchema } from "../src/generators/prisma";
import { twoFactor, username } from "better-auth/plugins";
import { generateDrizzleSchema } from "../src/generators/drizzle";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { generateMigrations } from "../src/generators/kysely";
import Database from "better-sqlite3";
import type { BetterAuthOptions } from "better-auth";
import fs from "fs/promises";
import path from "path";

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
		const testFilePath = path.resolve(__dirname, "test-schema-with-custom.ts");
		const customSchema = `import { pgTable, text, integer } from "drizzle-orm/pg-core";
		
// Custom user-defined table
export const products = pgTable("products", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  price: integer("price").notNull(),
});

export type Product = typeof products.$inferSelect;

// Auth table that should be replaced
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email").notNull().unique(),
});
`;
		await fs.writeFile(testFilePath, customSchema);
		
		try {
			// Generate schema with the test file as input
			const schema = await generateDrizzleSchema({
				file: testFilePath,
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
			
			// Check if the result contains the custom products table
			if (schema.code) {
				expect(schema.code).toContain("export const products = pgTable");
				expect(schema.code).toContain("export const user = pgTable");
				
				// Also check that we don't have duplicate definitions
				const userTableCount = (schema.code.match(/export const user = pgTable/g) || []).length;
				expect(userTableCount).toBe(1);
				
				// Write output for manual inspection
				await fs.writeFile(path.resolve(__dirname, "drizzle-schema-with-custom-output.txt"), schema.code);
			}
			
			// Clean up
			await fs.unlink(testFilePath);
		} catch (error) {
			// Make sure we clean up even if the test fails
			await fs.unlink(testFilePath).catch(() => {});
			throw error;
		}
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
});
