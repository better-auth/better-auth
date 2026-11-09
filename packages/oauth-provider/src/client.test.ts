import { getTestInstance } from "better-auth/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { oauthProviderClient } from "./client";

describe("oauthProviderClient", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/12072
	 */
	it("sends the body unchanged from a page with an unsigned query", async () => {
		const { client } = await getTestInstance(
			{},
			{
				clientOptions: {
					plugins: [oauthProviderClient()],
				},
			},
		);
		vi.stubGlobal("window", {
			location: {
				search: "?tab=profile",
			},
		});
		const customFetchImpl = vi.fn(async () => Response.json({}));
		const body = { at: "2026-10-27T10:00:00.123456Z" };

		await client.$fetch("/custom", {
			method: "POST",
			body,
			customFetchImpl,
		});

		expect(customFetchImpl).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ body: JSON.stringify(body) }),
		);
	});
});
