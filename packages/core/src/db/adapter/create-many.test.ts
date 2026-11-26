import { describe, expect, it } from "vitest";
import {
	chunkByMaxRows,
	finitePositiveInt,
	orderRowsByIds,
	rowsShareKeys,
} from "./create-many";

describe("createMany helpers", () => {
	it("treats non-finite numbers as missing limits", () => {
		expect(finitePositiveInt(undefined)).toBeUndefined();
		expect(finitePositiveInt(Number.NaN)).toBeUndefined();
		expect(finitePositiveInt(0)).toBeUndefined();
		expect(finitePositiveInt(3.9)).toBe(3);
	});

	it("detects mixed-key batches", () => {
		expect(rowsShareKeys([{ id: "a" }, { id: "b" }])).toBe(true);
		expect(rowsShareKeys([{ id: "a", name: "Ada" }, { id: "b" }])).toBe(false);
	});

	it("does not hang when the row cap is not a finite positive integer", () => {
		expect(chunkByMaxRows(["a", "b", "c"], Number.NaN)).toEqual([
			["a"],
			["b"],
			["c"],
		]);
		expect(chunkByMaxRows(["a", "b", "c"], 2)).toEqual([["a", "b"], ["c"]]);
	});

	it("restores unordered read-back by exact id", () => {
		expect(
			orderRowsByIds(
				["a", "b"],
				[
					{ id: "b", name: "Bob" },
					{ id: "a", name: "Ada" },
				],
				"id",
				"user",
			).map((row) => row.name),
		).toEqual(["Ada", "Bob"]);
	});

	it("matches UUID ids case-insensitively when the mapping is unique", () => {
		const adaId = "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA";
		const bobId = "BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB";
		expect(
			orderRowsByIds(
				[adaId, bobId],
				[
					{ id: bobId.toLowerCase(), name: "Bob" },
					{ id: adaId.toLowerCase(), name: "Ada" },
				],
				"id",
				"user",
			).map((row) => row.name),
		).toEqual(["Ada", "Bob"]);
	});

	it("keeps case-distinct UUID-shaped text ids", () => {
		const upperId = "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA";
		const lowerId = upperId.toLowerCase();
		expect(
			orderRowsByIds(
				[upperId, lowerId],
				[
					{ id: lowerId, name: "Lower" },
					{ id: upperId, name: "Upper" },
				],
				"id",
				"user",
			).map((row) => row.name),
		).toEqual(["Upper", "Lower"]);
	});
});
