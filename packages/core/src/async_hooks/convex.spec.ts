import { expect, test, vi } from "vitest";

vi.mock(import("node:async_hooks"), () => {
	throw new Error("Doesn't work with convex");
});

test("should work with convex", async () => {
	vi.stubEnv("CONVEX_CLOUD_URL", "https://convex.com");
	vi.stubEnv("CONVEX_SITE_URL", "http://test.com");
	const { getAsyncLocalStorage } = await import(".");
	await expect(getAsyncLocalStorage()).to.resolves.toBeDefined();
});
