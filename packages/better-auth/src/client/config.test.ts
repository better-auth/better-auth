import { afterEach, describe, expect, it, vi } from "vitest";
import { getClientConfig } from "./config";

describe("getClientConfig network errors", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	// @see https://github.com/better-auth/better-auth/issues/11284
	it("returns network failures as errors and invokes onError", async () => {
		const onError = vi.fn();
		const fetchImpl = vi
			.fn()
			.mockRejectedValue(new TypeError("Failed to fetch"));
		vi.stubGlobal("fetch", fetchImpl);

		const { $fetch } = getClientConfig({
			fetchOptions: { onError },
		});
		const result = await $fetch("/test");

		expect(result).toEqual({
			data: null,
			error: expect.objectContaining({
				status: 0,
			}),
		});
		expect(onError).toHaveBeenCalledWith(
			expect.objectContaining({
				error: expect.objectContaining({ status: 0 }),
			}),
		);
	});

	// @see https://github.com/better-auth/better-auth/issues/11284
	it("preserves AbortError rejections", async () => {
		const abortError = new Error("The operation was aborted");
		abortError.name = "AbortError";
		vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError));

		const { $fetch } = getClientConfig();

		await expect($fetch("/test")).rejects.toBe(abortError);
	});
});
