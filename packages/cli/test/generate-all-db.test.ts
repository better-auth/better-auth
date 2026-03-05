import type { BetterAuthOptions } from "@better-auth/core";
import { passkey } from "@better-auth/passkey";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { twoFactor, username } from "better-auth/plugins";
import { describe, expect, it } from "vitest";
import { generateDrizzleSchema } from "../src/generators/drizzle";

describe("generate drizzle schema for all databases", async () => {
	it("should generate drizzle schema for MySQL", async () => {
		const schema = await generateDrizzleSchema({
			file: "test.drizzle",
			adapter: drizzleAdapter(
				{},
				{
					provider: "mysql",
					schema: {},
				},
			)({} as BetterAuthOptions),
			options: {
				database: drizzleAdapter(
					{},
					{
						provider: "mysql",
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
			"./__snapshots__/auth-schema-mysql.txt",
		);
	});

	it("should generate drizzle schema for SQLite", async () => {
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
			"./__snapshots__/auth-schema-sqlite.txt",
		);
	});

	it("should generate drizzle schema for MySQL with number id", async () => {
		const schema = await generateDrizzleSchema({
			file: "test.drizzle",
			adapter: drizzleAdapter(
				{},
				{
					provider: "mysql",
					schema: {},
				},
			)({} as BetterAuthOptions),
			options: {
				database: drizzleAdapter(
					{},
					{
						provider: "mysql",
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
			"./__snapshots__/auth-schema-mysql-number-id.txt",
		);
	});
	it("should generate drizzle schema for MySQL with uuid id", async () => {
		const schema = await generateDrizzleSchema({
			file: "test.drizzle",
			adapter: drizzleAdapter(
				{},
				{
					provider: "mysql",
					schema: {},
				},
			)({} as BetterAuthOptions),
			options: {
				database: drizzleAdapter(
					{},
					{
						provider: "mysql",
						schema: {},
					},
				),
				plugins: [twoFactor(), username()],
				advanced: {
					database: {
						generateId: "uuid",
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
			"./__snapshots__/auth-schema-mysql-uuid.txt",
		);
	});

	it("should generate drizzle schema for PostgreSQL with uuid id", async () => {
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
						generateId: "uuid",
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
			"./__snapshots__/auth-schema-pg-uuid.txt",
		);
	});
	it("should generate drizzle schema for SQLite with uuid id", async () => {
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
				plugins: [twoFactor(), username()],
				advanced: {
					database: {
						generateId: "uuid",
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
			"./__snapshots__/auth-schema-sqlite-uuid.txt",
		);
	});

	it("should generate drizzle schema for SQLite with number id", async () => {
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
			"./__snapshots__/auth-schema-sqlite-number-id.txt",
		);
	});
});

describe("generate drizzle schema for all databases with passkey plugin", async () => {
	it("should generate drizzle schema for MySQL with passkey plugin", async () => {
		const schema = await generateDrizzleSchema({
			file: "test.drizzle",
			adapter: drizzleAdapter(
				{},
				{
					provider: "mysql",
					schema: {},
				},
			)({} as BetterAuthOptions),
			options: {
				database: drizzleAdapter(
					{},
					{
						provider: "mysql",
						schema: {},
					},
				),
				plugins: [passkey()],
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
			"./__snapshots__/auth-schema-mysql-passkey.txt",
		);
	});

	it("should generate drizzle schema for SQLite with passkey plugin", async () => {
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
				plugins: [passkey()],
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
			"./__snapshots__/auth-schema-sqlite-passkey.txt",
		);
	});

	it("should generate drizzle schema for PostgreSQL with passkey plugin", async () => {
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
				plugins: [passkey()],
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
			"./__snapshots__/auth-schema-pg-passkey.txt",
		);
	});

	it("should generate drizzle schema for MySQL with passkey plugin and number id", async () => {
		const schema = await generateDrizzleSchema({
			file: "test.drizzle",
			adapter: drizzleAdapter(
				{},
				{
					provider: "mysql",
					schema: {},
				},
			)({} as BetterAuthOptions),
			options: {
				database: drizzleAdapter(
					{},
					{
						provider: "mysql",
						schema: {},
					},
				),
				plugins: [passkey()],
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
			"./__snapshots__/auth-schema-mysql-passkey-number-id.txt",
		);
	});

	it("should generate drizzle schema for SQLite with passkey plugin and number id", async () => {
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
				plugins: [passkey()],
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
			"./__snapshots__/auth-schema-sqlite-passkey-number-id.txt",
		);
	});
});
