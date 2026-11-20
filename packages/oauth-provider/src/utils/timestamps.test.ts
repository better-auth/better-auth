import { describe, expect, it } from "vitest";

import {
	isRefreshParentActive,
	isSessionActive,
	normalizeTimestampValue,
	resolveSessionAuthTime,
} from "./index";

describe("normalizeTimestampValue", () => {
	it("parses epoch-millis text values", () => {
		const result = normalizeTimestampValue("1774295570569.0");

		expect(result).toBeInstanceOf(Date);
		expect(result?.getTime()).toBe(1774295570569);
	});

	it("returns undefined for invalid values", () => {
		expect(normalizeTimestampValue("not-a-date")).toBeUndefined();
		expect(normalizeTimestampValue(Number.NaN)).toBeUndefined();
		expect(normalizeTimestampValue(9e15)).toBeUndefined();
		expect(normalizeTimestampValue("9e15")).toBeUndefined();
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

	it("normalizes direct Date values", () => {
		const date = new Date(1774295570569);

		expect(resolveSessionAuthTime(date)?.getTime()).toBe(1774295570569);
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

describe("isSessionActive", () => {
	const now = new Date(1774295570569);

	it.each([-1, 0, 1])("checks expiration %i ms from now", (offset) => {
		const session = { expiresAt: new Date(now.getTime() + offset) };
		expect(isSessionActive(session, now)).toBe(offset > 0);
	});

	it("rejects a missing session", () => {
		expect(isSessionActive(null, now)).toBe(false);
	});
});

describe("isRefreshParentActive", () => {
	const now = new Date(1774295570569);

	it("accepts an active parent when issuance did not rotate it", () => {
		expect(
			isRefreshParentActive({ revoked: null, rotatedAt: null }, false),
		).toBe(true);
	});

	it("accepts a rotation that still has its rotation marker", () => {
		expect(isRefreshParentActive({ revoked: now, rotatedAt: now }, true)).toBe(
			true,
		);
	});

	it.each([false, true])(
		"rejects a revoked or missing parent when rotation is %s",
		(rotated) => {
			expect(
				isRefreshParentActive({ revoked: now, rotatedAt: null }, rotated),
			).toBe(false);
			expect(isRefreshParentActive(null, rotated)).toBe(false);
		},
	);
});
