import { describe, expect, it, vi } from "vitest";
import { generateDrizzleSchema } from "../src/generators/drizzle";
import { generatePrismaSchema } from "../src/generators/prisma";
import type { BetterAuthOptions } from "better-auth";

describe("JSON field support in CLI generators", () => {
	it("should generate Drizzle schema with JSON fields for PostgreSQL", async () => {
		const schema = await generateDrizzleSchema({
			file: "test.drizzle",
			adapter: {
				id: "drizzle",
				options: {
					provider: "pg",
					schema: {},
				},
			} as any,
			options: {
				database: {} as any,
				user: {
					additionalFields: {
						preferences: {
							type: "json",
						},
					},
				},
			} as BetterAuthOptions,
		});
		expect(schema.code).toContain("preferences: jsonb(");
	});

	it("should generate Drizzle schema with JSON fields for MySQL", async () => {
		const schema = await generateDrizzleSchema({
			file: "test.drizzle",
			adapter: {
				id: "drizzle",
				options: {
					provider: "mysql",
					schema: {},
				},
			} as any,
			options: {
				database: {} as any,
				user: {
					additionalFields: {
						preferences: {
							type: "json",
						},
					},
				},
			} as BetterAuthOptions,
		});
		expect(schema.code).toContain("preferences: json(");
	});

	it("should generate Drizzle schema with JSON fields for SQLite", async () => {
		const schema = await generateDrizzleSchema({
			file: "test.drizzle",
			adapter: {
				id: "drizzle",
				options: {
					provider: "sqlite",
					schema: {},
				},
			} as any,
			options: {
				database: {} as any,
				user: {
					additionalFields: {
						preferences: {
							type: "json",
						},
					},
				},
			} as BetterAuthOptions,
		});
		expect(schema.code).toContain("preferences: text(");
	});

	it("should generate Prisma schema with JSON fields", async () => {
		const schema = await generatePrismaSchema({
			file: "test.prisma",
			adapter: {
				id: "prisma",
				options: {},
			} as any,
			options: {
				database: {} as any,
				user: {
					additionalFields: {
						preferences: {
							type: "json",
						},
					},
				},
			} as BetterAuthOptions,
		});
		expect(schema.code).toContain("preferences   Json?");
	});
});
