import { defineConfig } from "vitest/config";

export default defineConfig({
	// Longer than the worker's SETTLE_BUDGET_MS, so a route reports "hung"
	// before the test times out.
	test: { testTimeout: 10_000 },
});
