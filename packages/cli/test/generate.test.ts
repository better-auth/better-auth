import type { BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { organization, twoFactor, username } from "better-auth/plugins";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import type { SupportedPlugin } from "../src/commands/init";
import { generateAuthConfig } from "../src/generators/auth-config";
import { generateDrizzleSchema } from "../src/generators/drizzle";
import { generateMigrations } from "../src/generators/kysely";
import { generatePrismaSchema } from "../src/generators/prisma";

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
						generateId: "serial",
					},
				},
			},
		});
		expect(schema.code).toMatchFileSnapshot(
			"./__snapshots__/schema-numberid.prisma",
		);
	});

	it("should generate prisma schema with uuid id", async () => {
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
						generateId: "uuid",
					},
				},
			},
		});
		expect(schema.code).toMatchFileSnapshot(
			"./__snapshots__/schema-uuid.prisma",
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

	it("should generate prisma schema for mysql with custom model names", async () => {
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
				plugins: [
					twoFactor(),
					username(),
					organization({
						schema: {
							organization: {
								modelName: "workspace",
							},
							invitation: {
								modelName: "workspaceInvitation",
							},
						},
					}),
				],
			},
		});
		expect(schema.code).toMatchFileSnapshot(
			"./__snapshots__/schema-mysql-custom.prisma",
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
				user: {
					modelName: "custom_user",
				},
				account: {
					modelName: "custom_account",
				},
				session: {
					modelName: "custom_session",
				},
				verification: {
					modelName: "custom_verification",
				},
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
						generateId: "serial",
					},
				},
				user: {
					modelName: "custom_user",
				},
				account: {
					modelName: "custom_account",
				},
				session: {
					modelName: "custom_session",
				},
				verification: {
					modelName: "custom_verification",
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

	it("should add plugin to empty plugins array without leading comma", async () => {
		const initialConfig = `export const auth = betterAuth({
			plugins: []
		});`;

		const mockFormat = (code: string) => Promise.resolve(code);
		const mockSpinner = { stop: () => {} };
		const plugins: SupportedPlugin[] = [
			{
				id: "next-cookies",
				name: "nextCookies",
				path: "better-auth/next-js",
				clientName: undefined,
				clientPath: undefined,
			},
		];

		const result = await generateAuthConfig({
			format: mockFormat,
			current_user_config: initialConfig,
			spinner: mockSpinner as any,
			plugins,
			database: null,
		});

		expect(result.generatedCode).toContain(`plugins: [nextCookies()]`);
		expect(result.generatedCode).not.toContain(`plugins: [, nextCookies()]`);
	});
});

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

	it("should generate Prisma schema with JSON default values of arrays and objects", async () => {
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
							defaultValue: {
								premiumuser: true,
							},
						},
						metadata: {
							type: "json",
							defaultValue: [
								{
									name: "john",
									subscribed: false,
								},
								{ name: "doe", subscribed: true },
							],
						},
					},
				},
			} as BetterAuthOptions,
		});
		expect(schema.code).toContain("preferences   Json?");
		// expect(schema.code).toContain(JSON.stringify(`@default("{\"premiumuser\":true}")`).slice(1,-1));
		expect(schema.code).toContain('@default("{\\"premiumuser\\":true}")');
		expect(schema.code).toContain(
			'@default("[{\\"name\\":\\"john\\",\\"subscribed\\":false},{\\"name\\":\\"doe\\",\\"subscribed\\":true}]")',
		);
	});
});

describe("Enum field support in Drizzle schemas", () => {
	it("should generate Drizzle schema with enum fields for PostgreSQL", async () => {
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
						role: {
							type: ["admin", "user", "guest"],
							required: true,
						},
					},
				},
			} as BetterAuthOptions,
		});
		expect(schema.code).toContain(
			'role: text("role", { enum: ["admin", "user", "guest"] })',
		);
		await expect(schema.code).toMatchFileSnapshot(
			"./__snapshots__/auth-schema-pg-enum.txt",
		);
	});

	it("should generate Drizzle schema with enum fields for MySQL", async () => {
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
						status: {
							type: ["active", "inactive", "pending"],
							required: false,
						},
					},
				},
			} as BetterAuthOptions,
		});
		expect(schema.code).toContain("mysqlEnum");
		expect(schema.code).toContain(
			'status: mysqlEnum(["active", "inactive", "pending"])',
		);
		await expect(schema.code).toMatchFileSnapshot(
			"./__snapshots__/auth-schema-mysql-enum.txt",
		);
	});

	it("should generate Drizzle schema with enum fields for SQLite", async () => {
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
						priority: {
							type: ["high", "medium", "low"],
						},
					},
				},
			} as BetterAuthOptions,
		});
		expect(schema.code).toContain("text({ enum: [");
		expect(schema.code).toContain(
			'priority: text({ enum: ["high", "medium", "low"] })',
		);
		await expect(schema.code).toMatchFileSnapshot(
			"./__snapshots__/auth-schema-sqlite-enum.txt",
		);
	});

	it("should include correct imports for enum fields in MySQL", async () => {
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
						status: {
							type: ["active", "inactive"],
						},
					},
				},
			} as BetterAuthOptions,
		});
		expect(schema.code).toMatch(
			/import.*mysqlEnum.*from.*drizzle-orm\/mysql-core/s,
		);
	});

	it("should not include enum imports when no enum fields are present", async () => {
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
						name: {
							type: "string",
						},
					},
				},
			} as BetterAuthOptions,
		});
		expect(schema.code).not.toContain("enum");
	});
});
