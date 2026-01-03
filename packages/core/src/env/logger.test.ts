import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LogLevel } from "./logger";
import { createLogger, getLogLevelFromEnv, shouldPublishLog } from "./logger";

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

describe("getLogLevelFromEnv", () => {
	const originalEnv = process.env;

	beforeEach(() => {
		vi.resetModules();
		process.env = { ...originalEnv };
		process.env.BETTER_AUTH_LOG_LEVEL = undefined;
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	it("should return undefined when BETTER_AUTH_LOG_LEVEL is not set", () => {
		expect(getLogLevelFromEnv()).toBeUndefined();
	});

	it("should return undefined when BETTER_AUTH_LOG_LEVEL is empty string", () => {
		process.env.BETTER_AUTH_LOG_LEVEL = "";
		expect(getLogLevelFromEnv()).toBeUndefined();
	});

	it('should return "debug" when BETTER_AUTH_LOG_LEVEL is "debug"', () => {
		process.env.BETTER_AUTH_LOG_LEVEL = "debug";
		expect(getLogLevelFromEnv()).toBe("debug");
	});

	it('should return "info" when BETTER_AUTH_LOG_LEVEL is "info"', () => {
		process.env.BETTER_AUTH_LOG_LEVEL = "info";
		expect(getLogLevelFromEnv()).toBe("info");
	});

	it('should return "warn" when BETTER_AUTH_LOG_LEVEL is "warn"', () => {
		process.env.BETTER_AUTH_LOG_LEVEL = "warn";
		expect(getLogLevelFromEnv()).toBe("warn");
	});

	it('should return "error" when BETTER_AUTH_LOG_LEVEL is "error"', () => {
		process.env.BETTER_AUTH_LOG_LEVEL = "error";
		expect(getLogLevelFromEnv()).toBe("error");
	});

	it("should handle uppercase values (case-insensitive)", () => {
		process.env.BETTER_AUTH_LOG_LEVEL = "DEBUG";
		expect(getLogLevelFromEnv()).toBe("debug");
	});

	it("should handle mixed case values (case-insensitive)", () => {
		process.env.BETTER_AUTH_LOG_LEVEL = "WaRn";
		expect(getLogLevelFromEnv()).toBe("warn");
	});

	it("should return undefined for invalid log level", () => {
		process.env.BETTER_AUTH_LOG_LEVEL = "invalid";
		expect(getLogLevelFromEnv()).toBeUndefined();
	});

	it("should return undefined for 'success' (not a valid env config level)", () => {
		process.env.BETTER_AUTH_LOG_LEVEL = "success";
		expect(getLogLevelFromEnv()).toBeUndefined();
	});
});

describe("createLogger with env var", () => {
	const originalEnv = process.env;

	beforeEach(() => {
		vi.resetModules();
		process.env = { ...originalEnv };
		process.env.BETTER_AUTH_LOG_LEVEL = undefined;
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	it('should default to "error" level when no options and no env var', () => {
		const logger = createLogger();
		expect(logger.level).toBe("error");
	});

	it("should use env var level when no options.level is provided", () => {
		process.env.BETTER_AUTH_LOG_LEVEL = "debug";
		const logger = createLogger();
		expect(logger.level).toBe("debug");
	});

	it("should prefer explicit options.level over env var", () => {
		process.env.BETTER_AUTH_LOG_LEVEL = "debug";
		const logger = createLogger({ level: "warn" });
		expect(logger.level).toBe("warn");
	});

	it("should fallback to error when env var is invalid", () => {
		process.env.BETTER_AUTH_LOG_LEVEL = "invalid";
		const logger = createLogger();
		expect(logger.level).toBe("error");
	});

	it("should use env var when options is provided but level is undefined", () => {
		process.env.BETTER_AUTH_LOG_LEVEL = "info";
		const logger = createLogger({ disabled: false });
		expect(logger.level).toBe("info");
	});
});
