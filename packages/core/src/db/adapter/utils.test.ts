import { describe, expect, it } from "vitest";
import { parseDateValue } from "./utils";

describe("parseDateValue", () => {
	it("returns a Date instance unchanged", () => {
		const date = new Date("2026-01-01T00:00:00.000Z");
		expect(parseDateValue(date)).toBe(date);
	});

	it("parses a number as epoch milliseconds", () => {
		const result = parseDateValue(1774295570569);
		expect(result).toBeInstanceOf(Date);
		expect((result as Date).getTime()).toBe(1774295570569);
	});

	it("parses an ISO date string", () => {
		const iso = "2026-01-01T00:00:00.000Z";
		const result = parseDateValue(iso);
		expect(result).toBeInstanceOf(Date);
		expect((result as Date).toISOString()).toBe(iso);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9963
	 */
	it("parses a numeric-millisecond string as epoch milliseconds instead of Invalid Date", () => {
		const result = parseDateValue("1774295570569");
		expect(result).toBeInstanceOf(Date);
		expect(Number.isNaN((result as Date).getTime())).toBe(false);
		expect((result as Date).getTime()).toBe(1774295570569);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9963
	 */
	it("parses a numeric-millisecond string with a trailing fractional part", () => {
		const result = parseDateValue("1774295570569.0");
		expect(result).toBeInstanceOf(Date);
		expect(Number.isNaN((result as Date).getTime())).toBe(false);
		expect((result as Date).getTime()).toBe(1774295570569);
	});

	it("passes null and undefined through unchanged", () => {
		expect(parseDateValue(null)).toBeNull();
		expect(parseDateValue(undefined)).toBeUndefined();
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9963
	 */
	it("parses a short numeric string like a year, not epoch milliseconds", () => {
		const result = parseDateValue("2026");
		expect(result).toBeInstanceOf(Date);
		expect((result as Date).getUTCFullYear()).toBe(2026);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9963
	 */
	it('parses "0" as the string date "0", not epoch millisecond 0', () => {
		const result = parseDateValue("0");
		expect(result).toBeInstanceOf(Date);
		expect((result as Date).getTime()).toBe(new Date("0").getTime());
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9963
	 */
	it("still parses a real 13-digit epoch-millisecond string as epoch milliseconds", () => {
		const result = parseDateValue("1774295570569");
		expect(result).toBeInstanceOf(Date);
		expect((result as Date).getTime()).toBe(1774295570569);
	});
});
