import { decodeJwt, exportJWK, generateKeyPair } from "jose";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@better-fetch/fetch", () => ({
	betterFetch: vi.fn(),
}));

import { betterFetch } from "@better-fetch/fetch";
import { clientCredentialsToken } from "./client-credentials-token";
import { refreshAccessToken } from "./refresh-access-token";
import { validateAuthorizationCode } from "./validate-authorization-code";

const mockedBetterFetch = vi.mocked(betterFetch);

describe("private_key_jwt OAuth2 helpers", () => {
	const clientId = "test-client-id";
	const tokenEndpoint = "https://idp.example.com/token";
	let privateJwk: JsonWebKey;

	beforeAll(async () => {
		const { privateKey } = await generateKeyPair("RS256", {
			extractable: true,
		});
		privateJwk = await exportJWK(privateKey);
	});

	beforeEach(() => {
		mockedBetterFetch.mockReset();
	});

	function expectAssertionRequest() {
		const [url, init] = mockedBetterFetch.mock.calls[0] ?? [];
		expect(url).toBe(tokenEndpoint);
		expect(init?.method).toBe("POST");

		const body = init?.body as URLSearchParams;
		expect(body).toBeInstanceOf(URLSearchParams);
		expect(body.get("client_id")).toBe(clientId);
		expect(body.get("client_secret")).toBeNull();
		expect(body.get("client_assertion_type")).toBe(
			"urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
		);

		const assertion = body.get("client_assertion");
		expect(assertion).toBeTruthy();

		const payload = decodeJwt(assertion!);
		expect(payload.iss).toBe(clientId);
		expect(payload.sub).toBe(clientId);
		expect(payload.aud).toBe(tokenEndpoint);

		return body;
	}

	it("should sign authorization-code assertions with the request tokenEndpoint", async () => {
		mockedBetterFetch.mockResolvedValueOnce({
			data: {
				access_token: "access-token",
				refresh_token: "refresh-token",
				token_type: "Bearer",
				expires_in: 3600,
			},
			error: null,
		});

		const tokens = await validateAuthorizationCode({
			code: "auth-code",
			redirectURI: "https://rp.example.com/callback",
			options: {
				clientId,
			},
			tokenEndpoint,
			authentication: "private_key_jwt",
			clientAssertion: {
				privateKeyJwk: privateJwk,
				kid: "auth-code-key",
				algorithm: "RS256",
			},
		});

		expect(tokens.accessToken).toBe("access-token");
		const body = expectAssertionRequest();
		expect(body.get("grant_type")).toBe("authorization_code");
		expect(body.get("code")).toBe("auth-code");
		expect(body.get("redirect_uri")).toBe("https://rp.example.com/callback");
	});

	it("should sign refresh-token assertions with the request tokenEndpoint", async () => {
		mockedBetterFetch.mockResolvedValueOnce({
			data: {
				access_token: "new-access-token",
				refresh_token: "new-refresh-token",
				token_type: "Bearer",
				expires_in: 3600,
			},
			error: null,
		});

		const tokens = await refreshAccessToken({
			refreshToken: "old-refresh-token",
			options: {
				clientId,
			},
			tokenEndpoint,
			authentication: "private_key_jwt",
			clientAssertion: {
				privateKeyJwk: privateJwk,
				kid: "refresh-key",
				algorithm: "RS256",
			},
		});

		expect(tokens.accessToken).toBe("new-access-token");
		const body = expectAssertionRequest();
		expect(body.get("grant_type")).toBe("refresh_token");
		expect(body.get("refresh_token")).toBe("old-refresh-token");
	});

	it("should sign client-credentials assertions with the request tokenEndpoint", async () => {
		mockedBetterFetch.mockResolvedValueOnce({
			data: {
				access_token: "client-credentials-access-token",
				token_type: "Bearer",
				expires_in: 3600,
				scope: "openid profile",
			},
			error: null,
		});

		const tokens = await clientCredentialsToken({
			options: {
				clientId,
			},
			tokenEndpoint,
			scope: "openid profile",
			authentication: "private_key_jwt",
			clientAssertion: {
				privateKeyJwk: privateJwk,
				kid: "client-credentials-key",
				algorithm: "RS256",
			},
		});

		expect(tokens.accessToken).toBe("client-credentials-access-token");
		const body = expectAssertionRequest();
		expect(body.get("grant_type")).toBe("client_credentials");
		expect(body.get("scope")).toBe("openid profile");
	});
});
