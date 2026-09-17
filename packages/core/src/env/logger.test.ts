import { describe, expect, it, onTestFinished, vi } from "vitest";
import type { AuthEndpointContext } from "../context";
import { runWithEndpointContext } from "../context";
import { safeJSONParse } from "../utils/json";
import type { InternalLogger, LogLevel } from "./logger";
import { createLogger, logger, shouldPublishLog } from "./logger";

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

describe("logger", () => {
	const endpointContext = (logger: InternalLogger) =>
		({ context: { logger } }) as unknown as AuthEndpointContext;

	it("uses the default logger outside an auth context", () => {
		const defaultWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
		onTestFinished(() => defaultWarn.mockRestore());

		logger.warn("default warning");

		expect(defaultWarn).toHaveBeenCalledTimes(1);
	});

	it("delegates to the logger in the current auth context", async () => {
		const defaultWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
		onTestFinished(() => defaultWarn.mockRestore());
		const firstLog = vi.fn();
		const secondLog = vi.fn();
		const firstLogger = createLogger({ level: "info", log: firstLog });
		const secondLogger = createLogger({ level: "error", log: secondLog });

		await Promise.all([
			runWithEndpointContext(endpointContext(firstLogger), async () => {
				await Promise.resolve();
				expect(logger.level).toBe("info");
				logger.warn("first warning");
			}),
			runWithEndpointContext(endpointContext(secondLogger), async () => {
				await Promise.resolve();
				expect(logger.level).toBe("error");
				logger.warn("second warning");
			}),
		]);

		expect(firstLog).toHaveBeenCalledWith("warn", "first warning");
		expect(secondLog).not.toHaveBeenCalled();
		expect(defaultWarn).not.toHaveBeenCalled();
	});

	it("routes utility logs through the current auth context", async () => {
		const defaultError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		onTestFinished(() => defaultError.mockRestore());
		const log = vi.fn();
		const configuredLogger = createLogger({ log });

		await runWithEndpointContext(endpointContext(configuredLogger), () => {
			expect(safeJSONParse("{")).toBeNull();
		});

		expect(log).toHaveBeenCalledWith(
			"error",
			"Error parsing JSON",
			expect.objectContaining({ error: expect.any(SyntaxError) }),
		);
		expect(defaultError).not.toHaveBeenCalled();
	});

	it("honors disabled logging in the current auth context", async () => {
		const defaultWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
		onTestFinished(() => defaultWarn.mockRestore());
		const log = vi.fn();
		const configuredLogger = createLogger({ disabled: true, log });

		await runWithEndpointContext(endpointContext(configuredLogger), () => {
			logger.warn("hidden warning");
		});

		expect(log).not.toHaveBeenCalled();
		expect(defaultWarn).not.toHaveBeenCalled();
	});
});
