import { describe, expect, it } from "vitest";
import { parseJSON } from "./parser";

describe("parseJSON", () => {
	it("should parse valid JSON", () => {
		const result = parseJSON<{ user: string }>('{"user":"test"}');
		expect(result).toEqual({ user: "test" });
	});

	it("should throw on truncated JSON in strict mode", () => {
		// Simulates a response body truncated at a chunk boundary (e.g. 16KB),
		// which produces incomplete JSON like: {"user":{"name":"te
		const truncatedJSON = '{"user":{"name":"te';

		expect(() => parseJSON(truncatedJSON, { strict: true })).toThrow();
	});

	it("should return raw string for truncated JSON in non-strict mode", () => {
		const truncatedJSON = '{"user":{"name":"te';

		// In non-strict mode, invalid JSON is silently returned as the raw string
		const result = parseJSON(truncatedJSON, { strict: false });
		expect(result).toBe(truncatedJSON);
	});

	it("should throw by default (strict defaults to true)", () => {
		const truncatedJSON = '{"data":"x","items":[{"id":1},{"id":2';

		expect(() => parseJSON(truncatedJSON)).toThrow();
	});

	it("should return non-JSON input as-is even in strict mode", () => {
		// HTML responses (e.g. error pages) should pass through without throwing
		const html = "<html><body>Error</body></html>";

		const result = parseJSON(html, { strict: true });
		expect(result).toBe(html);
	});

	it("should return plain text as-is even in strict mode", () => {
		const text = "Not Found";

		const result = parseJSON(text, { strict: true });
		expect(result).toBe(text);
	});
});
