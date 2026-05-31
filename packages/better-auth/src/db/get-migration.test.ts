import { describe, expect, it } from "vitest";
import { matchType } from "./get-migration";

describe("matchType array fields", () => {
	it("matches the dialect's JSON storage for either array field type", () => {
		// Kysely stores arrays as jsonb (pg), json (mysql), text (sqlite),
		// varchar (mssql). Both string[] and number[] share that one column, so
		// on these dialects the element type can't be (and isn't) distinguished.
		expect(matchType("jsonb", "string[]", "postgres")).toBe(true);
		expect(matchType("json", "number[]", "mysql")).toBe(true);
		expect(matchType("text", "string[]", "sqlite")).toBe(true);
		expect(matchType("text", "number[]", "sqlite")).toBe(true);
		expect(matchType("varchar(8000)", "number[]", "mssql")).toBe(true);
	});

	it("matches a native Postgres array column only for the right element type", () => {
		// pg introspection reports the element type as "_text"/"_int4" or "text[]".
		expect(matchType("_text", "string[]", "postgres")).toBe(true);
		expect(matchType("text[]", "string[]", "postgres")).toBe(true);
		expect(matchType("_varchar", "string[]", "postgres")).toBe(true);
		expect(matchType("_int4", "number[]", "postgres")).toBe(true);
		expect(matchType("numeric[]", "number[]", "postgres")).toBe(true);
		// A number column must not satisfy string[], nor a text column number[].
		expect(matchType("_int4", "string[]", "postgres")).toBe(false);
		expect(matchType("_text", "number[]", "postgres")).toBe(false);
		// Element types are matched exactly, so `interval` is not a number type.
		expect(matchType("_interval", "number[]", "postgres")).toBe(false);
	});
});
