import { DPOP_SIGNING_ALGORITHMS, deriveDpopAth } from "better-auth/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import type { Auth, BetterAuthOptions } from "better-auth/types";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
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

	/**
	 * @see https://datatracker.ietf.org/doc/html/rfc9449#section-7.2
	 */
	it("answers a failed DPoP request with a DPoP challenge", async () => {
		vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) =>
			auth.handler(new Request(input, init)),
		);
		const error = await actions
			.verifyAccessTokenRequest(
				new Request(resource, {
					headers: { Authorization: "DPoP not-a-valid-token" },
				}),
				{ verifyOptions: { audience: resource } },
			)
			.catch((e: unknown) => e);
		expect(error).toMatchObject({ statusCode: 401 });
		expect(
			new Headers((error as { headers: HeadersInit }).headers).get(
				"WWW-Authenticate",
			),
		).toMatch(
			new RegExp(
				`^DPoP error="invalid_token", error_description="[^"]+", algs="${DPOP_SIGNING_ALGORITHMS.join(" ")}"$`,
			),
		);
	});

	/**
	 * @see https://datatracker.ietf.org/doc/html/rfc9449#section-7.1
	 */
	it("answers a DPoP-bound token missing a scope with a DPoP challenge", async () => {
		vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) =>
			auth.handler(new Request(input, init)),
		);
		const { headers } = await signInWithTestUser();
		const client = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				token_endpoint_auth_method: "client_secret_post",
				grant_types: ["client_credentials"],
				client_credentials_scopes: ["read:posts"],
			},
		});
		const { privateKey, publicKey } = await generateKeyPair("ES256", {
			extractable: true,
		});
		const publicJwk = await exportJWK(publicKey);
		const createProof = async (
			method: string,
			url: string,
			accessToken?: string,
		) =>
			new SignJWT({
				jti: crypto.randomUUID(),
				htm: method,
				htu: url,
				iat: Math.floor(Date.now() / 1000),
				...(accessToken && { ath: await deriveDpopAth(accessToken) }),
			})
				.setProtectedHeader({ typ: "dpop+jwt", alg: "ES256", jwk: publicJwk })
				.sign(privateKey);
		const tokenEndpoint = `${issuer}/oauth2/token`;
		const tokenResponse = await auth.handler(
			new Request(tokenEndpoint, {
				method: "POST",
				headers: {
					"content-type": "application/x-www-form-urlencoded",
					DPoP: await createProof("POST", tokenEndpoint),
				},
				body: new URLSearchParams({
					grant_type: "client_credentials",
					client_id: client.client_id,
					client_secret: client.client_secret!,
					scope: "read:posts",
					resource,
				}),
			}),
		);
		const tokens = (await tokenResponse.json()) as {
			access_token: string;
			token_type: string;
		};
		expect(tokens.token_type).toBe("DPoP");

		const error = await actions
			.verifyAccessTokenRequest(
				new Request(resource, {
					headers: {
						Authorization: `DPoP ${tokens.access_token}`,
						DPoP: await createProof("GET", resource, tokens.access_token),
					},
				}),
				{
					verifyOptions: { audience: resource },
					requiredScopes: ["write:posts"],
				},
			)
			.catch((e: unknown) => e);
		expect(error).toMatchObject({ statusCode: 403 });
		expect(
			new Headers((error as { headers: HeadersInit }).headers).get(
				"WWW-Authenticate",
			),
		).toMatch(
			/^DPoP error="insufficient_scope", scope="write:posts", .*algs="/,
		);
	});

	it("advertises the resolved issuer as the authorization server", async () => {
		const metadata = await actions.getProtectedResourceMetadata({ resource });
		expect(metadata.authorization_servers).toEqual([issuer]);
	});
});
