import { describe, expect, it } from "vitest";
import { tryParseJSON } from "./json";

describe("tryParseJSON", () => {
	it("should parse JSON arrays and objects", () => {
		expect(tryParseJSON('["a","b"]')).toEqual(["a", "b"]);
		expect(tryParseJSON('{"hello":"world"}')).toEqual({ hello: "world" });
	});

	it("should return original value for non-JSON strings", () => {
		expect(tryParseJSON("hello")).toBe("hello");
		expect(tryParseJSON('"hello"')).toBe('"hello"');
		expect(tryParseJSON("")).toBe("");
		expect(tryParseJSON("   ")).toBe("   ");
	});

	it("should return original value for invalid JSON", () => {
		expect(tryParseJSON("{not-json")).toBe("{not-json");
		expect(tryParseJSON("[not-json")).toBe("[not-json");
	});

	it("should pass through non-string values", () => {
		expect(tryParseJSON(["a"])).toEqual(["a"]);
		expect(tryParseJSON({ a: 1 })).toEqual({ a: 1 });
		expect(tryParseJSON(null)).toBe(null);
		expect(tryParseJSON(undefined)).toBe(undefined);
	});
});

