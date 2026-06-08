/**
 * @see https://github.com/better-auth/better-auth/issues/9920
 */
// cspell:ignore Kolkata
import { execSync } from "node:child_process";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

const tsxCliPath = path.resolve(
	import.meta.dirname,
	"../../../../packages/cli/node_modules/tsx/dist/cli.mjs",
);
const helperPath = path.join(
	import.meta.dirname,
	"fixtures/timezone-helper.ts",
);

function runHelper(tz: string, mode: string): any {
	const cmd = `TZ=${tz} TEST_MODE=${mode} node ${tsxCliPath} ${helperPath}`;
	const output = execSync(cmd, { encoding: "utf8" });
	return JSON.parse(output.trim());
}

describe("PostgreSQL Timezone Behavior & Schema Type Verification", () => {
	const originalInstant = 1780920000000; // 2026-06-08T12:00:00.000Z

	it("1. Schema Type Verification: database columns must match expected PostgreSQL types", async () => {
		// Setup the tables
		runHelper("UTC", "setup");

		// Query columns info
		const columns = runHelper("UTC", "verify_types") as Array<{
			table_name: string;
			column_name: string;
			data_type: string;
		}>;

		console.log("Verified database column types:", columns);

		const naiveCol = columns.find((c) => c.table_name === "naive_ts");
		const tzCol = columns.find((c) => c.table_name === "tz_ts");

		expect(naiveCol).toBeDefined();
		expect(naiveCol!.data_type).toBe("timestamp without time zone");

		expect(tzCol).toBeDefined();
		expect(tzCol!.data_type).toBe("timestamp with time zone");
	});

	it("2. Before/After Reproduction Validation & Cross-Timezone Roundtrip (Write: America/New_York -> Read: UTC)", async () => {
		// Setup tables
		runHelper("UTC", "setup");

		// Write under New York timezone
		runHelper("America/New_York", "write");

		// Read under UTC timezone
		const readResult = runHelper("UTC", "read");

		console.log("Roundtrip (NY -> UTC) Results:", readResult);

		// A) Current behavior: timestamp without time zone drifts
		// America/New_York (UTC-4) writes 12:00:00 UTC as "08:00:00" local wall-clock time.
		// UTC process reads "08:00:00" and parses it as UTC time, which is 08:00:00 UTC (shifted by -4 hours).
		expect(readResult.unixTimestamp.naive).not.toBe(originalInstant);
		expect(readResult.unixTimestamp.naive).toBe(
			originalInstant - 4 * 60 * 60 * 1000,
		); // exactly 4 hours early

		// B) Fixed behavior: timestamp with time zone (timestamptz) preserves the same instant
		expect(readResult.unixTimestamp.tz).toBe(originalInstant);
	});

	it("3. Cross-Timezone Roundtrip (Write: UTC -> Read: Asia/Kolkata)", async () => {
		// Setup tables
		runHelper("UTC", "setup");

		// Write under UTC timezone
		runHelper("UTC", "write");

		// Read under Kolkata timezone
		const readResult = runHelper("Asia/Kolkata", "read");

		console.log("Roundtrip (UTC -> Kolkata) Results:", readResult);

		// naive (timestamp without time zone) shifts
		// UTC writes 12:00:00 UTC as "12:00:00" wall-clock time.
		// Asia/Kolkata (UTC+5:30) reads "12:00:00" and parses it as Kolkata local time, which is 06:30:00 UTC (shifted by -5.5 hours).
		expect(readResult.unixTimestamp.naive).not.toBe(originalInstant);
		expect(readResult.unixTimestamp.naive).toBe(
			originalInstant - 5.5 * 60 * 60 * 1000,
		); // exactly 5.5 hours early

		// timestamptz (timestamp with time zone) preserves the instant perfectly
		expect(readResult.unixTimestamp.tz).toBe(originalInstant);
	});
});
