import { describe, expect, it } from "vitest";
import {
	diffSchema,
	formatSchemaFinding,
	getExpectedSchema,
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
		expect(error.message).toContain("1.7.0 through 1.7.2");
		expect(error.message).toContain("validateSchema: false");
	});

	/**
	 * @see https://www.better-auth.com/docs/guides/1-7-upgrade-guide
	 */
	it.each([
		"account",
		"accounts",
		"plugin_tokens",
	])("does not assume the origin or index name of %s.issuer", (table) => {
		const message = formatSchemaFinding({ ...issuerDrift, table }, "database");
		expect(message).toContain(
			"If this column came from Better Auth 1.7.0 through 1.7.2",
		);
		expect(message).not.toContain(`${table}_issuer_accountId_uidx`);
	});
});

/**
 * @see https://www.better-auth.com/docs/guide/create-a-plugin#schema
 */
describe("shared physical tables", () => {
	it.each([
		false,
		true,
	])("checks shared tables regardless of model order (reversed=%s)", (reversed) => {
		const models = [
			[
				"managed",
				{ modelName: "shared", fields: { value: { type: "string" as const } } },
			],
			["external", { modelName: "shared", disableMigration: true, fields: {} }],
		] as const;
		const schema = getExpectedSchema({
			plugins: [
				{
					id: "shared",
					schema: Object.fromEntries(reversed ? [...models].reverse() : models),
				},
			],
		});
		const shared = { shared: schema.shared! };
		expect(diffSchema(shared, [])).toEqual([
			{ kind: "missing-table", table: "shared" },
		]);
		expect(
			diffSchema(shared, [{ name: "shared", columns: [column("id")] }]),
		).toEqual([{ kind: "missing-column", table: "shared", column: "value" }]);
		expect(
			diffSchema(shared, [
				{ name: "shared", columns: [column("id"), column("value")] },
			]),
		).toEqual([]);
	});
});
