import { atom } from "nanostores";
import { describe, expect, it, vi } from "vitest";
import { isJsonEqual, withEquality } from "./equality";

describe("isJsonEqual", () => {
	it("returns true for identical primitives", () => {
		expect(isJsonEqual(1, 1)).toBe(true);
		expect(isJsonEqual("a", "a")).toBe(true);
		expect(isJsonEqual(true, true)).toBe(true);
		expect(isJsonEqual(null, null)).toBe(true);
	});

	it("returns false for different primitives", () => {
		expect(isJsonEqual(1, 2)).toBe(false);
		expect(isJsonEqual("a", "b")).toBe(false);
		expect(isJsonEqual(true, false)).toBe(false);
		expect(isJsonEqual(null, 1)).toBe(false);
		expect(isJsonEqual(null, "a")).toBe(false);
	});

	it("returns true for same-reference objects", () => {
		const obj = { a: 1 };
		expect(isJsonEqual(obj, obj)).toBe(true);
	});

	it("returns true for structurally equal objects", () => {
		expect(isJsonEqual({ a: 1, b: "x" }, { a: 1, b: "x" })).toBe(true);
	});

	it("returns true for nested objects", () => {
		expect(
			isJsonEqual(
				{ user: { id: "1", email: "a@b.com" }, session: { id: "s1" } },
				{ user: { id: "1", email: "a@b.com" }, session: { id: "s1" } },
			),
		).toBe(true);
	});

	it("returns false for objects with different values", () => {
		expect(isJsonEqual({ a: 1 }, { a: 2 })).toBe(false);
	});

	it("returns false for objects with different keys", () => {
		expect(isJsonEqual({ a: 1 }, { b: 1 })).toBe(false);
		expect(isJsonEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
	});

	it("returns true for identical arrays", () => {
		expect(isJsonEqual([1, 2, 3], [1, 2, 3])).toBe(true);
	});

	it("returns false for arrays of different length", () => {
		expect(isJsonEqual([1, 2], [1, 2, 3])).toBe(false);
	});

	it("returns false for arrays with different elements", () => {
		expect(isJsonEqual([1, 2, 3], [1, 2, 4])).toBe(false);
	});

	it("returns true for deeply nested structures", () => {
		expect(
			isJsonEqual(
				{ a: [{ b: [1, 2] }, { c: null }] },
				{ a: [{ b: [1, 2] }, { c: null }] },
			),
		).toBe(true);
	});

	it("returns false for null vs object", () => {
		expect(isJsonEqual(null, {})).toBe(false);
		expect(isJsonEqual({}, null)).toBe(false);
	});

	it("returns false for array vs object", () => {
		expect(isJsonEqual([], {})).toBe(false);
	});

	it("returns true for dates with the same instant", () => {
		expect(
			isJsonEqual(
				new Date("2026-01-01T00:00:00.000Z"),
				new Date("2026-01-01T00:00:00.000Z"),
			),
		).toBe(true);
	});

	it("returns false for dates with different instants", () => {
		expect(
			isJsonEqual(
				new Date("2026-01-01T00:00:00.000Z"),
				new Date("2026-01-02T00:00:00.000Z"),
			),
		).toBe(false);
	});

	it("returns true for session-shaped data holding equal dates", () => {
		// The client parser revives ISO strings into `Date` instances, so the
		// session payload compared by the equality gate always contains dates.
		// Without date support every refetch looks like a change and the gate
		// never aborts, defeating the re-render suppression it exists for.
		const build = () => ({
			user: { id: "1", createdAt: new Date("2026-01-01T00:00:00.000Z") },
			session: { id: "s1", expiresAt: new Date("2026-01-08T00:00:00.000Z") },
		});
		expect(isJsonEqual(build(), build())).toBe(true);
	});

	it("does not treat a date as equal to a non-date", () => {
		const date = new Date("2026-01-01T00:00:00.000Z");
		expect(isJsonEqual(date, "2026-01-01T00:00:00.000Z")).toBe(false);
		expect(isJsonEqual(date, {})).toBe(false);
	});

	it("returns true for two invalid dates", () => {
		expect(isJsonEqual(new Date("nope"), new Date("also nope"))).toBe(true);
	});

	it("compares dates nested in arrays", () => {
		expect(
			isJsonEqual(
				[new Date("2026-01-01T00:00:00.000Z")],
				[new Date("2026-01-01T00:00:00.000Z")],
			),
		).toBe(true);
	});
});

describe("withEquality", () => {
	it("suppresses set when values are structurally equal", () => {
		const store = atom({ a: 1, b: "x" });
		withEquality(store, isJsonEqual);

		const listener = vi.fn();
		store.listen(listener);

		store.set({ a: 1, b: "x" });
		expect(listener).not.toHaveBeenCalled();
	});

	it("allows set when values differ", () => {
		const store = atom({ a: 1 });
		withEquality(store, isJsonEqual);

		const listener = vi.fn();
		store.listen(listener);

		store.set({ a: 2 });
		expect(listener).toHaveBeenCalledOnce();
		expect(store.get()).toEqual({ a: 2 });
	});

	it("returns an unsubscribe function that removes the gate", () => {
		const store = atom({ a: 1 });
		const unbind = withEquality(store, isJsonEqual);

		const listener = vi.fn();
		store.listen(listener);

		store.set({ a: 1 });
		expect(listener).not.toHaveBeenCalled();

		unbind();

		store.set({ a: 1 });
		expect(listener).toHaveBeenCalledOnce();
	});

	it("works with nested session-like data", () => {
		const store = atom({
			data: { user: { id: "1" }, session: { id: "s1" } },
			error: null,
		});
		withEquality(store, isJsonEqual);

		const listener = vi.fn();
		store.listen(listener);

		store.set({
			data: { user: { id: "1" }, session: { id: "s1" } },
			error: null,
		});
		expect(listener).not.toHaveBeenCalled();

		store.set({
			data: { user: { id: "2" }, session: { id: "s1" } },
			error: null,
		});
		expect(listener).toHaveBeenCalledOnce();
	});
});
