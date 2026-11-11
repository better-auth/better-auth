import { describe, expect, it } from "vitest";
import { authorizationCodeRequest } from "./validate-authorization-code";

describe("authorizationCodeRequest", () => {
	it("sends caller headers and keeps client authentication on top", async () => {
		const { headers } = await authorizationCodeRequest({
			code: "auth-code",
			redirectURI: "https://rp.example.com/callback",
			options: { clientId: "test-client", clientSecret: "test-secret" },
			authentication: "basic",
			headers: { "X-Custom-Header": "test-value", Authorization: "spoofed" },
		});

		expect(headers["x-custom-header"]).toBe("test-value");
		expect(headers.authorization).toMatch(/^Basic /);
		expect(new Headers(headers).get("authorization")).toBe(
			headers.authorization,
		);
	});

	it("lets a custom auth hook replace a caller header in any casing", async () => {
		const { headers } = await authorizationCodeRequest({
			code: "auth-code",
			redirectURI: "https://rp.example.com/callback",
			options: { clientId: "test-client" },
			headers: { Authorization: "Bearer caller" },
			tokenEndpointAuth: {
				method: "custom",
				customizeRequest: ({ headers }) => {
					expect(headers.hasOwnProperty("Authorization")).toBe(true);
					expect(headers.Authorization).toBe("Bearer caller");
					headers.Authorization = "first";
					headers.authorization = "Custom hook";
				},
			},
		});

		expect(new Headers(headers).get("authorization")).toBe("Custom hook");
	});
});
