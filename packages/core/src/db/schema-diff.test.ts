import { describe, expect, it } from "vitest";
import {
	diffSchema,
	formatSchemaFinding,
	SchemaMismatchError,
} from "./schema-diff";

const expected = {
	account: {
		fields: {
			accountId: { type: "string" as const },
			providerId: { type: "string" as const },
		},
	},
};

const column = (name: string, nullable = false, hasDefault = false) => ({
	name,
	nullable,
	hasDefault,
});

const issuerDrift = {
	kind: "unexpected-required-column",
	table: "account",
	column: "issuer",
} as const;

describe("diffSchema", () => {
	it("reports a missing table", () => {
		expect(diffSchema(expected, [])).toEqual([
			{ kind: "missing-table", table: "account" },
		]);
	});

	it("reports a missing column, including the implicit id", () => {
		const actual = [{ name: "account", columns: [column("accountId")] }];
		expect(diffSchema(expected, actual)).toEqual([
			{ kind: "missing-column", table: "account", column: "id" },
			{ kind: "missing-column", table: "account", column: "providerId" },
		]);
	});

	it("reports a required column Better Auth never writes", () => {
		const actual = [
			{
				name: "account",
				columns: [
					column("id"),
					column("accountId"),
					column("providerId"),
					column("issuer"),
				],
			},
		];
		expect(diffSchema(expected, actual)).toEqual([issuerDrift]);
	});

	it("tolerates an extra column that is nullable or has a default", () => {
		const actual = [
			{
				name: "account",
				columns: [
					column("id"),
					column("accountId"),
					column("providerId"),
					column("issuer", true),
					column("tier", false, true),
				],
			},
		];
		expect(diffSchema(expected, actual)).toEqual([]);
	});

	it("matches a schema-qualified table only in that schema", () => {
		const columns = [column("id"), column("accountId"), column("providerId")];
		const qualified = { account: { ...expected.account, schema: "auth" } };
		expect(
			diffSchema(qualified, [{ name: "account", schema: "public", columns }]),
		).toEqual([{ kind: "missing-table", table: "account" }]);
		expect(
			diffSchema(qualified, [{ name: "account", schema: "auth", columns }]),
		).toEqual([]);
		expect(
			diffSchema(expected, [{ name: "account", schema: "auth", columns }]),
		).toEqual([]);
	});

	it("skips a table that manages its own storage", () => {
		const own = { ...expected, jwks: { fields: {}, disableMigrations: true } };
		const actual = [
			{
				name: "account",
				columns: [column("id"), column("accountId"), column("providerId")],
			},
		];
		expect(diffSchema(own, actual)).toEqual([]);
	});
});

describe("SchemaMismatchError", () => {
	it("carries the findings as data and the fixes as text", () => {
		const error = new SchemaMismatchError([issuerDrift], "database");
		expect(error.code).toBe("SCHEMA_MISMATCH");
		expect(error.findings).toEqual([issuerDrift]);
		expect(error.message).toContain("1 problem");
		expect(error.message).toContain("account_issuer_accountId_uidx");
		expect(error.message).toContain("validateSchema: false");
	});

	it("names the index to drop first for the 1.7 issuer column", () => {
		expect(formatSchemaFinding(issuerDrift, "database")).toContain(
			"account_issuer_accountId_uidx",
		);
	});
});
