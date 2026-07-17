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

describe("parseJSON ISO date parsing", () => {
	it.each([
		{ name: "millisecond (3 digits)", frac: "123", expectedMs: 123 },
		{ name: "single digit", frac: "5", expectedMs: 500 },
		{ name: "two digits", frac: "12", expectedMs: 120 },
		{ name: "microsecond (6 digits)", frac: "123456", expectedMs: 123 },
		{ name: "7 digits", frac: "1234567", expectedMs: 123 },
	])("truncates $name fractional seconds to milliseconds", ({
		frac,
		expectedMs,
	}) => {
		const value = parseJSON(`"2024-01-01T00:00:00.${frac}Z"`);
		expect(value).toBeInstanceOf(Date);
		expect((value as Date).getTime()).toBe(
			Date.UTC(2024, 0, 1, 0, 0, 0, expectedMs),
		);
	});
});
