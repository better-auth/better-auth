import { describe, expect, it } from "vitest";
import { chunkByMaxRows } from "./create-many-utils";

describe("chunkByMaxRows", () => {
	it("keeps a small batch in one chunk", () => {
		expect(chunkByMaxRows(["a", "b"], 10)).toEqual([["a", "b"]]);
	});

	it("splits rows into finite positive chunks", () => {
		expect(chunkByMaxRows(["a", "b", "c"], 2)).toEqual([["a", "b"], ["c"]]);
	});

	it("does not hang when the row cap is not a finite positive integer", () => {
		expect(chunkByMaxRows(["a", "b", "c"], Number.NaN)).toEqual([
			["a"],
			["b"],
			["c"],
		]);
		expect(chunkByMaxRows(["a", "b"], 0)).toEqual([["a"], ["b"]]);
		expect(chunkByMaxRows(["a", "b"], Number.NEGATIVE_INFINITY)).toEqual([
			["a"],
			["b"],
		]);
	});
});
