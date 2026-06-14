import { describe, expect, it } from "vitest";
import { parseJSON } from "./parser";

describe("parseJSON", () => {
	it.each([
		{ name: "newline", input: '"hello\\nworld"', expected: "hello\nworld" },
		{ name: "tab", input: '"with\\ttab"', expected: "with\ttab" },
		{ name: "unicode escape", input: '"caf\\u00e9"', expected: "café" },
		{ name: "backslash", input: '"back\\\\slash"', expected: "back\\slash" },
		{
			name: "escaped quote",
			input: '"quote\\"inside"',
			expected: 'quote"inside',
		},
	])("decodes $name inside quoted strings", ({ input, expected }) => {
		expect(parseJSON(input)).toBe(expected);
	});

	it.each([
		"plain",
		"with\nnewline",
		"with\ttab",
		"with \\ backslash",
		'with " quote',
		"unicode: 안녕하세요",
	])("round-trips %j through JSON.stringify", (value) => {
		expect(parseJSON(JSON.stringify(value))).toBe(value);
	});

	it("still parses objects and arrays", () => {
		expect(parseJSON('{"a":1,"b":"x"}')).toEqual({ a: 1, b: "x" });
		expect(parseJSON("[1,2,3]")).toEqual([1, 2, 3]);
	});

	it.each([
		{ input: "true", expected: true },
		{ input: "false", expected: false },
		{ input: "null", expected: null },
		{ input: "42", expected: 42 },
	])("parses primitive $input", ({ input, expected }) => {
		expect(parseJSON(input)).toBe(expected);
	});

	it("preserves non-JSON strings as-is when not strict", () => {
		expect(parseJSON("not json", { strict: false })).toBe("not json");
	});
});
