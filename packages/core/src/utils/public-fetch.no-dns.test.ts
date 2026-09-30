import { describe, expect, it, vi } from "vitest";

vi.mock("node:dns/promises", () => {
	throw new Error("DNS module unavailable");
});

import { fetchPublicResponse } from "./public-fetch";

/** @see https://developers.cloudflare.com/workers/runtime-apis/nodejs/dns/ */
describe("public-host validation without DNS APIs", () => {
	it("refuses unresolved hostnames without attempting HTTP transport", async () => {
		const transport = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(new Response("ok"));
		try {
			await expect(
				fetchPublicResponse(
					"https://idp.example",
					{},
					{ isTrustedOrigin: () => false },
				),
			).rejects.toMatchObject({ code: "ssrf_dns_lookup_failed" });
			expect(transport).not.toHaveBeenCalled();
		} finally {
			transport.mockRestore();
		}
	});
});
