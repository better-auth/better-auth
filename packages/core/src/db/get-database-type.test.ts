import { describe, expect, it } from "vitest";
import type { BetterAuthOptions } from "../types";
import { getDatabaseType } from "./get-database-type";

const asDatabase = (value: unknown) => value as BetterAuthOptions["database"];

describe("getDatabaseType", () => {
	it("reads the explicit engine from the { dialect, type } form", () => {
		expect(getDatabaseType(asDatabase({ dialect: {}, type: "postgres" }))).toBe(
			"postgres",
		);
	});

	it("reads the explicit engine from the { db, type } form", () => {
		expect(getDatabaseType(asDatabase({ db: {}, type: "mssql" }))).toBe(
			"mssql",
		);
	});

	it("returns null for an adapter factory (function)", () => {
		expect(getDatabaseType(asDatabase(() => ({})))).toBeNull();
	});

	it("returns null when no database is configured", () => {
		expect(getDatabaseType(undefined)).toBeNull();
	});

	it("classifies a pg-style pool as postgres", () => {
		expect(
			getDatabaseType(asDatabase({ connect: () => {}, end: () => {} })),
		).toBe("postgres");
	});

	it("classifies a mysql2-style pool as mysql", () => {
		expect(
			getDatabaseType(asDatabase({ getConnection: () => {}, end: () => {} })),
		).toBe("mysql");
	});

	it("classifies a better-sqlite3-style handle as sqlite", () => {
		expect(
			getDatabaseType(
				asDatabase({ open: true, close: () => {}, prepare: () => {} }),
			),
		).toBe("sqlite");
	});

	it("returns null for a bare Kysely dialect (use { dialect, type } instead)", () => {
		expect(
			getDatabaseType(
				asDatabase({
					createDriver: () => {},
					createAdapter: () => {},
					createIntrospector: () => {},
					createQueryCompiler: () => {},
				}),
			),
		).toBeNull();
	});
});
