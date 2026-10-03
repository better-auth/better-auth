import { describe, expect, it } from "vitest";
import { getEndpointUrl } from "./dpop";

describe("getEndpointUrl", () => {
	it("appends the fallback endpoint under a trailing-slash base URL", () => {
		const ctx = {
			context: { baseURL: "https://auth.example.com/api/auth/" },
		} as Parameters<typeof getEndpointUrl>[0];

		expect(getEndpointUrl(ctx, "/oauth2/token")).toBe(
			"https://auth.example.com/api/auth/oauth2/token",
		);
	});

	it("keeps the actual request URL when present", () => {
		const ctx = {
			context: { baseURL: "https://auth.example.com/api/auth/" },
			request: new Request("https://proxy.example.com/token"),
		} as Parameters<typeof getEndpointUrl>[0];

		expect(getEndpointUrl(ctx, "/oauth2/token")).toBe(
			"https://proxy.example.com/token",
		);
	});
});
