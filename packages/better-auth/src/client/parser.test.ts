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

	describe("ISO date parsing", () => {
		it("converts date fields to Date instances while preserving non-date string fields", () => {
			const name = "2026-11-21T08:00:00+08:00";
			const expiresAt = "2026-11-28T00:00:00.000Z";
			const createdAt = "2026-11-20T12:00:00.000Z";
			const input = JSON.stringify({
				user: {
					id: "u1",
					name,
					email: "2026-11-21T08:00:00Z@example.com",
					createdAt,
				},
				session: {
					id: "s1",
					userId: "u1",
					expiresAt,
				},
			});

			const parsed = parseJSON<{
				user: { id: string; name: string; email: string; createdAt: Date };
				session: { id: string; userId: string; expiresAt: Date };
			}>(input);

			expect(parsed.session.expiresAt).toBeInstanceOf(Date);
			expect(parsed.session.expiresAt.toISOString()).toBe(expiresAt);
			expect(parsed.user.createdAt).toBeInstanceOf(Date);
			expect(parsed.user.createdAt.toISOString()).toBe(createdAt);
			expect(parsed.user.name).toBe(name);
			expect(typeof parsed.user.name).toBe("string");
		});

		it.each([
			{ field: "createdAt", expected: true },
			{ field: "updatedAt", expected: true },
			{ field: "expiresAt", expected: true },
			{ field: "accessTokenExpiresAt", expected: true },
			{ field: "refreshTokenExpiresAt", expected: true },
			{ field: "bannedUntil", expected: true },
			{ field: "lockedUntil", expected: true },
			{ field: "banExpires", expected: true },
			{ field: "birthDate", expected: true },
			{ field: "authTime", expected: true },
			{ field: "created_at", expected: true },
			{ field: "expires_at", expected: true },
			{ field: "CREATED_AT", expected: true },
			{ field: "EXPIRES_AT", expected: true },
			{ field: "periodStart", expected: true },
			{ field: "trialEnd", expected: true },
			{ field: "name", expected: false },
			{ field: "userName", expected: false },
			{ field: "email", expected: false },
			{ field: "token", expected: false },
			{ field: "id", expected: false },
			{ field: "role", expected: false },
			{ field: "format", expected: false },
			{ field: "chat", expected: false },
			{ field: "title", expected: false },
			{ field: "description", expected: false },
		])(
			"evaluates $field date conversion eligibility (converts: $expected)",
			({ field, expected }) => {
				const iso = "2026-11-21T12:00:00.000Z";
				const parsed = parseJSON<Record<string, unknown>>(
					JSON.stringify({ [field]: iso }),
				);
				if (expected) {
					expect(parsed[field]).toBeInstanceOf(Date);
					expect((parsed[field] as Date).toISOString()).toBe(iso);
				} else {
					expect(typeof parsed[field]).toBe("string");
					expect(parsed[field]).toBe(iso);
				}
			},
		);

		it("round-trips an ISO string literal through JSON.stringify without converting to Date", () => {
			const iso = "2026-11-21T08:00:00+08:00";
			expect(parseJSON(JSON.stringify(iso))).toBe(iso);
		});

		it("preserves ISO strings inside arrays without converting to Date", () => {
			const isoList = ["2026-11-21T08:00:00+08:00", "2026-11-22T08:00:00.000Z"];
			const parsed = parseJSON<string[]>(JSON.stringify(isoList));
			expect(parsed).toEqual(isoList);
			expect(typeof parsed[0]).toBe("string");
			expect(typeof parsed[1]).toBe("string");
		});

		it("converts date fields inside array of objects", () => {
			const iso = "2026-11-28T00:00:00.000Z";
			const items = [{ id: "1", expiresAt: iso }];
			const parsed = parseJSON<Array<{ id: string; expiresAt: Date }>>(
				JSON.stringify(items),
			);
			const firstItem = parsed[0];
			expect(firstItem?.expiresAt).toBeInstanceOf(Date);
			expect(firstItem?.expiresAt.toISOString()).toBe(iso);
		});

		it("supports custom parseDates RegExp", () => {
			const iso = "2026-11-21T12:00:00.000Z";
			const input = JSON.stringify({
				customTimestamp: iso,
				expiresAt: iso,
			});

			const parsed = parseJSON<Record<string, unknown>>(input, {
				parseDates: /^customTimestamp$/,
			});

			expect(parsed.customTimestamp).toBeInstanceOf(Date);
			expect(parsed.expiresAt).toBe(iso);
			expect(typeof parsed.expiresAt).toBe("string");
		});

		it("supports custom parseDates predicate function", () => {
			const iso = "2026-11-21T12:00:00.000Z";
			const input = JSON.stringify({
				timestampA: iso,
				timestampB: iso,
			});

			const parsed = parseJSON<Record<string, unknown>>(input, {
				parseDates: (key) => key === "timestampA",
			});

			expect(parsed.timestampA).toBeInstanceOf(Date);
			expect(parsed.timestampB).toBe(iso);
			expect(typeof parsed.timestampB).toBe("string");
		});

		it("disables date parsing when parseDates is false", () => {
			const iso = "2026-11-28T00:00:00.000Z";
			const input = JSON.stringify({ expiresAt: iso });
			const parsed = parseJSON<{ expiresAt: string }>(input, {
				parseDates: false,
			});

			expect(parsed.expiresAt).toBe(iso);
			expect(typeof parsed.expiresAt).toBe("string");
		});
	});
});
