import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import type { BetterAuthPlugin } from "better-auth/types";
import { decodeJwt } from "jose";
import { describe, expect, it } from "vitest";
import { createUserTokens } from "./index";
import { oauthProvider } from "./oauth";
import type { OAuthContributions } from "./types/contributions";

const BASE_URL = "http://localhost:3000";
const TOKEN_URL = `${BASE_URL}/api/auth/oauth2/token`;
const METADATA_URL = `${BASE_URL}/api/auth/.well-known/oauth-authorization-server`;
const CUSTOM_GRANT = "urn:better-auth:test:custom-grant";
const RESOURCE = "https://api.test";

/**
 * A guest plugin that exercises every OAuthContributions slot: a custom grant
 * handler, the grant URI, discovery metadata, an advertised auth method, and an
 * access-token claim contributor.
 */
function contributionProbe() {
	return {
		id: "contribution-probe",
		requires: ["oauth-provider"],
		contributes: {
			"oauth-provider": {
				grantTypes: {
					// The handler echoes a passthrough body param to prove the open
					// schema preserves extension params, then returns a plain response.
					[CUSTOM_GRANT]: (ctx) =>
						ctx.json({
							contributed_grant: true,
							echoed: ctx.body.probe,
						}),
				},
				grantTypeURIs: [CUSTOM_GRANT],
				metadata: ({ baseURL }) => ({
					test_probe_endpoint: `${baseURL}/probe`,
				}),
				tokenEndpointAuthMethods: ["urn:better-auth:test:auth"],
				tokenClaims: {
					access: () => ({ probe_claim: "present" }),
				},
			} satisfies OAuthContributions,
		},
	} satisfies BetterAuthPlugin;
}

async function setup() {
	return getTestInstance({
		baseURL: BASE_URL,
		plugins: [
			jwt(),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				// A valid audience lets client_credentials mint a JWT access token,
				// which is where contributed access-token claims are applied.
				validAudiences: [RESOURCE],
				silenceWarnings: { oauthAuthServerConfig: true, openidConfig: true },
			}),
			contributionProbe(),
		],
	});
}

describe("oauth-provider contribution surface", () => {
	it("dispatches a contributed grant type and preserves passthrough body params", async () => {
		const { auth } = await setup();
		const response = await auth.handler(
			new Request(TOKEN_URL, {
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({
					grant_type: CUSTOM_GRANT,
					probe: "hello",
				}).toString(),
			}),
		);
		expect(response.status).toBe(200);
		const body = (await response.json()) as {
			contributed_grant?: boolean;
			echoed?: string;
		};
		expect(body.contributed_grant).toBe(true);
		expect(body.echoed).toBe("hello");
	});

	it("rejects an unregistered grant type with unsupported_grant_type", async () => {
		const { auth } = await setup();
		const response = await auth.handler(
			new Request(TOKEN_URL, {
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({
					grant_type: "urn:better-auth:test:unregistered",
				}).toString(),
			}),
		);
		expect(response.status).toBe(400);
		const body = (await response.json()) as { error?: string };
		expect(body.error).toBe("unsupported_grant_type");
	});

	it("advertises the contributed grant URI, metadata, and auth method in discovery", async () => {
		const { auth } = await setup();
		const response = await auth.handler(new Request(METADATA_URL));
		expect(response.status).toBe(200);
		const metadata = (await response.json()) as {
			grant_types_supported?: string[];
			token_endpoint_auth_methods_supported?: string[];
			test_probe_endpoint?: string;
		};
		expect(metadata.grant_types_supported).toContain(CUSTOM_GRANT);
		expect(metadata.token_endpoint_auth_methods_supported).toContain(
			"urn:better-auth:test:auth",
		);
		expect(metadata.test_probe_endpoint).toBe(`${BASE_URL}/api/auth/probe`);
	});

	it("merges contributed token claims into a minted access token", async () => {
		const { auth, signInWithTestUser } = await setup();
		const { headers } = await signInWithTestUser();
		const client = await auth.api.adminCreateOAuthClient({
			headers,
			body: { redirect_uris: ["http://localhost:3000/cb"], skip_consent: true },
		});
		const response = await auth.handler(
			new Request(TOKEN_URL, {
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({
					grant_type: "client_credentials",
					client_id: client!.client_id,
					client_secret: client!.client_secret!,
					resource: RESOURCE,
				}).toString(),
			}),
		);
		expect(response.status).toBe(200);
		const body = (await response.json()) as { access_token?: string };
		expect(body.access_token).toBeDefined();
		const claims = decodeJwt(body.access_token!);
		expect(claims.probe_claim).toBe("present");
	});

	it("exports the grant-author token-minting helper", () => {
		expect(typeof createUserTokens).toBe("function");
	});
});
