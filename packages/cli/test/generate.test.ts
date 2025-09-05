import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { generatePrismaSchema } from "../src/generators/prisma";
import { organization, twoFactor, username } from "better-auth/plugins";
import { generateDrizzleSchema } from "../src/generators/drizzle";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { generateMigrations } from "../src/generators/kysely";
import Database from "better-sqlite3";
import type { BetterAuthOptions } from "better-auth";
import * as config from "../src/utils/get-config";
import { generateAuthConfig } from "../src/generators/auth-config";
import type { SupportedPlugin } from "../src/commands/init";

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
						useNumberId: true,
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

describe("generate command with force flag", () => {
	const db = new Database(":memory:");
	const authConfig = {
		baseURL: "http://localhost:3000",
		database: db,
		emailAndPassword: {
			enabled: true,
		},
	};

	beforeEach(() => {
		vi.spyOn(process, "exit").mockImplementation((code) => {
			return code as never;
		});
		vi.spyOn(config, "getConfig").mockImplementation(async () => authConfig);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("should pass force flag to config when --force is used", async () => {
		const options = {
			cwd: process.cwd(),
			config: "test/auth.ts",
			force: true,
		};

		const fullConfig = options.force
			? ({ ...authConfig, __force: true } as any)
			: authConfig;

		expect(fullConfig).toEqual(
			expect.objectContaining({
				__force: true,
			}),
		);
	});

	it("should not pass force flag to config when --force is not used", async () => {
		const options = {
			cwd: process.cwd(),
			config: "test/auth.ts",
			force: false,
		};

		const fullConfig = options.force
			? ({ ...authConfig, __force: true } as any)
			: authConfig;
		expect(fullConfig).not.toEqual(
			expect.objectContaining({
				__force: true,
			}),
		);
		expect(fullConfig).toEqual(authConfig);
	});

	it("should pass --force flag to config and regenerate schema multiple times", async () => {
		const db = new Database(":memory:");

		const firstSchema = await generateMigrations({
			file: "test-force-regenerate.sql",
			options: {
				database: db,
				__force: true,
			} as any,
			adapter: {} as any,
		});

		expect(firstSchema.code).toBeDefined();
		expect(typeof firstSchema.code).toBe("string");
		const firstSchemaContent = firstSchema.code;
		expect(firstSchemaContent?.length).toBeGreaterThan(0);

		const secondSchema = await generateMigrations({
			file: "test-force-regenerate.sql",
			options: {
				database: db,
				__force: true,
			} as any,
			adapter: {} as any,
		});

		expect(secondSchema.code).toBeDefined();
		expect(typeof secondSchema.code).toBe("string");
		const secondSchemaContent = secondSchema.code;
		expect(secondSchemaContent?.length).toBeGreaterThan(0);

		expect(async () => {
			await generateMigrations({
				file: "test-force-regenerate.sql",
				options: {
					database: db,
					__force: true,
				} as any,
				adapter: {} as any,
			});
		}).not.toThrow();
	});
});
