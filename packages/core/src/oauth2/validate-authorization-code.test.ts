import { describe, expect, it } from "vitest";
import { authorizationCodeRequest } from "./validate-authorization-code";

describe("authorizationCodeRequest", () => {
	it("sends caller headers next to client authentication", async () => {
		const { headers } = await authorizationCodeRequest({
			code: "auth-code",
			redirectURI: "https://rp.example.com/callback",
			options: { clientId: "test-client", clientSecret: "test-secret" },
			authentication: "basic",
			headers: { "X-Custom-Header": "test-value", Accept: "text/plain" },
		});

		expect(headers["x-custom-header"]).toBe("test-value");
		expect(headers.accept).toBe("text/plain");
		expect(headers.authorization).toMatch(/^Basic /);
	});

	it.each(["Authorization", "authorization", "AUTHORIZATION"])(
		"rejects a caller %s header",
		async (name) => {
			await expect(
				authorizationCodeRequest({
					code: "auth-code",
					redirectURI: "https://rp.example.com/callback",
					options: { clientId: "test-client" },
					tokenEndpointAuth: { method: "none" },
					headers: { [name]: "Bearer provider-token" },
				}),
			).rejects.toThrow('method: "custom"');
		},
	);

	it("lets a custom method set the authorization header", async () => {
		const { headers } = await authorizationCodeRequest({
			code: "auth-code",
			redirectURI: "https://rp.example.com/callback",
			options: { clientId: "test-client" },
			tokenEndpointAuth: {
				method: "custom",
				customizeRequest: ({ headers }) => {
					headers.authorization = "Provider custom-credential";
				},
			},
			headers: { "X-Custom-Header": "test-value" },
		});

		expect(headers.authorization).toBe("Provider custom-credential");
		expect(headers["x-custom-header"]).toBe("test-value");
	});
});
