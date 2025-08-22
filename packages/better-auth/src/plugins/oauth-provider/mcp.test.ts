import { beforeAll, describe, it, expect } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { oauthProvider } from "./oauth";
import { jwt } from "../jwt";
import type { OAuthClient } from "../../oauth-2.1/types";
import { mcpHandler } from "./mcp";

describe("mcp", async () => {
	const authServerUrl = `http://localhost:3000`;
	const apiServerBaseUrl = "http://localhost:5000";
	const providerId = "test";
	const redirectUri = `${apiServerBaseUrl}/api/auth/oauth2/callback/${providerId}`;

	const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance({
		baseURL: authServerUrl,
		plugins: [
			jwt(),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				silenceWarnings: {
					oauthAuthServerConfig: true,
					openidConfig: true,
				},
			}),
		],
	});

	const { headers } = await signInWithTestUser();

	let oauthClient: OAuthClient | null;

	beforeAll(async () => {
		const response = await auth.api.registerOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				skip_consent: true,
			},
		});
		expect(response?.client_id).toBeDefined();
		expect(response?.user_id).toBeDefined();
		expect(response?.client_secret).toBeDefined();
		expect(response?.redirect_uris).toEqual([redirectUri]);
		oauthClient = response;
	});

	it("should return 401 if the request is not authenticated returning the right WWW-Authenticate header", async ({
		expect,
	}) => {
		// @ts-expect-error
		const response = await mcpHandler(auth, authServerUrl, async () => {
			return new Response("unused");
		})(new Request(`${authServerUrl}/mcp`));

		expect(response.status).toBe(401);
		expect(response.headers.get("WWW-Authenticate")).toBe(
			`Bearer resource_metadata="${authServerUrl}/.well-known/oauth-protected-resource"`,
		);
	});

	it.each([
		{
			resource: "https://api.example.com",
			correctPath: "",
		},
		{
			resource: "https://api.example.com/resource1",
			correctPath: "/resource1",
		},
		{
			resource: "https://api.example.com/resource1?version=2",
			correctPath: "/resource1?version=2",
		},
	] as const)(
		"should provide the correct metadata using resource: $resource",
		async ({ resource, correctPath }) => {
			// @ts-expect-error
			const response = await mcpHandler(auth, resource, async () => {
				return new Response("unused");
			})(new Request(`${authServerUrl}/mcp`));
			expect(response.status).toBe(401);
			expect(response.headers.get("WWW-Authenticate")).toBe(
				`Bearer resource_metadata="https://api.example.com/.well-known/oauth-protected-resource${correctPath}"`,
			);
		},
	);
});
