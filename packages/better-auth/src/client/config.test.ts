import { afterEach, describe, expect, it, vi } from "vitest";
import { getClientConfig } from "./config";

describe("getClientConfig network errors", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

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
});
