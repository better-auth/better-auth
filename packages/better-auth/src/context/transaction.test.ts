import { describe, expect, test, vi } from "vitest";

describe("transaction context", () => {
	test("disabled async storage should trigger warning", async () => {
		vi.mock("node:async_hooks", () => {
			throw new Error("AsyncLocalStorage is not available");
		});
		const errorLog = vi.fn();
		vi.spyOn(console, "warn").mockImplementation(errorLog);
		const { getCurrentAdapter } = await import("./transaction");
		await getCurrentAdapter(null!);
		expect(errorLog).toHaveBeenCalled();
		vi.restoreAllMocks();
	});
});
