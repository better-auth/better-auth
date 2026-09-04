import { describe, expect, it } from "vitest";
import type { IntrospectedTable } from "./schema-diff";
import { diffSchema, formatSchemaFindings } from "./schema-diff";

const expected = {
	account: {
		fields: {
			providerId: { type: "string", required: true },
			accountId: { type: "string", required: true },
			scope: { type: "string", required: false },
		},
	},
} as const;

function table(columns: IntrospectedTable["columns"]): IntrospectedTable {
	return { name: "account", columns };
}

const column = (
	name: string,
	overrides: Partial<IntrospectedTable["columns"][number]> = {},
) => ({ name, nullable: true, hasDefault: false, ...overrides });

describe("diffSchema", () => {
	it("accepts a table with every written column and only harmless extras", () => {
		const actual = table([
			column("id", { nullable: false }),
			column("providerId", { nullable: false }),
			column("accountId", { nullable: false }),
			column("scope"),
			column("tenant", { nullable: false, hasDefault: true }),
			column("note"),
		]);
		expect(diffSchema(expected, [actual])).toEqual([]);
	});

	it("reports a missing table", () => {
		expect(diffSchema(expected, [])).toEqual([
			{ kind: "missing-table", table: "account" },
		]);
	});

	it("reports missing columns including the implied id", () => {
		const actual = table([column("providerId"), column("accountId")]);
		expect(diffSchema(expected, [actual])).toEqual([
			{ kind: "missing-column", table: "account", column: "id" },
			{ kind: "missing-column", table: "account", column: "scope" },
		]);
	});

	it("reports a required column Better Auth never writes", () => {
		const actual = table([
			column("id", { nullable: false }),
			column("providerId", { nullable: false }),
			column("accountId", { nullable: false }),
			column("scope"),
			column("issuer", { nullable: false }),
		]);
		expect(diffSchema(expected, [actual])).toEqual([
			{
				kind: "unexpected-required-column",
				table: "account",
				column: "issuer",
			},
		]);
	});
});

describe("formatSchemaFindings", () => {
	it("names the fix for each source", () => {
		const findings = diffSchema(expected, [
			table([
				column("id"),
				column("providerId"),
				column("accountId"),
				column("issuer", { nullable: false }),
			]),
		]);
		const database = formatSchemaFindings(findings, "database");
		expect(database).toContain('Column "scope" is missing');
		expect(database).toContain("npx auth migrate");
		expect(database).toContain("account_issuer_accountId_uidx");
		expect(database).toContain("validateSchema: false");
		expect(formatSchemaFindings(findings, "drizzle")).toContain(
			"npx auth generate",
		);
		expect(formatSchemaFindings(findings, "prisma")).toContain(
			"prisma migrate",
		);
	});
});
