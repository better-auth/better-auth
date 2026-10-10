import { describe, expect, it } from "vitest";
import { isMissingTableError, isUniqueConstraintError } from "./db-errors";

/**
 * The shape `drizzle-orm` throws: `message` is the failed SQL text, and the
 * driver error carrying the SQLSTATE is on `cause`. Reported upstream as
 * better-auth#11034.
 */
const drizzleWrapped = (driverError: unknown) =>
	Object.assign(
		new Error(
			'Failed query: insert into "oauthResource" ("id", "identifier") values ($1, $2) returning "id"',
		),
		{ cause: driverError },
	);

describe("isUniqueConstraintError", () => {
	it("matches a bare Postgres unique violation by SQLSTATE", () => {
		const error = Object.assign(
			new Error('duplicate key value violates unique constraint "oauthResource_identifier_unique"'),
			{ code: "23505" },
		);
		expect(isUniqueConstraintError(error)).toBe(true);
	});

	it("matches a Drizzle-wrapped unique violation via the cause chain", () => {
		const cause = Object.assign(
			new Error('duplicate key value violates unique constraint "oauthResource_identifier_unique"'),
			{ code: "23505", constraint: "oauthResource_identifier_unique" },
		);
		expect(isUniqueConstraintError(drizzleWrapped(cause))).toBe(true);
	});

	it("matches when only the wrapped cause carries the code and no message text", () => {
		expect(isUniqueConstraintError(drizzleWrapped({ code: "23505" }))).toBe(true);
	});

	it.each([
		["1062", "MySQL"],
		["11000", "MongoDB"],
		["2067", "SQLite extended"],
		["2601", "SQL Server"],
		["2627", "SQL Server"],
		["ER_DUP_ENTRY", "MySQL symbolic"],
		["P2002", "Prisma"],
		["SQLITE_CONSTRAINT_UNIQUE", "better-sqlite3"],
	])("matches driver identifier %s (%s)", (code) => {
		expect(isUniqueConstraintError({ code })).toBe(true);
	});

	it("matches identifiers reported as errno, errcode, or number", () => {
		expect(isUniqueConstraintError({ errno: 1062 })).toBe(true);
		expect(isUniqueConstraintError({ errcode: "23505" })).toBe(true);
		expect(isUniqueConstraintError({ number: 2627 })).toBe(true);
	});

	it("falls back to message text for adapters that expose no code", () => {
		expect(isUniqueConstraintError(new Error("UNIQUE constraint failed: oauthResource.identifier"))).toBe(true);
		expect(isUniqueConstraintError(new Error("Duplicate entry 'x' for key 'identifier'"))).toBe(true);
	});

	it("does not match unrelated failures", () => {
		expect(isUniqueConstraintError(new Error("connection terminated unexpectedly"))).toBe(false);
		expect(isUniqueConstraintError(Object.assign(new Error("not null violation"), { code: "23502" }))).toBe(false);
		expect(isUniqueConstraintError(drizzleWrapped(Object.assign(new Error("deadlock detected"), { code: "40P01" })))).toBe(false);
	});

	it("does not misclassify an unconstrained mention of the word 'unique'", () => {
		// A bare "unique" match would swallow this unrelated failure and
		// misreport it as a lost insert race (flagged in PR #11087 review).
		expect(isUniqueConstraintError(new Error("could not uniquely identify row for update"))).toBe(false);
		expect(isUniqueConstraintError(new Error("column values are not unique across shards"))).toBe(false);
	});

	it("tolerates non-object throwables", () => {
		expect(isUniqueConstraintError(undefined)).toBe(false);
		expect(isUniqueConstraintError(null)).toBe(false);
		expect(isUniqueConstraintError("duplicate key value")).toBe(true);
		expect(isUniqueConstraintError("connection refused")).toBe(false);
	});

	it("terminates on a cyclic cause chain", () => {
		const first = new Error("outer") as Error & { cause?: unknown };
		const second = new Error("inner") as Error & { cause?: unknown };
		first.cause = second;
		second.cause = first;
		expect(isUniqueConstraintError(first)).toBe(false);
	});

	it("stops walking past the depth cap", () => {
		let error: { message: string; cause?: unknown } = { message: "duplicate key" };
		for (let i = 0; i < 20; i += 1) error = { message: "wrapper", cause: error };
		expect(isUniqueConstraintError(error)).toBe(false);
	});
});

describe("isMissingTableError", () => {
	it("matches SQLite, Postgres, and MySQL wording", () => {
		expect(isMissingTableError(new Error("no such table: oauthResource"))).toBe(true);
		expect(isMissingTableError(new Error('relation "oauthResource" does not exist'))).toBe(true);
		expect(isMissingTableError(new Error("Table 'db.oauthResource' doesn't exist"))).toBe(true);
	});

	it("matches a Drizzle-wrapped missing-table error via the cause chain", () => {
		expect(isMissingTableError(drizzleWrapped(new Error('relation "oauthResource" does not exist')))).toBe(true);
	});

	it("does not match unrelated failures", () => {
		expect(isMissingTableError(new Error("permission denied for table oauthResource"))).toBe(false);
		expect(isMissingTableError(null)).toBe(false);
	});
});
