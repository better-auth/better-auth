import { describe, expect, it } from "vitest";
import { fromDriverDate, toDriverDate } from "./date-columns";

const date = new Date("2026-01-16T16:50:54.888Z");

describe("toDriverDate", () => {
	it("writes UTC text for Drizzle 0.x and 1.x string columns", () => {
		expect(toDriverDate(date, { dataType: "string" }, "pg")).toBe(
			"2026-01-16T16:50:54.888Z",
		);
		expect(toDriverDate(date, { dataType: "string timestamp" }, "pg")).toBe(
			"2026-01-16T16:50:54.888Z",
		);
		expect(toDriverDate(date, { dataType: "string datetime" }, "mysql")).toBe(
			"2026-01-16 16:50:54.888",
		);
	});

	it("converts each Date in an in / not_in list", () => {
		expect(
			toDriverDate([date, date], { dataType: "string" }, "sqlite"),
		).toEqual(["2026-01-16T16:50:54.888Z", "2026-01-16T16:50:54.888Z"]);
		expect(toDriverDate([date], { dataType: "date" }, "pg")).toEqual([date]);
	});

	it("leaves date-mode columns and non-Date values alone", () => {
		expect(toDriverDate(date, { dataType: "date" }, "pg")).toBe(date);
		expect(toDriverDate(date, { dataType: "object date" }, "pg")).toBe(date);
		expect(toDriverDate(date, undefined, "pg")).toBe(date);
		expect(toDriverDate("2026-01-16", { dataType: "string" }, "pg")).toBe(
			"2026-01-16",
		);
	});
});

describe("fromDriverDate", () => {
	it("reads a date-time without an offset as UTC", () => {
		expect(fromDriverDate("2026-01-16 16:50:54.888")).toEqual(date);
		expect(fromDriverDate("2026-01-16 16:50:54.888123")).toEqual(date);
		expect(fromDriverDate("2026-01-16T16:50:54.888")).toEqual(date);
	});

	it("keeps an explicit offset", () => {
		expect(fromDriverDate("2026-01-16 18:50:54.888+02")).toEqual(date);
		expect(fromDriverDate("2026-01-16T16:50:54.888Z")).toEqual(date);
	});

	it("passes dates, numbers and date-only strings to Date", () => {
		expect(fromDriverDate(date)).toEqual(date);
		expect(fromDriverDate(date.getTime())).toEqual(date);
		expect(fromDriverDate("2026-01-16")).toEqual(
			new Date("2026-01-16T00:00:00.000Z"),
		);
	});
});
