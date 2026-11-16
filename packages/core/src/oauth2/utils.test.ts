import { describe, expect, it } from "vitest";
import { parseStringBoolean } from "./utils";

describe("parseStringBoolean", () => {
	it("reads booleans and their exact string forms", () => {
		expect(parseStringBoolean(true)).toBe(true);
		expect(parseStringBoolean("true")).toBe(true);
		expect(parseStringBoolean(false)).toBe(false);
		expect(parseStringBoolean("false")).toBe(false);
	});

	it("returns undefined for every other value", () => {
		for (const value of [
			"False",
			"TRUE",
			"0",
			"1",
			0,
			1,
			"",
			" ",
			undefined,
			null,
			{},
			[],
			["true"],
		]) {
			expect(parseStringBoolean(value)).toBeUndefined();
		}
	});
});
