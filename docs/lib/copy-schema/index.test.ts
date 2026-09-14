import { describe, expect, it } from "vitest";
import { drizzleResolver } from "./adapter/drizzle";
import { prismaResolver } from "./adapter/prisma";
import { copySchema } from "./index";
import type { DBSchema } from "./types";
import { getIndexName } from "./utils";

const schema = {
	modelName: "deviceCode",
	fields: [
		{ fieldName: "id", type: "string", required: true },
		{
			fieldName: "deviceCode",
			type: "string",
			required: true,
			index: true,
		},
		{ fieldName: "userCode", type: "string", required: true, index: true },
		{
			fieldName: "uniqueCode",
			type: "string",
			required: true,
			unique: true,
			index: true,
		},
	],
} satisfies DBSchema;

/**
 * @see https://github.com/better-auth/better-auth/issues/10025
 */
describe("copySchema indexes", () => {
	it("generates portable non-unique SQL indexes", () => {
		const mysql = copySchema(schema, {
			dialect: "mysql",
			mode: "create",
		}).result;

		expect(mysql).toContain("`deviceCode` varchar(191)");
		expect(mysql).toContain("`deviceCode`(191)");
		expect(mysql).toContain("`userCode`(191)");
		expect(mysql).not.toContain("uniqueCode_idx");

		for (const dialect of ["sqlite", "postgresql", "mssql"] as const) {
			const result = copySchema(schema, { dialect, mode: "create" }).result;
			expect(result).toContain("deviceCode_idx");
			expect(result).toContain("userCode_idx");
			expect(result).not.toContain("uniqueCode_idx");
		}
	});

	it("preserves the same index contract in Prisma and Drizzle", () => {
		const prisma = copySchema(schema, {
			dialect: prismaResolver({ provider: "mysql" }),
			mode: "create",
		}).result;
		expect(prisma).toContain("@@index([deviceCode]");
		expect(prisma).not.toContain("@@index([uniqueCode]");

		const drizzle = copySchema(schema, {
			dialect: drizzleResolver({ provider: "mysql" }),
			mode: "create",
		}).result;
		expect(drizzle).toContain('varchar("device_code", { length: 191 })');
		expect(drizzle).toContain(".on(table.deviceCode)");
		expect(drizzle).not.toContain(".on(table.uniqueCode)");
	});

	it("keeps generated index names within the portable byte limit", () => {
		const indexName = getIndexName(
			"deviceAuthorizationCodeWithAnExtremelyLongTableName",
			{
				fieldName: "deviceAuthorizationCodeWithAnExtremelyLongFieldName",
				type: "string",
				index: true,
			},
		);

		expect(new TextEncoder().encode(indexName).byteLength).toBeLessThanOrEqual(
			63,
		);
	});
});

/**
 * Foreign-key columns must use the same SQL type as the column they reference,
 * otherwise MySQL/MSSQL reject the FK constraint (e.g. text cannot reference varchar).
 */
describe("copySchema foreign-key column types", () => {
	const sessionSchema = {
		modelName: "session",
		fields: [
			{ fieldName: "id", type: "string", required: true },
			{
				fieldName: "userId",
				type: "string",
				required: true,
				index: true,
				references: { model: "user", field: "id", onDelete: "cascade" },
			},
		],
	} satisfies DBSchema;

	it("matches the id column type for foreign keys in MySQL", () => {
		const mysql = copySchema(sessionSchema, {
			dialect: "mysql",
			mode: "create",
		}).result;

		expect(mysql).toContain("`id` varchar(36)");
		expect(mysql).toContain("`userId` varchar(36)");
		expect(mysql).not.toContain("`userId` text");
	});

	it("matches the id column type for foreign keys in MSSQL", () => {
		const mssql = copySchema(sessionSchema, {
			dialect: "mssql",
			mode: "create",
		}).result;

		expect(mssql).toContain("[id] varchar(36)");
		expect(mssql).toContain("[userId] varchar(36)");
	});

	it("matches the id column type for foreign keys in PostgreSQL", () => {
		const postgresql = copySchema(sessionSchema, {
			dialect: "postgresql",
			mode: "create",
		}).result;

		expect(postgresql).toContain('"id" text');
		expect(postgresql).toContain('"userId" text');
	});

	it("matches the id column type for foreign keys in Drizzle (MySQL)", () => {
		const drizzleMysql = copySchema(sessionSchema, {
			dialect: drizzleResolver({ provider: "mysql" }),
			mode: "create",
		}).result;

		expect(drizzleMysql).toContain(
			't.varchar("id", { length: 36 }).primaryKey()',
		);
		expect(drizzleMysql).toContain('t.varchar("user_id", { length: 36 })');
		expect(drizzleMysql).not.toContain('t.text("user_id")');
	});

	it("keeps foreign keys as text in Drizzle (pg, sqlite)", () => {
		for (const provider of ["pg", "sqlite"] as const) {
			const result = copySchema(sessionSchema, {
				dialect: drizzleResolver({ provider }),
				mode: "create",
			}).result;

			expect(result).toContain('t.text("user_id")');
		}
	});
});
