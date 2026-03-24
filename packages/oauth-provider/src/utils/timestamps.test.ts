import { describe, expect, it } from "vitest";

import { normalizeTimestampValue, resolveSessionAuthTime } from "./index";

describe("normalizeTimestampValue", () => {
	it("parses epoch-millis text values", () => {
		const result = normalizeTimestampValue("1774295570569.0");

		expect(result).toBeInstanceOf(Date);
		expect(result?.getTime()).toBe(1774295570569);
	});

	it("returns undefined for invalid values", () => {
		expect(normalizeTimestampValue("not-a-date")).toBeUndefined();
		expect(normalizeTimestampValue(Number.NaN)).toBeUndefined();
	});
});

describe("resolveSessionAuthTime", () => {
	it("reads createdAt from direct session objects", () => {
		const result = resolveSessionAuthTime({
			createdAt: "1774295570569.0",
		});

		expect(result?.getTime()).toBe(1774295570569);
	});

	it("reads created_at from nested session payloads", () => {
		const result = resolveSessionAuthTime({
			session: {
				created_at: 1774295570569,
			},
		});

		expect(result?.getTime()).toBe(1774295570569);
	});

	it("does not fall back to updatedAt timestamps", () => {
		const directResult = resolveSessionAuthTime({
			updatedAt: 1774295570569,
		});
		const nestedResult = resolveSessionAuthTime({
			session: {
				updated_at: "1774295570569.0",
			},
		});

		expect(directResult).toBeUndefined();
		expect(nestedResult).toBeUndefined();
	});
});
