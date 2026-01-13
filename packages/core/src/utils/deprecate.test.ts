import { describe, expect, it, vi } from "vitest";
import { deprecate } from "./deprecate";

describe("deprecate", () => {
	it("should warn once when called multiple times", () => {
		const warn = vi.fn();
		const logger = { warn } as any;
		const fn = vi.fn();
		const deprecatedFn = deprecate(fn, "test message", logger);

		deprecatedFn();
		deprecatedFn();
		deprecatedFn();

		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn).toHaveBeenCalledWith("[Deprecation] test message");
		expect(fn).toHaveBeenCalledTimes(3);
	});

	it("should use provided logger if available", () => {
		const warn = vi.fn();
		const logger = { warn } as any;
		const fn = vi.fn();
		const deprecatedFn = deprecate(fn, "test message", logger);

		deprecatedFn();

		expect(warn).toHaveBeenCalledWith("[Deprecation] test message");
	});

	it("should fall back to console.warn if no logger provided", () => {
		const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const fn = vi.fn();
		const deprecatedFn = deprecate(fn, "test message");

		deprecatedFn();

		expect(consoleWarn).toHaveBeenCalledWith("[Deprecation] test message");
		consoleWarn.mockRestore();
	});

	it("should pass arguments and return value correctly", () => {
		const fn = vi.fn((a: number, b: number) => a + b);
		const deprecatedFn = deprecate(fn, "test message", {
			warn: vi.fn(),
		} as any);

		const result = deprecatedFn(1, 2);

		expect(result).toBe(3);
		expect(fn).toHaveBeenCalledWith(1, 2);
	});

	it("should preserve this context", () => {
		class TestClass {
			value = 10;
			method(a: number) {
				return this.value + a;
			}
		}

		const instance = new TestClass();
		const originalMethod = instance.method;
		instance.method = deprecate(originalMethod, "test message", {
			warn: vi.fn(),
		} as any);

		const result = instance.method(5);

		expect(result).toBe(15);
	});
});
