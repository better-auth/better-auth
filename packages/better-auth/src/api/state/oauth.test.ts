import { afterEach, describe, expect, it, vi } from "vitest";

describe("oauth request state", () => {
	afterEach(() => {
		vi.resetModules();
		vi.doUnmock("@better-auth/core/context");
	});

	it("does not initialize request state during module evaluation", async () => {
		vi.doMock("@better-auth/core/context", async (importOriginal) => ({
			...(await importOriginal<typeof import("@better-auth/core/context")>()),
			defineRequestState: vi.fn(() => {
				throw new Error("request state initialized eagerly");
			}),
		}));

		await expect(import("./oauth")).resolves.toBeDefined();
	});
});
