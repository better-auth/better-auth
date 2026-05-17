import { base64 } from "@better-auth/utils/base64";
import { decodeJwt, exportJWK, generateKeyPair } from "jose";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@better-fetch/fetch", () => ({
	betterFetch: vi.fn(),
}));

import { betterFetch } from "@better-fetch/fetch";
import {
	CLIENT_ASSERTION_TYPE,
	createPrivateKeyJwtClientAssertionGetter,
} from "./client-assertion";
import { clientCredentialsToken } from "./client-credentials-token";
import { refreshAccessToken } from "./refresh-access-token";
import {
	authorizationCodeRequest,
	validateAuthorizationCode,
} from "./validate-authorization-code";

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

	function privateKeyJwtAuth(kid: string) {
		return {
			method: "private_key_jwt" as const,
			getClientAssertion: createPrivateKeyJwtClientAssertionGetter({
				privateKeyJwk: privateJwk,
				kid,
				algorithm: "RS256",
			}),
		};
	}

	function expectAssertionRequest() {
		const [url, init] = mockedBetterFetch.mock.calls[0] ?? [];
		expect(url).toBe(tokenEndpoint);
		expect(init?.method).toBe("POST");
		expect(init?.headers).not.toHaveProperty("authorization");

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

	it("signs authorization-code assertions with the request tokenEndpoint", async () => {
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
			tokenEndpointAuth: privateKeyJwtAuth("auth-code-key"),
		});

		expect(tokens.accessToken).toBe("access-token");
		const body = expectAssertionRequest();
		expect(body.get("grant_type")).toBe("authorization_code");
		expect(body.get("code")).toBe("auth-code");
		expect(body.get("redirect_uri")).toBe("https://rp.example.com/callback");
	});

	it("passes request context to custom assertion getters", async () => {
		const getClientAssertion = vi.fn(async () => "custom-client-assertion");

		const { body, headers } = await authorizationCodeRequest({
			code: "auth-code",
			redirectURI: "https://rp.example.com/callback",
			options: {
				clientId,
			},
			tokenEndpoint,
			authentication: "basic",
			tokenEndpointAuth: {
				method: "private_key_jwt",
				getClientAssertion,
			},
		});

		expect(getClientAssertion).toHaveBeenCalledWith({
			clientId,
			tokenEndpoint,
			grantType: "authorization_code",
		});
		expect(body.get("client_id")).toBe(clientId);
		expect(body.get("client_secret")).toBeNull();
		expect(body.get("client_assertion")).toBe("custom-client-assertion");
		expect(headers.authorization).toBeUndefined();
	});

	it("signs refresh-token assertions with the request tokenEndpoint", async () => {
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
			tokenEndpointAuth: privateKeyJwtAuth("refresh-key"),
		});

		expect(tokens.accessToken).toBe("new-access-token");
		const body = expectAssertionRequest();
		expect(body.get("grant_type")).toBe("refresh_token");
		expect(body.get("refresh_token")).toBe("old-refresh-token");
	});

	it("signs client-credentials assertions with the request tokenEndpoint", async () => {
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
			tokenEndpointAuth: privateKeyJwtAuth("client-credentials-key"),
		});

		expect(tokens.accessToken).toBe("client-credentials-access-token");
		const body = expectAssertionRequest();
		expect(body.get("grant_type")).toBe("client_credentials");
		expect(body.get("scope")).toBe("openid profile");
	});

	it("rejects private_key_jwt combined with a client secret", async () => {
		await expect(
			authorizationCodeRequest({
				code: "auth-code",
				redirectURI: "https://rp.example.com/callback",
				options: {
					clientId,
					clientSecret: "client-secret",
				},
				tokenEndpoint,
				tokenEndpointAuth: privateKeyJwtAuth("conflict-key"),
			}),
		).rejects.toThrow(
			"private_key_jwt token endpoint authentication cannot be combined with clientSecret",
		);
	});

	it("rejects manual client assertions when tokenEndpointAuth is configured", async () => {
		const getClientAssertion = vi.fn(async () => "configured-assertion");

		await expect(
			authorizationCodeRequest({
				code: "auth-code",
				redirectURI: "https://rp.example.com/callback",
				options: {
					clientId,
				},
				tokenEndpoint,
				additionalParams: {
					client_assertion: "manual-assertion",
					client_assertion_type: CLIENT_ASSERTION_TYPE,
				},
				tokenEndpointAuth: {
					method: "private_key_jwt",
					getClientAssertion,
				},
			}),
		).rejects.toThrow(
			"client_assertion body parameters cannot be combined with tokenEndpointAuth",
		);
		expect(getClientAssertion).not.toHaveBeenCalled();
	});

	it("rejects private_key_jwt when no tokenEndpoint is available", async () => {
		await expect(
			authorizationCodeRequest({
				code: "auth-code",
				redirectURI: "https://rp.example.com/callback",
				options: {
					clientId,
				},
				tokenEndpointAuth: privateKeyJwtAuth("missing-token-endpoint-key"),
			}),
		).rejects.toThrow(
			"private_key_jwt token endpoint authentication requires tokenEndpoint",
		);
	});

	it("supports explicit public-client token endpoint authentication", async () => {
		const { body, headers } = await authorizationCodeRequest({
			code: "auth-code",
			redirectURI: "https://rp.example.com/callback",
			options: {
				clientId,
			},
			tokenEndpoint,
			tokenEndpointAuth: { method: "none" },
		});

		expect(body.get("client_id")).toBe(clientId);
		expect(body.get("client_secret")).toBeNull();
		expect(headers.authorization).toBeUndefined();
	});

	it("defaults to public-client token endpoint authentication without clientSecret", async () => {
		const { body, headers } = await authorizationCodeRequest({
			code: "auth-code",
			redirectURI: "https://rp.example.com/callback",
			options: {
				clientId,
			},
			tokenEndpoint,
		});

		expect(body.get("client_id")).toBe(clientId);
		expect(body.get("client_secret")).toBeNull();
		expect(headers.authorization).toBeUndefined();
	});

	it("rejects public-client token endpoint authentication without clientId", async () => {
		await expect(
			authorizationCodeRequest({
				code: "auth-code",
				redirectURI: "https://rp.example.com/callback",
				options: {},
				tokenEndpoint,
				tokenEndpointAuth: { method: "none" },
			}),
		).rejects.toThrow("none token endpoint authentication requires clientId");
	});

	it("rejects public-client token endpoint authentication with client credentials", async () => {
		await expect(
			clientCredentialsToken({
				options: {
					clientId,
				},
				tokenEndpoint,
				scope: "profile",
				tokenEndpointAuth: { method: "none" },
			}),
		).rejects.toThrow(
			"none token endpoint authentication cannot be used with client_credentials grant",
		);
	});

	it("supports explicit client_secret_basic token endpoint authentication", async () => {
		const clientSecret = "client-secret";

		const { body, headers } = await authorizationCodeRequest({
			code: "auth-code",
			redirectURI: "https://rp.example.com/callback",
			options: {
				clientId,
				clientSecret,
			},
			tokenEndpoint,
			tokenEndpointAuth: { method: "client_secret_basic" },
		});

		expect(headers.authorization).toBe(
			`Basic ${base64.encode(`${clientId}:${clientSecret}`)}`,
		);
		expect(body.get("client_id")).toBeNull();
		expect(body.get("client_secret")).toBeNull();
	});

	it("form-url-encodes clientId and clientSecret for client_secret_basic per RFC 6749 §2.3.1", async () => {
		// Use characters whose form-urlencoded encoding differs from
		// encodeURIComponent: space becomes `+` and `!'()*` are escaped. The
		// expected value is computed through URLSearchParams independently of
		// the implementation so the test catches the wrong encoding choice.
		const specialClientId = "alice!*'";
		const specialClientSecret = "p@ss word (1)";

		const { headers } = await authorizationCodeRequest({
			code: "auth-code",
			redirectURI: "https://rp.example.com/callback",
			options: {
				clientId: specialClientId,
				clientSecret: specialClientSecret,
			},
			tokenEndpoint,
			tokenEndpointAuth: { method: "client_secret_basic" },
		});

		const formEncode = (value: string) =>
			new URLSearchParams({ v: value }).toString().slice("v=".length);
		const expected = `Basic ${base64.encode(
			`${formEncode(specialClientId)}:${formEncode(specialClientSecret)}`,
		)}`;
		expect(headers.authorization).toBe(expected);
	});

	it.each([
		"client_secret_basic",
		"client_secret_post",
	] as const)("rejects %s token endpoint authentication without clientId", async (method) => {
		await expect(
			authorizationCodeRequest({
				code: "auth-code",
				redirectURI: "https://rp.example.com/callback",
				options: {
					clientSecret: "client-secret",
				},
				tokenEndpoint,
				tokenEndpointAuth: { method },
			}),
		).rejects.toThrow(
			`${method} token endpoint authentication requires clientId`,
		);
	});

	it("uses configured clientId over additional token client_id parameters", async () => {
		const { body } = await authorizationCodeRequest({
			code: "auth-code",
			redirectURI: "https://rp.example.com/callback",
			options: {
				clientId,
				clientSecret: "client-secret",
			},
			tokenEndpoint,
			additionalParams: {
				client_id: "injected-client-id",
			},
			tokenEndpointAuth: { method: "client_secret_post" },
		});

		expect(body.get("client_id")).toBe(clientId);
	});
});
