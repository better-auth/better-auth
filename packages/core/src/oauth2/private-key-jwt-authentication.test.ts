import { decodeJwt, exportJWK, generateKeyPair } from "jose";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@better-fetch/fetch", () => ({
	betterFetch: vi.fn(),
}));

import { betterFetch } from "@better-fetch/fetch";
import { createPrivateKeyJwtClientAssertionProvider } from "./client-assertion";
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

	function privateKeyJwtProvider(kid: string) {
		return createPrivateKeyJwtClientAssertionProvider({
			clientId,
			tokenEndpoint,
			privateKeyJwk: privateJwk,
			kid,
			algorithm: "RS256",
		});
	}

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

	function expectCustomAssertionRequest(clientAssertion: string) {
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
		expect(body.get("client_assertion")).toBe(clientAssertion);

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
			clientAssertionProvider: privateKeyJwtProvider("auth-code-key"),
		});

		expect(tokens.accessToken).toBe("access-token");
		const body = expectAssertionRequest();
		expect(body.get("grant_type")).toBe("authorization_code");
		expect(body.get("code")).toBe("auth-code");
		expect(body.get("redirect_uri")).toBe("https://rp.example.com/callback");
	});

	it("should use an options-level authorization-code assertion provider", async () => {
		const clientAssertionProvider = vi.fn(async () => "options-auth-assertion");
		mockedBetterFetch.mockResolvedValueOnce({
			data: {
				access_token: "access-token",
				token_type: "Bearer",
			},
			error: null,
		});

		await validateAuthorizationCode({
			code: "auth-code",
			redirectURI: "https://rp.example.com/callback",
			options: {
				clientId,
				clientSecret: "client-secret",
				clientAssertionProvider,
			},
			tokenEndpoint,
			authentication: "basic",
		});

		expect(clientAssertionProvider).toHaveBeenCalledOnce();
		const body = expectCustomAssertionRequest("options-auth-assertion");
		expect(body.get("grant_type")).toBe("authorization_code");
		expect(body.get("code")).toBe("auth-code");
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
			clientAssertionProvider: privateKeyJwtProvider("refresh-key"),
		});

		expect(tokens.accessToken).toBe("new-access-token");
		const body = expectAssertionRequest();
		expect(body.get("grant_type")).toBe("refresh_token");
		expect(body.get("refresh_token")).toBe("old-refresh-token");
	});

	it("should use an options-level refresh-token assertion provider", async () => {
		const clientAssertionProvider = vi.fn(
			async () => "options-refresh-assertion",
		);
		mockedBetterFetch.mockResolvedValueOnce({
			data: {
				access_token: "new-access-token",
				token_type: "Bearer",
			},
			error: null,
		});

		await refreshAccessToken({
			refreshToken: "old-refresh-token",
			options: {
				clientId,
				clientSecret: "client-secret",
				clientAssertionProvider,
			},
			tokenEndpoint,
			authentication: "basic",
		});

		expect(clientAssertionProvider).toHaveBeenCalledOnce();
		const body = expectCustomAssertionRequest("options-refresh-assertion");
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
			clientAssertionProvider: privateKeyJwtProvider("client-credentials-key"),
		});

		expect(tokens.accessToken).toBe("client-credentials-access-token");
		const body = expectAssertionRequest();
		expect(body.get("grant_type")).toBe("client_credentials");
		expect(body.get("scope")).toBe("openid profile");
	});

	it("should use an options-level client-credentials assertion provider", async () => {
		const clientAssertionProvider = vi.fn(
			async () => "options-client-credentials-assertion",
		);
		mockedBetterFetch.mockResolvedValueOnce({
			data: {
				access_token: "client-credentials-access-token",
				token_type: "Bearer",
			},
			error: null,
		});

		await clientCredentialsToken({
			options: {
				clientId,
				clientSecret: "client-secret",
				clientAssertionProvider,
			},
			tokenEndpoint,
			scope: "openid profile",
			authentication: "basic",
		});

		expect(clientAssertionProvider).toHaveBeenCalledOnce();
		const body = expectCustomAssertionRequest(
			"options-client-credentials-assertion",
		);
		expect(body.get("grant_type")).toBe("client_credentials");
		expect(body.get("scope")).toBe("openid profile");
	});

	it("should send a custom client assertion provider result without a client secret", async () => {
		const clientAssertionProvider = vi.fn(
			async () => "custom-client-assertion",
		);

		const { body, headers } = await authorizationCodeRequest({
			code: "auth-code",
			redirectURI: "https://rp.example.com/callback",
			options: {
				clientId,
			},
			authentication: "post",
			clientAssertionProvider,
		});

		expect(clientAssertionProvider).toHaveBeenCalledOnce();
		expect(body.get("client_id")).toBe(clientId);
		expect(body.get("client_secret")).toBeNull();
		expect(body.get("client_assertion_type")).toBe(
			"urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
		);
		expect(body.get("client_assertion")).toBe("custom-client-assertion");
		expect(headers.authorization).toBeUndefined();
	});

	it("should prefer clientAssertionProvider over clientSecret", async () => {
		const clientAssertionProvider = vi.fn(async () => "client-assertion");

		const { body } = await authorizationCodeRequest({
			code: "auth-code",
			redirectURI: "https://rp.example.com/callback",
			options: {
				clientId,
				clientSecret: "client-secret",
			},
			authentication: "post",
			clientAssertionProvider,
		});

		expect(clientAssertionProvider).toHaveBeenCalledOnce();
		expect(body.get("client_secret")).toBeNull();
		expect(body.get("client_assertion_type")).toBe(
			"urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
		);
		expect(body.get("client_assertion")).toBe("client-assertion");
	});

	it("should prefer explicit clientAssertionProvider over options provider", async () => {
		const optionsClientAssertionProvider = vi.fn(
			async () => "options-client-assertion",
		);
		const explicitClientAssertionProvider = vi.fn(
			async () => "explicit-client-assertion",
		);

		const { body } = await authorizationCodeRequest({
			code: "auth-code",
			redirectURI: "https://rp.example.com/callback",
			options: {
				clientId,
				clientAssertionProvider: optionsClientAssertionProvider,
			},
			clientAssertionProvider: explicitClientAssertionProvider,
		});

		expect(optionsClientAssertionProvider).not.toHaveBeenCalled();
		expect(explicitClientAssertionProvider).toHaveBeenCalledOnce();
		expect(body.get("client_assertion")).toBe("explicit-client-assertion");
	});
});
