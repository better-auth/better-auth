import { describe, expect, it } from "vitest";
import { matchType } from "./get-migration";

describe("matchType", () => {
	describe("postgres array fields", () => {
		it("accepts native text[] for string[]", () => {
			expect(matchType("text[]", "string[]", "postgres")).toBe(true);
			expect(matchType("character varying[]", "string[]", "postgres")).toBe(
				true,
			);
			expect(matchType("_text", "string[]", "postgres")).toBe(true);
		});

		it("accepts native integer[] for number[]", () => {
			expect(matchType("integer[]", "number[]", "postgres")).toBe(true);
			expect(matchType("bigint[]", "number[]", "postgres")).toBe(true);
			expect(matchType("_int4", "number[]", "postgres")).toBe(true);
		});

		it("accepts legacy jsonb for string[] and number[]", () => {
			expect(matchType("jsonb", "string[]", "postgres")).toBe(true);
			expect(matchType("json", "number[]", "postgres")).toBe(true);
		});

		it("rejects unrelated postgres types", () => {
			expect(matchType("text", "string[]", "postgres")).toBe(false);
			expect(matchType("integer", "number[]", "postgres")).toBe(false);
		});
	});

	describe("non-postgres array fields", () => {
		it("matches json storage types", () => {
			expect(matchType("json", "string[]", "mysql")).toBe(true);
			expect(matchType("jsonb", "number[]", "mysql")).toBe(true);
			expect(matchType("TEXT", "string[]", "sqlite")).toBe(false);
		});
	});
});
