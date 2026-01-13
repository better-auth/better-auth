import { describe, expect, it } from "vitest";
import {
	generateDatabaseConfig,
	getDatabaseCommands,
	getDatabaseEnvVar,
} from "./database";

describe("generateDatabaseConfig", () => {
	describe("no ORM (direct connection)", () => {
		it("should generate postgres config", () => {
			const result = generateDatabaseConfig("postgres", "none");

			expect(result.config).toContain('provider: "pg"');
			expect(result.config).toContain("process.env.DATABASE_URL");
			expect(result.imports).toBe("");
		});

		it("should generate mysql config", () => {
			const result = generateDatabaseConfig("mysql", "none");

			expect(result.config).toContain('provider: "mysql"');
		});

		it("should generate sqlite config", () => {
			const result = generateDatabaseConfig("sqlite", "none");

			expect(result.config).toContain('provider: "sqlite"');
		});

		it("should generate mongodb config", () => {
			const result = generateDatabaseConfig("mongodb", "none");

			expect(result.config).toContain('provider: "mongodb"');
		});
	});

	describe("Prisma adapter", () => {
		it("should generate Prisma adapter config", () => {
			const result = generateDatabaseConfig("postgres", "prisma");

			expect(result.imports).toContain("prismaAdapter");
			expect(result.imports).toContain("PrismaClient");
			expect(result.config).toContain("prismaAdapter(prisma");
			expect(result.config).toContain('provider: "postgresql"');
			expect(result.prismaInstance).toContain("new PrismaClient()");
		});

		it("should use correct provider name for mysql", () => {
			const result = generateDatabaseConfig("mysql", "prisma");

			expect(result.config).toContain('provider: "mysql"');
		});

		it("should use correct provider name for sqlite", () => {
			const result = generateDatabaseConfig("sqlite", "prisma");

			expect(result.config).toContain('provider: "sqlite"');
		});

		it("should use correct provider name for mongodb", () => {
			const result = generateDatabaseConfig("mongodb", "prisma");

			expect(result.config).toContain('provider: "mongodb"');
		});
	});

	describe("Drizzle adapter", () => {
		it("should generate Drizzle adapter config for postgres", () => {
			const result = generateDatabaseConfig("postgres", "drizzle");

			expect(result.imports).toContain("drizzleAdapter");
			expect(result.imports).toContain('import { db } from "./db"');
			expect(result.config).toContain("drizzleAdapter(db");
			expect(result.config).toContain('provider: "pg"');
		});

		it("should use correct provider name for mysql", () => {
			const result = generateDatabaseConfig("mysql", "drizzle");

			expect(result.config).toContain('provider: "mysql"');
		});

		it("should use correct provider name for sqlite", () => {
			const result = generateDatabaseConfig("sqlite", "drizzle");

			expect(result.config).toContain('provider: "sqlite"');
		});

		it("should throw error for Drizzle + MongoDB", () => {
			expect(() => generateDatabaseConfig("mongodb", "drizzle")).toThrow(
				/Drizzle ORM does not support MongoDB/,
			);
		});
	});
});

describe("getDatabaseEnvVar", () => {
	it("should return DATABASE_URL for postgres", () => {
		const result = getDatabaseEnvVar("postgres");

		expect(result.name).toBe("DATABASE_URL");
		expect(result.required).toBe(true);
		expect(result.example).toContain("postgresql://");
	});

	it("should return DATABASE_URL for mysql", () => {
		const result = getDatabaseEnvVar("mysql");

		expect(result.name).toBe("DATABASE_URL");
		expect(result.example).toContain("mysql://");
	});

	it("should return DATABASE_URL for sqlite", () => {
		const result = getDatabaseEnvVar("sqlite");

		expect(result.name).toBe("DATABASE_URL");
		expect(result.example).toContain("file:");
	});

	it("should return DATABASE_URL for mongodb", () => {
		const result = getDatabaseEnvVar("mongodb");

		expect(result.name).toBe("DATABASE_URL");
		expect(result.example).toContain("mongodb://");
	});
});

describe("getDatabaseCommands", () => {
	it("should return migrate command for no ORM", () => {
		const result = getDatabaseCommands("none");

		expect(result.length).toBe(1);
		expect(result[0].command).toContain("@better-auth/cli migrate");
	});

	it("should return generate and push commands for Prisma", () => {
		const result = getDatabaseCommands("prisma");

		expect(result.length).toBe(2);
		expect(result.some((c) => c.command.includes("generate"))).toBe(true);
		expect(result.some((c) => c.command.includes("prisma db push"))).toBe(true);
	});

	it("should return generate and push commands for Drizzle", () => {
		const result = getDatabaseCommands("drizzle");

		expect(result.length).toBe(2);
		expect(result.some((c) => c.command.includes("generate"))).toBe(true);
		expect(result.some((c) => c.command.includes("drizzle-kit push"))).toBe(
			true,
		);
	});
});
