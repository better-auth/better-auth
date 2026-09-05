import type { ExpectedSchema } from "@better-auth/core/db/internal";
import type { KyselyPlugin } from "kysely";
import {
	CamelCasePlugin,
	DummyDriver,
	Kysely,
	SqliteAdapter,
	SqliteIntrospector,
	SqliteQueryCompiler,
} from "kysely";
import { describe, expect, it } from "vitest";
import { toPhysicalSchema } from "./introspect";

/**
 * A connection that compiles queries and never sends them.
 */
function connection(plugins: KyselyPlugin[] = []) {
	return new Kysely<unknown>({
		dialect: {
			createAdapter: () => new SqliteAdapter(),
			createDriver: () => new DummyDriver(),
			createIntrospector: (db) => new SqliteIntrospector(db),
			createQueryCompiler: () => new SqliteQueryCompiler(),
		},
		plugins,
	});
}

const expected: ExpectedSchema = {
	twoFactor: {
		fields: {
			userId: { type: "string" },
			backupCodes: { type: "string", required: false },
		},
	},
};

describe("toPhysicalSchema", () => {
	it("keeps the schema when no plugin renames identifiers", () => {
		expect(toPhysicalSchema(connection(), expected)).toEqual(expected);
	});

	it("uses the identifiers the plugins send", () => {
		expect(
			toPhysicalSchema(connection([new CamelCasePlugin()]), expected),
		).toEqual({
			two_factor: {
				fields: {
					user_id: { type: "string" },
					backup_codes: { type: "string", required: false },
				},
			},
		});
	});

	it("carries the schema a plugin qualifies tables with", () => {
		const physical = toPhysicalSchema(
			connection().withSchema("auth"),
			expected,
		);
		expect(physical.twoFactor?.schema).toBe("auth");
		expect(
			toPhysicalSchema(connection(), expected).twoFactor?.schema,
		).toBeUndefined();
	});

	it("follows the plugin options rather than a fixed rule", () => {
		expect(
			toPhysicalSchema(
				connection([new CamelCasePlugin({ upperCase: true })]),
				expected,
			),
		).toHaveProperty("TWO_FACTOR.fields.USER_ID");
	});
});
