import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import type { Auth, BetterAuthOptions } from "better-auth/types";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { oauthProviderResourceClient } from "./client-resource";
import { oauthProvider } from "./oauth";

it("accepts auth options that omit base URL configuration", () => {
	const options = { plugins: [] } satisfies BetterAuthOptions;
	type AuthWithoutBaseURL = Auth<typeof options>;
	const createResourceClient = oauthProviderResourceClient<AuthWithoutBaseURL>;

	expectTypeOf(createResourceClient)
		.parameter(0)
		.toEqualTypeOf<AuthWithoutBaseURL | undefined>();
});

describe("resource client defaults with an origin-only baseURL", async () => {
	const origin = "http://localhost:4123";
	const issuer = `${origin}/api/auth`;
	const resource = "https://api.example.com";
	const { auth, signInWithTestUser } = await getTestInstance({
		baseURL: origin,
		plugins: [
			jwt(),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				resources: [resource],
				enforcePerClientResources: false,
				scopes: ["read:posts"],
				clientPrivileges: () => true,
			}),
		],
	});
	const actions = oauthProviderResourceClient(auth).getActions();

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("verifies a token with the default issuer and JWKS URL", async () => {
		const { headers } = await signInWithTestUser();
		const client = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				token_endpoint_auth_method: "client_secret_post",
				grant_types: ["client_credentials"],
				client_credentials_scopes: ["read:posts"],
			},
		});
		const tokens = await auth.api.oauth2Token({
			body: {
				grant_type: "client_credentials",
				client_id: client.client_id,
				client_secret: client.client_secret,
				scope: "read:posts",
				resource,
			},
		});
		// Serve the JWKS request from the test instance instead of the network.
		vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) =>
			auth.handler(new Request(input, init)),
		);

		const payload = await actions.verifyBearerToken(tokens.access_token, {
			verifyOptions: { audience: resource },
		});
		expect(payload).toMatchObject({ iss: issuer, aud: resource });
	});

	it("advertises the resolved issuer as the authorization server", async () => {
		const metadata = await actions.getProtectedResourceMetadata({ resource });
		expect(metadata.authorization_servers).toEqual([issuer]);
	});
});
