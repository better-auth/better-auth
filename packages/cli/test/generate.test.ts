import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { BetterAuthOptions, BetterAuthPlugin } from "@better-auth/core";
import type { DBAdapter } from "@better-auth/core/db/adapter";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { organization, twoFactor, username } from "better-auth/plugins";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { generateSchema } from "../src/generators";
import { generateDrizzleSchema } from "../src/generators/drizzle";
import { generateKyselySchema } from "../src/generators/kysely";
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

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9717
	 */
	const runBigintToggleTest = async (
		fromBigint: boolean,
		toBigint: boolean,
	) => {
		const fromRegex = fromBigint
			? /aiCredits\s+BigInt/
			: /aiCredits\s+Int(?!\w)/;
		const toRegex = toBigint ? /aiCredits\s+BigInt/ : /aiCredits\s+Int(?!\w)/;

		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "prisma-bigint-"));
		const relativePath = path.relative(
			process.cwd(),
			path.join(tmpDir, "schema.prisma"),
		);
		try {
			const generate = (bigint: boolean) =>
				generatePrismaSchema({
					file: relativePath,
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
						user: {
							additionalFields: {
								aiCredits: {
									type: "number",
									input: false,
									bigint,
								},
							},
						},
					},
				});

			const first = await generate(fromBigint);
			expect(first.code).toBeDefined();
			expect(first.code).toMatch(fromRegex);
			fs.writeFileSync(path.join(tmpDir, "schema.prisma"), first.code!);

			const updated = await generate(toBigint);
			expect(updated.overwrite).toBe(true);
			expect(updated.code).toMatch(toRegex);
			expect(updated.code).not.toMatch(fromRegex);
		} finally {
			fs.rmSync(tmpDir, { recursive: true });
		}
	};

	it("should update an existing prisma bigint number field to int", () =>
		runBigintToggleTest(true, false));

	it("should update an existing prisma int number field to bigint", () =>
		runBigintToggleTest(false, true));

	it("should not update existing prisma uuid id fields to serial ids", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "prisma-uuid-id-"));
		const schemaPath = path.join(tmpDir, "schema.prisma");
		const relativePath = path.relative(process.cwd(), schemaPath);
		try {
			const generate = (generateId: "uuid" | "serial") =>
				generatePrismaSchema({
					file: relativePath,
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
								generateId,
							},
						},
					},
				});

			const first = await generate("uuid");
			expect(first.code).toBeDefined();
			fs.writeFileSync(schemaPath, first.code!);

			const updated = await generate("serial");
			const updatedSchema =
				updated.code || fs.readFileSync(schemaPath, "utf-8");
			expect(updatedSchema).toMatch(
				/id\s+String\s+@id\s+@default\(dbgenerated\("pg_catalog\.gen_random_uuid\(\)"\)\)\s+@db\.Uuid/,
			);
			expect(updatedSchema).toMatch(/userId\s+String\s+@db\.Uuid/);
			expect(updatedSchema).not.toMatch(/id\s+Int\s+@id.*@db\.Uuid/);
			expect(updatedSchema).not.toMatch(/userId\s+Int\s+@db\.Uuid/);
		} finally {
			fs.rmSync(tmpDir, { recursive: true });
		}
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

	it("should treat fields with omitted required as notNull (default true)", async () => {
		const pluginWithOmittedRequired = (): BetterAuthPlugin => ({
			id: "omitted-required-test",
			schema: {
				testTable: {
					fields: {
						requiredField: {
							type: "string",
							// required is omitted — should default to true
						},
						explicitRequired: {
							type: "string",
							required: true,
						},
						explicitOptional: {
							type: "string",
							required: false,
						},
					},
				},
			},
		});

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
				plugins: [pluginWithOmittedRequired()],
			} as BetterAuthOptions,
		});

		// Fields with omitted `required` should have .notNull()
		expect(schema.code).toContain(
			'requiredField: text("required_field").notNull()',
		);
		// Fields with explicit `required: true` should have .notNull()
		expect(schema.code).toContain(
			'explicitRequired: text("explicit_required").notNull()',
		);
		// Fields with explicit `required: false` should NOT have .notNull()
		expect(schema.code).not.toMatch(/explicitOptional:.*\.notNull\(\)/);
	});

	it("should escape string default values so the generated schema stays valid TypeScript", async () => {
		const pluginWithQuotedDefault = (): BetterAuthPlugin => ({
			id: "quoted-default-test",
			schema: {
				testTable: {
					fields: {
						greeting: {
							type: "string",
							defaultValue: 'say "hi"\\done',
						},
					},
				},
			},
		});

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
				plugins: [pluginWithQuotedDefault()],
			} as BetterAuthOptions,
		});

		// Quotes and backslashes must be escaped so the default is a valid
		// literal. The raw interpolation would emit `.default("say "hi"\done")`
		// and break the generated schema file.
		expect(schema.code).toContain(String.raw`.default('say "hi"\\done')`);
	});

	it("should not emit duplicate unique indexes for unique indexed fields", async () => {
		const pluginWithUniqueIndexedField = (): BetterAuthPlugin => ({
			id: "unique-index-test",
			schema: {
				testTable: {
					fields: {
						slug: {
							type: "string",
							index: true,
							unique: true,
						},
					},
				},
			},
		});

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
				plugins: [pluginWithUniqueIndexedField()],
			} as BetterAuthOptions,
		});

		expect(schema.code).toContain('slug: text("slug").notNull().unique()');
		expect(schema.code).not.toContain("uniqueIndex");
		expect(schema.code).not.toContain("slug_uidx");
	});

	it("should treat fields with omitted required as non-optional in prisma schema", async () => {
		const originalCwd = process.cwd();
		const tmpDir = fs.mkdtempSync(
			path.join(os.tmpdir(), "prisma-required-test-"),
		);

		try {
			fs.writeFileSync(
				path.join(tmpDir, "package.json"),
				JSON.stringify({
					dependencies: { prisma: "^7.0.0" },
				}),
			);
			process.chdir(tmpDir);

			const pluginWithOmittedRequired = (): BetterAuthPlugin => ({
				id: "omitted-required-test",
				schema: {
					testTable: {
						fields: {
							requiredField: {
								type: "string",
								// required is omitted — should default to true
							},
							explicitRequired: {
								type: "string",
								required: true,
							},
							explicitOptional: {
								type: "string",
								required: false,
							},
						},
					},
				},
			});

			const schema = await generatePrismaSchema({
				file: "test.prisma",
				adapter: prismaAdapter(
					{},
					{ provider: "postgresql" },
				)({} as BetterAuthOptions),
				options: {
					database: prismaAdapter({}, { provider: "postgresql" }),
					plugins: [pluginWithOmittedRequired()],
				},
			});

			// Fields with omitted `required` should NOT have "?" (= required)
			expect(schema.code).toMatch(/requiredField\s+String(?!\?)/);
			// Fields with explicit `required: true` should NOT have "?"
			expect(schema.code).toMatch(/explicitRequired\s+String(?!\?)/);
			// Fields with explicit `required: false` should have "?"
			expect(schema.code).toMatch(/explicitOptional\s+String\?/);
		} finally {
			process.chdir(originalCwd);
			fs.rmSync(tmpDir, { recursive: true });
		}
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

	/**
	 * @see https://github.com/better-auth/better-auth/issues/8849
	 */
	it("should disambiguate duplicate relations when usePlural is enabled", async () => {
		const database = drizzleAdapter(
			{},
			{
				provider: "sqlite",
				schema: {},
				usePlural: true,
			},
		);
		const schema = await generateDrizzleSchema({
			file: "test.drizzle",
			adapter: database({} as BetterAuthOptions),
			options: {
				database,
				plugins: [testPlugin()],
			},
		});
		await expect(schema.code).toMatchFileSnapshot(
			"./__snapshots__/auth-schema-drizzle-use-plural-duplicate-relations.txt",
		);
	});

	it("should emit one() for unique reverse relations", async () => {
		const uniqueProfilePlugin = (): BetterAuthPlugin => ({
			id: "unique-profile",
			schema: {
				profile: {
					fields: {
						userId: {
							type: "string",
							required: true,
							unique: true,
							references: {
								model: "user",
								field: "id",
								onDelete: "cascade",
							},
						},
					},
				},
			},
		});
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
				plugins: [uniqueProfilePlugin()],
			},
		});
		expect(schema.code).toContain("profile: one(profile)");
		expect(schema.code).not.toMatch(/profile:\s*many\(profile\)/);
	});

	it("should avoid colliding one-side relation keys after Id stripping", async () => {
		const collidingFkPlugin = (
			fieldOrder: "owner-first" | "ownerId-first",
		): BetterAuthPlugin => ({
			id: "colliding-fk",
			schema: {
				project: {
					fields:
						fieldOrder === "owner-first"
							? {
									owner: {
										type: "string",
										required: false,
										references: {
											model: "user",
											field: "id",
											onDelete: "set null",
										},
									},
									ownerId: {
										type: "string",
										required: false,
										references: {
											model: "user",
											field: "id",
											onDelete: "set null",
										},
									},
								}
							: {
									ownerId: {
										type: "string",
										required: false,
										references: {
											model: "user",
											field: "id",
											onDelete: "set null",
										},
									},
									owner: {
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
		});

		for (const fieldOrder of ["owner-first", "ownerId-first"] as const) {
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
					plugins: [collidingFkPlugin(fieldOrder)],
				},
			});
			expect(schema.code).toBeTruthy();
			expect(schema.code).toContain('relationName: "project_owner"');
			expect(schema.code).toContain('relationName: "project_ownerId"');
			const projectRelations = schema.code!.match(
				/export const projectRelations = relations\([\s\S]*?\n\}\)\);/,
			)?.[0];
			expect(projectRelations).toBeTruthy();
			const oneKeys = [
				...projectRelations!.matchAll(/^\s+(\w+):\s+one\(user,/gm),
			].map((match) => match[1]);
			expect(oneKeys).toHaveLength(2);
			expect(new Set(oneKeys).size).toBe(2);
			if (fieldOrder === "owner-first") {
				expect(oneKeys).toEqual(expect.arrayContaining(["owner", "ownerId"]));
			} else {
				// ownerId is stripped to `owner` first, so the later `owner`
				// field needs a unique fallback key.
				expect(oneKeys).toEqual(expect.arrayContaining(["owner", "owner_2"]));
			}
		}
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
		const schema = await generateKyselySchema({
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
			generateKyselySchema({
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
		// required omitted → defaults to true → non-nullable
		expect(schema.code).toMatch(/preferences\s+Json(?!\?)/);
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
		// required omitted → defaults to true → non-nullable
		expect(schema.code).toMatch(/preferences\s+Json(?!\?)/);
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
			generateKyselySchema({
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

describe("Drizzle array defaultValue serialization", () => {
	/**
	 * @see https://github.com/better-auth/better-auth/issues/10046
	 */
	it("emits a JS array literal for string[] additionalField defaultValue", async () => {
		const schema = await generateDrizzleSchema({
			file: "test.drizzle",
			adapter: {
				id: "drizzle",
				options: { provider: "pg", schema: {} },
			} as any,
			options: {
				database: {} as any,
				user: {
					additionalFields: {
						roles: {
							type: "string[]",
							required: true,
							defaultValue: ["customer"],
							input: false,
						},
					},
				},
			} as BetterAuthOptions,
		});
		expect(schema.code).toContain(
			'roles: text("roles").array().default(["customer"]).notNull()',
		);
		expect(schema.code).not.toContain(".default(customer)");
	});

	it("emits a JS array literal for number[] additionalField defaultValue", async () => {
		const schema = await generateDrizzleSchema({
			file: "test.drizzle",
			adapter: {
				id: "drizzle",
				options: { provider: "pg", schema: {} },
			} as any,
			options: {
				database: {} as any,
				user: {
					additionalFields: {
						scores: {
							type: "number[]",
							required: true,
							defaultValue: [1, 2, 3],
						},
					},
				},
			} as BetterAuthOptions,
		});
		expect(schema.code).toContain(
			'scores: integer("scores").array().default([1, 2, 3]).notNull()',
		);
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
			// Prisma v7+ should not include url in datasource (configured in prisma.config.ts)
			expect(schema.code).not.toContain("url");
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

describe("--adapter flag support (mock adapter)", () => {
	// Helper function to create a mock adapter similar to createMockAdapter in generate.ts
	function createMockAdapter(adapterId: string, provider?: string): DBAdapter {
		return {
			id: adapterId,
			create: async () => {
				throw new Error("Mock adapter methods should not be called");
			},
			findOne: async () => {
				throw new Error("Mock adapter methods should not be called");
			},
			findMany: async () => {
				throw new Error("Mock adapter methods should not be called");
			},
			count: async () => {
				throw new Error("Mock adapter methods should not be called");
			},
			update: async () => {
				throw new Error("Mock adapter methods should not be called");
			},
			updateMany: async () => {
				throw new Error("Mock adapter methods should not be called");
			},
			delete: async () => {
				throw new Error("Mock adapter methods should not be called");
			},
			deleteMany: async () => {
				throw new Error("Mock adapter methods should not be called");
			},
			consumeOne: async () => {
				throw new Error("Mock adapter methods should not be called");
			},
			incrementOne: async () => {
				throw new Error("Mock adapter methods should not be called");
			},
			transaction: async (callback) => {
				throw new Error("Mock adapter methods should not be called");
			},
			options: {
				adapterConfig: {
					adapterId,
				},
				...(provider && { provider }),
			},
		};
	}

	it("should generate prisma schema with mock adapter", async () => {
		const mockAdapter = createMockAdapter("prisma", "postgresql");
		const schema = await generatePrismaSchema({
			file: "test.prisma",
			adapter: mockAdapter,
			options: {
				database: {} as any,
				plugins: [twoFactor(), username()],
			},
		});

		expect(schema.code).toBeDefined();
		expect(schema.code).toContain("model User");
		expect(schema.code).toContain("model Account");
		expect(schema.code).toContain("model Session");
	});

	it("should generate drizzle schema with mock adapter and provider", async () => {
		const mockAdapter = createMockAdapter("drizzle", "pg");
		const schema = await generateDrizzleSchema({
			file: "test.drizzle",
			adapter: mockAdapter,
			options: {
				database: {} as any,
				plugins: [twoFactor(), username()],
			},
		});

		expect(schema.code).toBeDefined();
		expect(schema.code).toContain("export const user");
		expect(schema.code).toContain("export const account");
		expect(schema.code).toContain("export const session");
	});

	it("should throw error when generating drizzle schema without provider", async () => {
		const mockAdapter = createMockAdapter("drizzle");
		await expect(
			generateDrizzleSchema({
				file: "test.drizzle",
				adapter: mockAdapter,
				options: {
					database: {} as any,
					plugins: [],
				},
			}),
		).rejects.toThrow(/Database provider type is undefined/);
	});

	it("should generate kysely schema with mock adapter", async () => {
		const mockAdapter = createMockAdapter("kysely");
		const schema = await generateKyselySchema({
			file: "test.sql",
			adapter: mockAdapter,
			options: {
				database: new Database(":memory:"),
			},
		});

		expect(schema.code).toBeDefined();
		expect(schema.code).toContain("create table");
	});

	it("should route to correct generator using generateSchema with mock prisma adapter", async () => {
		const mockAdapter = createMockAdapter("prisma", "postgresql");
		const schema = await generateSchema({
			adapter: mockAdapter,
			file: "test.prisma",
			options: {
				database: {} as any,
				plugins: [],
			},
		});

		expect(schema.code).toBeDefined();
		expect(schema.code).toContain("model User");
		expect(schema.fileName).toBe("test.prisma");
	});

	it("should route to correct generator using generateSchema with mock drizzle adapter", async () => {
		const mockAdapter = createMockAdapter("drizzle", "pg");
		const schema = await generateSchema({
			adapter: mockAdapter,
			file: "test.drizzle",
			options: {
				database: {} as any,
				plugins: [],
			},
		});

		expect(schema.code).toBeDefined();
		expect(schema.code).toContain("export const user");
		expect(schema.fileName).toBe("test.drizzle");
	});

	it("should route to correct generator using generateSchema with mock kysely adapter", async () => {
		const mockAdapter = createMockAdapter("kysely");
		const schema = await generateSchema({
			adapter: mockAdapter,
			file: "test.sql",
			options: {
				database: new Database(":memory:"),
			},
		});

		expect(schema.code).toBeDefined();
		expect(schema.code).toContain("create table");
		expect(schema.fileName).toBe("test.sql");
	});

	it("should throw error for unsupported adapter id", async () => {
		const mockAdapter = createMockAdapter("unsupported-adapter");
		let error: Error | undefined;
		try {
			generateSchema({
				adapter: mockAdapter,
				file: "test.txt",
				options: {
					database: {} as any,
					plugins: [],
				},
			});
		} catch (e) {
			error = e as Error;
		}
		expect(error).toBeDefined();
	});

	it("should generate prisma schema with mock adapter and usePlural option", async () => {
		const mockAdapter: DBAdapter = {
			...createMockAdapter("prisma", "postgresql"),
			options: {
				adapterConfig: {
					adapterId: "prisma",
					usePlural: true,
				},
				provider: "postgresql",
			},
		};

		const schema = await generatePrismaSchema({
			file: "test.prisma",
			adapter: mockAdapter,
			options: {
				database: {} as any,
				plugins: [],
			},
		});

		expect(schema.code).toBeDefined();
		expect(schema.code).toContain("model Users");
		expect(schema.code).toContain("model Accounts");
	});

	it("should generate drizzle schema with mock adapter and usePlural option", async () => {
		const mockAdapter: DBAdapter = {
			...createMockAdapter("drizzle", "pg"),
			options: {
				adapterConfig: {
					adapterId: "drizzle",
					usePlural: true,
				},
				provider: "pg",
			},
		};

		const schema = await generateDrizzleSchema({
			file: "test.drizzle",
			adapter: mockAdapter,
			options: {
				database: {} as any,
				plugins: [],
			},
		});

		expect(schema.code).toBeDefined();
		expect(schema.code).toContain("export const users");
		expect(schema.code).toContain("export const accounts");
	});
});

describe("--dialect flag support", () => {
	// Helper function that matches the implementation in generate.ts
	function createMockAdapterWithDialect(
		adapterId: string,
		dialect?: string,
	): DBAdapter {
		let provider: string | undefined;
		if (dialect) {
			if (adapterId === "drizzle") {
				if (dialect === "postgresql") {
					provider = "pg";
				} else if (dialect === "mysql" || dialect === "sqlite") {
					provider = dialect;
				} else {
					provider = dialect === "pg" ? "pg" : undefined;
				}
			} else if (adapterId === "prisma") {
				provider = dialect;
			}
		}

		return {
			id: adapterId,
			create: async () => {
				throw new Error("Mock adapter methods should not be called");
			},
			findOne: async () => {
				throw new Error("Mock adapter methods should not be called");
			},
			findMany: async () => {
				throw new Error("Mock adapter methods should not be called");
			},
			count: async () => {
				throw new Error("Mock adapter methods should not be called");
			},
			update: async () => {
				throw new Error("Mock adapter methods should not be called");
			},
			updateMany: async () => {
				throw new Error("Mock adapter methods should not be called");
			},
			delete: async () => {
				throw new Error("Mock adapter methods should not be called");
			},
			deleteMany: async () => {
				throw new Error("Mock adapter methods should not be called");
			},
			consumeOne: async () => {
				throw new Error("Mock adapter methods should not be called");
			},
			incrementOne: async () => {
				throw new Error("Mock adapter methods should not be called");
			},
			transaction: async (callback) => {
				throw new Error("Mock adapter methods should not be called");
			},
			options: {
				adapterConfig: {
					adapterId,
				},
				...(provider && { provider }),
			},
		};
	}

	it("should map postgresql dialect to pg provider for drizzle", async () => {
		const mockAdapter = createMockAdapterWithDialect("drizzle", "postgresql");
		expect(mockAdapter.options?.provider).toBe("pg");

		const schema = await generateDrizzleSchema({
			file: "test.drizzle",
			adapter: mockAdapter,
			options: {
				database: {} as any,
				plugins: [],
			},
		});

		expect(schema.code).toBeDefined();
		expect(schema.code).toContain("pg");
		expect(schema.code).toContain("export const user");
	});

	it("should map mysql dialect to mysql provider for drizzle", async () => {
		const mockAdapter = createMockAdapterWithDialect("drizzle", "mysql");
		expect(mockAdapter.options?.provider).toBe("mysql");

		const schema = await generateDrizzleSchema({
			file: "test.drizzle",
			adapter: mockAdapter,
			options: {
				database: {} as any,
				plugins: [],
			},
		});

		expect(schema.code).toBeDefined();
		expect(schema.code).toContain("mysql");
		expect(schema.code).toContain("export const user");
	});

	it("should map sqlite dialect to sqlite provider for drizzle", async () => {
		const mockAdapter = createMockAdapterWithDialect("drizzle", "sqlite");
		expect(mockAdapter.options?.provider).toBe("sqlite");

		const schema = await generateDrizzleSchema({
			file: "test.drizzle",
			adapter: mockAdapter,
			options: {
				database: {} as any,
				plugins: [],
			},
		});

		expect(schema.code).toBeDefined();
		expect(schema.code).toContain("sqlite");
		expect(schema.code).toContain("export const user");
	});

	it("should use postgresql dialect directly for prisma", async () => {
		const mockAdapter = createMockAdapterWithDialect("prisma", "postgresql");
		expect(mockAdapter.options?.provider).toBe("postgresql");

		const schema = await generatePrismaSchema({
			file: "test.prisma",
			adapter: mockAdapter,
			options: {
				database: {} as any,
				plugins: [],
			},
		});

		expect(schema.code).toBeDefined();
		expect(schema.code).toContain('provider = "postgresql"');
		expect(schema.code).toContain("model User");
	});

	it("should use mysql dialect directly for prisma", async () => {
		const mockAdapter = createMockAdapterWithDialect("prisma", "mysql");
		expect(mockAdapter.options?.provider).toBe("mysql");

		const schema = await generatePrismaSchema({
			file: "test.prisma",
			adapter: mockAdapter,
			options: {
				database: {} as any,
				plugins: [],
			},
		});

		expect(schema.code).toBeDefined();
		expect(schema.code).toContain('provider = "mysql"');
		expect(schema.code).toContain("model User");
	});

	it("should use sqlite dialect directly for prisma", async () => {
		const mockAdapter = createMockAdapterWithDialect("prisma", "sqlite");
		expect(mockAdapter.options?.provider).toBe("sqlite");

		const schema = await generatePrismaSchema({
			file: "test.prisma",
			adapter: mockAdapter,
			options: {
				database: {} as any,
				plugins: [],
			},
		});

		expect(schema.code).toBeDefined();
		expect(schema.code).toContain('provider = "sqlite"');
		expect(schema.code).toContain("model User");
	});

	it("should use mongodb dialect directly for prisma", async () => {
		const mockAdapter = createMockAdapterWithDialect("prisma", "mongodb");
		expect(mockAdapter.options?.provider).toBe("mongodb");

		const schema = await generatePrismaSchema({
			file: "test.prisma",
			adapter: mockAdapter,
			options: {
				database: {} as any,
				plugins: [],
			},
		});

		expect(schema.code).toBeDefined();
		expect(schema.code).toContain('provider = "mongodb"');
		expect(schema.code).toContain("model User");
	});

	it("should work with generateSchema routing for drizzle with dialect", async () => {
		const mockAdapter = createMockAdapterWithDialect("drizzle", "postgresql");
		const schema = await generateSchema({
			adapter: mockAdapter,
			file: "test.drizzle",
			options: {
				database: {} as any,
				plugins: [],
			},
		});

		expect(schema.code).toBeDefined();
		expect(schema.code).toContain("pg");
		expect(schema.fileName).toBe("test.drizzle");
	});

	it("should work with generateSchema routing for prisma with dialect", async () => {
		const mockAdapter = createMockAdapterWithDialect("prisma", "mysql");
		const schema = await generateSchema({
			adapter: mockAdapter,
			file: "test.prisma",
			options: {
				database: {} as any,
				plugins: [],
			},
		});

		expect(schema.code).toBeDefined();
		expect(schema.code).toContain('provider = "mysql"');
		expect(schema.fileName).toBe("test.prisma");
	});

	const pluginWithDisabledMigration = (): BetterAuthPlugin => ({
		id: "disabled-migration-test",
		schema: {
			emittedTable: {
				fields: {
					name: { type: "string", required: true },
				},
			},
			skippedTable: {
				fields: {
					name: { type: "string", required: true },
				},
				disableMigration: true,
			},
		},
	});

	it("should not emit drizzle tables with disableMigration", async () => {
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
				plugins: [pluginWithDisabledMigration()],
			} as BetterAuthOptions,
		});

		expect(schema.code).toContain("emittedTable");
		expect(schema.code).not.toContain("skippedTable");
	});

	it("should not emit prisma models with disableMigration", async () => {
		const schema = await generatePrismaSchema({
			file: "test.prisma",
			adapter: prismaAdapter(
				{},
				{ provider: "postgresql" },
			)({} as BetterAuthOptions),
			options: {
				database: prismaAdapter({}, { provider: "postgresql" }),
				plugins: [pluginWithDisabledMigration()],
			},
		});

		expect(schema.code).toContain("EmittedTable");
		expect(schema.code).not.toContain("SkippedTable");
	});
});
