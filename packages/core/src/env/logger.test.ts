import { describe, expect, it } from "vitest";
import type { LogLevel } from "./logger";
import { shouldPublishLog } from "./logger";

describe("shouldPublishLog", () => {
	const testCases: {
		currentLogLevel: LogLevel;
		logLevel: LogLevel;
		expected: boolean;
	}[] = [
		{ currentLogLevel: "debug", logLevel: "debug", expected: true },
		{ currentLogLevel: "debug", logLevel: "info", expected: true },
		{ currentLogLevel: "debug", logLevel: "warn", expected: true },
		{ currentLogLevel: "debug", logLevel: "error", expected: true },
		{ currentLogLevel: "info", logLevel: "debug", expected: false },
		{ currentLogLevel: "info", logLevel: "info", expected: true },
		{ currentLogLevel: "info", logLevel: "warn", expected: true },
		{ currentLogLevel: "info", logLevel: "error", expected: true },
		{ currentLogLevel: "warn", logLevel: "debug", expected: false },
		{ currentLogLevel: "warn", logLevel: "info", expected: false },
		{ currentLogLevel: "warn", logLevel: "warn", expected: true },
		{ currentLogLevel: "warn", logLevel: "error", expected: true },
		{ currentLogLevel: "error", logLevel: "debug", expected: false },
		{ currentLogLevel: "error", logLevel: "info", expected: false },
		{ currentLogLevel: "error", logLevel: "warn", expected: false },
		{ currentLogLevel: "error", logLevel: "error", expected: true },
	];

	testCases.forEach(({ currentLogLevel, logLevel, expected }) => {
		it(`should return "${expected}" when currentLogLevel is "${currentLogLevel}" and logLevel is "${logLevel}"`, () => {
			expect(shouldPublishLog(currentLogLevel, logLevel)).toBe(expected);
		});
	});
});
