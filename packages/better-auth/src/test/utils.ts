import { vi, beforeEach } from "vitest";
import type { InternalLogger, LogLevel } from "../utils";

export let mockLoggerLevel: LogLevel = "debug";
export const mockLogger = {
	error: vi.fn(),
	warn: vi.fn(),
	info: vi.fn(),
	debug: vi.fn(),
	success: vi.fn(),
	get level(): LogLevel {
		return mockLoggerLevel;
	},
} satisfies InternalLogger;

beforeEach(() => {
	mockLoggerLevel = "debug";
	mockLogger.error.mockReset();
	mockLogger.warn.mockReset();
	mockLogger.info.mockReset();
	mockLogger.debug.mockReset();
	mockLogger.success.mockReset();
});
