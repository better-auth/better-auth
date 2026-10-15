import { describe, expect, it } from "vitest";
import { fromDriverDate, toDriverDate } from "./date-columns";

// The e2e suites cover ISO writes and reads on PostgreSQL and SQLite; these
// cover the inputs they can't reach.
const date = new Date("2026-01-16T16:50:54.888Z");

describe("toDriverDate", () => {
	it("recognizes Drizzle 1.x string data types", () => {
		expect(toDriverDate(date, { dataType: "string timestamp" }, "pg")).toBe(
			"2026-01-16T16:50:54.888Z",
		);
	});

	it("writes the MySQL date-time format", () => {
		expect(toDriverDate(date, { dataType: "string datetime" }, "mysql")).toBe(
			"2026-01-16 16:50:54.888",
		);
	});

	it("converts each Date in an in / not_in list", () => {
		expect(
			toDriverDate([date, date], { dataType: "string" }, "sqlite"),
		).toEqual(["2026-01-16T16:50:54.888Z", "2026-01-16T16:50:54.888Z"]);
	});
});

describe("fromDriverDate", () => {
	it("reads microseconds and a T separator without an offset as UTC", () => {
		expect(fromDriverDate("2026-01-16 16:50:54.888123")).toEqual(date);
		expect(fromDriverDate("2026-01-16T16:50:54.888")).toEqual(date);
	});

	it("keeps an explicit offset", () => {
		expect(fromDriverDate("2026-01-16 18:50:54.888+02")).toEqual(date);
	});

	it("passes numbers and date-only strings to Date", () => {
		expect(fromDriverDate(date.getTime())).toEqual(date);
		expect(fromDriverDate("2026-01-16")).toEqual(
			new Date("2026-01-16T00:00:00.000Z"),
		);
	});
});
