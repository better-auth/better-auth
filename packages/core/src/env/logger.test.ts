import { describe, it, expect } from "vitest";
import { shouldPublishLog, type LogLevel } from "./logger";

describe("shouldPublishLog", () => {
	const testCases: {
		currentLogLevel: LogLevel;
		logLevel: LogLevel;
		expected: boolean;
	}[] = [
		{ currentLogLevel: "info", logLevel: "info", expected: true },
		{ currentLogLevel: "info", logLevel: "warn", expected: false },
		{ currentLogLevel: "info", logLevel: "error", expected: false },
		{ currentLogLevel: "info", logLevel: "debug", expected: false },
		{ currentLogLevel: "warn", logLevel: "info", expected: true },
		{ currentLogLevel: "warn", logLevel: "warn", expected: true },
		{ currentLogLevel: "warn", logLevel: "error", expected: false },
		{ currentLogLevel: "warn", logLevel: "debug", expected: false },
		{ currentLogLevel: "error", logLevel: "info", expected: true },
		{ currentLogLevel: "error", logLevel: "warn", expected: true },
		{ currentLogLevel: "error", logLevel: "error", expected: true },
		{ currentLogLevel: "error", logLevel: "debug", expected: false },
		{ currentLogLevel: "debug", logLevel: "info", expected: true },
		{ currentLogLevel: "debug", logLevel: "warn", expected: true },
		{ currentLogLevel: "debug", logLevel: "error", expected: true },
		{ currentLogLevel: "debug", logLevel: "debug", expected: true },
	];

	testCases.forEach(({ currentLogLevel, logLevel, expected }) => {
		it(`should return "${expected}" when currentLogLevel is "${currentLogLevel}" and logLevel is "${logLevel}"`, () => {
			expect(shouldPublishLog(currentLogLevel, logLevel)).toBe(expected);
		});
	});
});
