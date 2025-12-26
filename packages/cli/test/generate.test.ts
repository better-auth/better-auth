import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { BetterAuthOptions, BetterAuthPlugin } from "@better-auth/core";
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
import { getPrismaVersion } from "../src/utils/get-package-info";

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
		await expect(schema.code).toMatchFileSnapshot(
			"./__snapshots__/schema.prisma",
		);
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
		await expect(schema.code).toMatchFileSnapshot(
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
		await expect(schema.code).toMatchFileSnapshot(
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
		await expect(schema.code).toMatchFileSnapshot(
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
		await expect(schema.code).toMatchFileSnapshot(
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
		await expect(schema.code).toMatchFileSnapshot(
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
		await expect(schema.code).toMatchFileSnapshot(
			"./__snapshots__/auth-schema.txt",
		);
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
		await expect(schema.code).toMatchFileSnapshot(
			"./__snapshots__/auth-schema-number-id.txt",
		);
	});

	// Minimal plugin that reproduces the bug: two fields referencing the same model
	const testPlugin = (): BetterAuthPlugin => {
		return {
			id: "test",
			schema: {
				test: {
					fields: {
						userId: {
							type: "string",
							required: false,
							references: {
								model: "user",
								field: "id",
								onDelete: "set null",
							},
						},
						managerId: {
							type: "string",
							required: false,
							references: {
								model: "user",
								field: "id",
								onDelete: "set null",
							},
						},
					},
				},
			},
		};
	};

	it("should generate drizzle schema without duplicate relations", async () => {
		const schema = await generateDrizzleSchema({
			file: "test.drizzle",
			adapter: drizzleAdapter(
				{},
				{
					provider: "sqlite",
					schema: {},
				},
			)({} as BetterAuthOptions),
			options: {
				database: drizzleAdapter(
					{},
					{
						provider: "sqlite",
						schema: {},
					},
				),
				plugins: [testPlugin()],
			},
		});
		await expect(schema.code).toMatchFileSnapshot(
			"./__snapshots__/auth-schema-duplicate-relations.txt",
		);
	});

	// Plugin that tests multiple relations to different models (should be combined)
	const multiRelationPlugin = (): BetterAuthPlugin => {
		return {
			id: "multi-relation",
			schema: {
				project: {
					fields: {
						ownerId: {
							type: "string",
							required: false,
							references: {
								model: "user",
								field: "id",
								onDelete: "set null",
							},
						},
						sessionId: {
							type: "string",
							required: false,
							references: {
								model: "session",
								field: "id",
								onDelete: "set null",
							},
						},
					},
				},
			},
		};
	};

	it("should combine multiple relations to different models into single export", async () => {
		const schema = await generateDrizzleSchema({
			file: "test.drizzle",
			adapter: drizzleAdapter(
				{},
				{
					provider: "sqlite",
					schema: {},
				},
			)({} as BetterAuthOptions),
			options: {
				database: drizzleAdapter(
					{},
					{
						provider: "sqlite",
						schema: {},
					},
				),
				plugins: [multiRelationPlugin()],
			},
		});
		await expect(schema.code).toMatchFileSnapshot(
			"./__snapshots__/auth-schema-multi-relation.txt",
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
		await expect(schema.code).toMatchFileSnapshot(
			"./__snapshots__/migrations.sql",
		);
	});

	it("should throw for unsupported additionalFields type in migrations", async () => {
		await expect(
			generateMigrations({
				file: "test.sql",
				options: {
					database: new Database(":memory:"),
					user: {
						additionalFields: {
							is_subscribed: { type: "object" } as unknown as any,
						} as any,
					},
				},
				adapter: {} as any,
			}),
		).rejects.toThrow(/Unsupported field type/);
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
	it("should throw for unsupported additionalFields type in migrations", async () => {
		await expect(
			generateMigrations({
				file: "test.sql",
				options: {
					database: new Database(":memory:"),
					user: {
						additionalFields: {
							is_subscribed: { type: "object" } as unknown as any,
						} as any,
					},
				},
				adapter: {} as any,
			}),
		).rejects.toThrow(/Unsupported field type/);
	});
});

describe("usePlural schema generation", () => {
	it("should generate drizzle schema with usePlural option", async () => {
		const schema = await generateDrizzleSchema({
			file: "test.drizzle",
			adapter: {
				id: "drizzle",
				options: {
					provider: "pg",
					schema: {},
					usePlural: true,
					adapterConfig: { usePlural: true },
				},
			} as any,
			options: {
				database: {} as any,
			},
		});
		await expect(schema.code).toMatchFileSnapshot(
			"./__snapshots__/auth-schema-drizzle-use-plural.txt",
		);
	});
	it("should generate prisma schema with usePlural option", async () => {
		const schema = await generatePrismaSchema({
			file: "test.prisma",
			adapter: {
				id: "prisma",
				options: {
					provider: "postgresql",
					usePlural: true,
					adapterConfig: { usePlural: true },
				},
			} as any,
			options: {
				database: {} as any,
			},
		});
		await expect(schema.code).toMatchFileSnapshot(
			"./__snapshots__/schema-prisma-use-plural.prisma",
		);
	});
});

describe("Prisma v7 compatibility", () => {
	it("should detect Prisma version from package.json", () => {
		// Test with Prisma v7
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "prisma-v7-test-"));
		const packageJson = {
			dependencies: {
				prisma: "^7.0.0",
			},
		};
		fs.writeFileSync(
			path.join(tmpDir, "package.json"),
			JSON.stringify(packageJson),
		);
		const version = getPrismaVersion(tmpDir);
		expect(version).toBe(7);
		fs.rmSync(tmpDir, { recursive: true });
	});

	it("should detect Prisma v5 from package.json", () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "prisma-v5-test-"));
		const packageJson = {
			dependencies: {
				prisma: "^5.0.0",
			},
		};
		fs.writeFileSync(
			path.join(tmpDir, "package.json"),
			JSON.stringify(packageJson),
		);
		const version = getPrismaVersion(tmpDir);
		expect(version).toBe(5);
		fs.rmSync(tmpDir, { recursive: true });
	});

	it("should detect Prisma version from @prisma/client", () => {
		const tmpDir = fs.mkdtempSync(
			path.join(os.tmpdir(), "prisma-client-test-"),
		);
		const packageJson = {
			devDependencies: {
				"@prisma/client": "~7.1.0",
			},
		};
		fs.writeFileSync(
			path.join(tmpDir, "package.json"),
			JSON.stringify(packageJson),
		);
		const version = getPrismaVersion(tmpDir);
		expect(version).toBe(7);
		fs.rmSync(tmpDir, { recursive: true });
	});

	it("should return null when Prisma is not installed", () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "no-prisma-test-"));
		const packageJson = {
			dependencies: {},
		};
		fs.writeFileSync(
			path.join(tmpDir, "package.json"),
			JSON.stringify(packageJson),
		);
		const version = getPrismaVersion(tmpDir);
		expect(version).toBeNull();
		fs.rmSync(tmpDir, { recursive: true });
	});

	it("should generate schema with prisma-client provider for v7+", async () => {
		const originalCwd = process.cwd();
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "prisma-v7-schema-"));

		try {
			const packageJson = {
				dependencies: {
					prisma: "^7.0.0",
				},
			};
			fs.writeFileSync(
				path.join(tmpDir, "package.json"),
				JSON.stringify(packageJson),
			);

			process.chdir(tmpDir);

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
					plugins: [],
				},
			});

			expect(schema.code).toContain('provider = "prisma-client"');
			expect(schema.code).not.toContain('provider = "prisma-client-js"');
		} finally {
			process.chdir(originalCwd);
			fs.rmSync(tmpDir, { recursive: true });
		}
	});

	it("should generate schema with prisma-client-js provider for v5", async () => {
		const originalCwd = process.cwd();
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "prisma-v5-schema-"));

		try {
			// Create package.json with Prisma v5
			const packageJson = {
				dependencies: {
					prisma: "^5.0.0",
				},
			};
			fs.writeFileSync(
				path.join(tmpDir, "package.json"),
				JSON.stringify(packageJson),
			);

			// Change to temp directory
			process.chdir(tmpDir);

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
					plugins: [],
				},
			});

			// Check that the schema uses prisma-client-js for v5
			expect(schema.code).toContain('provider = "prisma-client-js"');
			expect(schema.code).not.toContain('provider = "prisma-client"');
		} finally {
			// Restore original directory
			process.chdir(originalCwd);
			fs.rmSync(tmpDir, { recursive: true });
		}
	});

	it("should generate schema with prisma-client-js provider for v6", async () => {
		const originalCwd = process.cwd();
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "prisma-v6-schema-"));

		try {
			// Create package.json with Prisma v6
			const packageJson = {
				dependencies: {
					prisma: "^6.0.0",
				},
			};
			fs.writeFileSync(
				path.join(tmpDir, "package.json"),
				JSON.stringify(packageJson),
			);

			// Change to temp directory
			process.chdir(tmpDir);

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
					plugins: [],
				},
			});

			// Check that the schema uses prisma-client-js for v6
			expect(schema.code).toContain('provider = "prisma-client-js"');
			expect(schema.code).not.toContain('provider = "prisma-client"');
		} finally {
			// Restore original directory
			process.chdir(originalCwd);
			fs.rmSync(tmpDir, { recursive: true });
		}
	});
});
