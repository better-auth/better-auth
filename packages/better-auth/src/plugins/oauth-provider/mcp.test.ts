import { describe, it, expect } from "vitest";
import { mcpHandler } from "./mcp";
import { createAuthClient } from "../../client";
import { oauthProviderClient } from "./client";
import type { APIError } from "better-call";

describe("mcp", async () => {
	const authServerUrl = `http://localhost:3000`;
	const apiServerBaseUrl = "http://localhost:5000";

	const apiClient = createAuthClient({
		plugins: [oauthProviderClient()],
		baseURL: apiServerBaseUrl,
	});

	it.each([
		{
			resource: apiServerBaseUrl,
			expected: `Bearer resource_metadata="${apiServerBaseUrl}/.well-known/oauth-protected-resource"`,
		},
		{
			resource: `${apiServerBaseUrl}/resource1`,
			expected: `Bearer resource_metadata="${apiServerBaseUrl}/.well-known/oauth-protected-resource/resource1"`,
		},
		{
			resource: [apiServerBaseUrl, `${apiServerBaseUrl}/resource1`],
			expected: `Bearer resource_metadata="${apiServerBaseUrl}/.well-known/oauth-protected-resource", Bearer resource_metadata="${apiServerBaseUrl}/.well-known/oauth-protected-resource/resource1"`,
		},
	])(
		"should provide the correct metadata using resource: $resource",
		async ({ resource, expected }) => {
			try {
				await apiClient.verifyAccessToken("bad_access_token", {
					verifyOptions: {
						issuer: authServerUrl,
						audience: resource,
					},
				});
				expect.unreachable();
			} catch (error) {
				const err = error as APIError;
				expect(err?.statusCode).toBe(401);
				expect(new Headers(err.headers)?.get("WWW-Authenticate")).toBe(
					expected,
				);
			}

			const response = await mcpHandler(
				{
					verifyOptions: {
						issuer: authServerUrl,
						audience: resource,
					},
				},
				async () => {
					return new Response("unused");
				},
			)(new Request(`${authServerUrl}/mcp`));
			expect(response?.status).toBe(401);
			expect(response?.headers.get("WWW-Authenticate")).toBe(expected);
		},
	);
});
