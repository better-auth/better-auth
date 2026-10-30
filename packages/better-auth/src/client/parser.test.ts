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

	it("parses a plain constructor key in strict mode", () => {
		expect(parseJSON('{"constructor":"acme"}')).toEqual({
			constructor: "acme",
		});
		expect(parseJSON('{"meta":{"constructor":["a"]}}')).toEqual({
			meta: { constructor: ["a"] },
		});
	});

	it.each([
		{ name: "__proto__ key", input: '{"__proto__":{"polluted":true}}' },
		{
			name: "escaped __proto__ key",
			input: '{"\\u005f_proto__":{"polluted":true}}',
		},
		{
			name: "nested __proto__ key",
			input: '{"a":{"__proto__":{"polluted":true}}}',
		},
		{
			name: "__proto__ key inside an array",
			input: '[{"__proto__":{"polluted":true}}]',
		},
		{
			name: "constructor.prototype",
			input: '{"constructor":{"prototype":{"polluted":true}}}',
		},
	])("rejects $name in strict mode", ({ input }) => {
		expect(() => parseJSON(input)).toThrow(
			"[better-json] Potential prototype pollution attempt detected",
		);
	});

	it.each([
		{ input: '{"__proto__":{"polluted":true},"a":1}', expected: { a: 1 } },
		{
			input: '{"constructor":{"prototype":{"polluted":true}},"a":1}',
			expected: { a: 1 },
		},
	])("drops pollution keys when not strict: $input", ({ input, expected }) => {
		const parsed = parseJSON<Record<string, unknown>>(input, { strict: false });
		expect(parsed).toEqual(expected);
		expect(Object.hasOwn(parsed, "__proto__")).toBe(false);
		expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype);
	});
});
