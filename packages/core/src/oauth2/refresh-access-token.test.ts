import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@better-fetch/fetch", () => ({
	betterFetch: vi.fn(),
}));

import { betterFetch } from "@better-fetch/fetch";
import {
	refreshAccessToken,
	refreshAccessTokenRequest,
} from "./refresh-access-token";
import { mergeScopes, parseScopeField } from "./utils";

const mockedBetterFetch = vi.mocked(betterFetch);

describe("refreshAccessToken", () => {
	beforeEach(() => {
		mockedBetterFetch.mockReset();
	});

	it("should set accessTokenExpiresAt when expires_in is returned", async () => {
		const now = Date.now();
		mockedBetterFetch.mockResolvedValueOnce({
			data: {
				access_token: "new-access-token",
				refresh_token: "new-refresh-token",
				expires_in: 3600,
				token_type: "Bearer",
			},
			error: null,
		});

		const tokens = await refreshAccessToken({
			refreshToken: "old-refresh-token",
			options: { clientId: "test-client", clientSecret: "test-secret" },
			tokenEndpoint: "https://example.com/token",
		});

		expect(tokens.accessToken).toBe("new-access-token");
		expect(tokens.refreshToken).toBe("new-refresh-token");
		expect(tokens.accessTokenExpiresAt).toBeInstanceOf(Date);
		expect(tokens.accessTokenExpiresAt!.getTime()).toBeGreaterThanOrEqual(
			now + 3600 * 1000 - 1000,
		);
		expect(tokens.refreshTokenExpiresAt).toBeUndefined();
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/7682
	 */
	it("should set refreshTokenExpiresAt when refresh_token_expires_in is returned", async () => {
		const now = Date.now();
		mockedBetterFetch.mockResolvedValueOnce({
			data: {
				access_token: "new-access-token",
				refresh_token: "new-refresh-token",
				expires_in: 3600,
				refresh_token_expires_in: 86400,
				token_type: "Bearer",
			},
			error: null,
		});

		const tokens = await refreshAccessToken({
			refreshToken: "old-refresh-token",
			options: { clientId: "test-client", clientSecret: "test-secret" },
			tokenEndpoint: "https://example.com/token",
		});

		expect(tokens.accessToken).toBe("new-access-token");
		expect(tokens.refreshToken).toBe("new-refresh-token");
		expect(tokens.accessTokenExpiresAt).toBeInstanceOf(Date);
		expect(tokens.refreshTokenExpiresAt).toBeInstanceOf(Date);
		expect(tokens.refreshTokenExpiresAt!.getTime()).toBeGreaterThanOrEqual(
			now + 86400 * 1000 - 1000,
		);
	});

	it("should not set refreshTokenExpiresAt when refresh_token_expires_in is not returned", async () => {
		mockedBetterFetch.mockResolvedValueOnce({
			data: {
				access_token: "new-access-token",
				refresh_token: "new-refresh-token",
				expires_in: 3600,
				token_type: "Bearer",
			},
			error: null,
		});

		const tokens = await refreshAccessToken({
			refreshToken: "old-refresh-token",
			options: { clientId: "test-client", clientSecret: "test-secret" },
			tokenEndpoint: "https://example.com/token",
		});

		expect(tokens.refreshTokenExpiresAt).toBeUndefined();
	});

	it("normalizes scope returned from refresh token responses", async () => {
		mockedBetterFetch.mockResolvedValueOnce({
			data: {
				access_token: "new-access-token",
				token_type: "Bearer",
				scope: "openid  email ",
			},
			error: null,
		});

		const tokens = await refreshAccessToken({
			refreshToken: "old-refresh-token",
			options: { clientId: "test-client", clientSecret: "test-secret" },
			tokenEndpoint: "https://example.com/token",
		});

		expect(tokens.scopes).toEqual(["openid", "email"]);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/12361
	 * @see https://datatracker.ietf.org/doc/html/rfc6749#section-5.1
	 * @see https://datatracker.ietf.org/doc/html/rfc6749#appendix-A.12
	 */
	it.each([
		{
			name: "an OAuth error body",
			body: {
				error: "bad_refresh_token",
				error_description: "The refresh token passed is incorrect or expired.",
			},
		},
		{
			name: "an empty access token",
			body: {
				access_token: "",
			},
		},
		{
			name: "a non-string access token",
			body: {
				access_token: 123,
			},
		},
	])("rejects a successful status with $name", async ({ body }) => {
		mockedBetterFetch.mockResolvedValueOnce({
			data: body,
			error: null,
		});

		await expect(
			refreshAccessToken({
				refreshToken: "spent-refresh-token",
				options: { clientId: "test-client", clientSecret: "test-secret" },
				tokenEndpoint: "https://example.com/token",
			}),
		).rejects.toEqual(body);
	});

	it("passes resource indicators through refresh token requests", async () => {
		mockedBetterFetch.mockResolvedValueOnce({
			data: {
				access_token: "new-access-token",
				token_type: "Bearer",
			},
			error: null,
		});

		await refreshAccessToken({
			refreshToken: "old-refresh-token",
			options: { clientId: "test-client", clientSecret: "test-secret" },
			tokenEndpoint: "https://example.com/token",
			resource: [
				"https://api.example.com/resource-a",
				"https://api.example.com/resource-b",
			],
		});

		const [, init] = mockedBetterFetch.mock.calls[0] ?? [];
		const body = init?.body as URLSearchParams;
		expect(body.getAll("resource")).toEqual([
			"https://api.example.com/resource-a",
			"https://api.example.com/resource-b",
		]);
	});

	it("drops refresh params owned by the refresh flow or unsafe object keys", async () => {
		mockedBetterFetch.mockResolvedValueOnce({
			data: {
				access_token: "new-access-token",
				token_type: "Bearer",
			},
			error: null,
		});

		const extraParams = Object.create(null) as Record<string, string>;
		extraParams.grant_type = "client_credentials";
		extraParams.refresh_token = "attacker-refresh-token";
		extraParams["__proto__"] = "polluted";
		extraParams["constructor"] = "polluted";
		extraParams["prototype"] = "polluted";
		extraParams.audience = "https://api.example.com";

		await refreshAccessToken({
			refreshToken: "old-refresh-token",
			options: { clientId: "test-client", clientSecret: "test-secret" },
			tokenEndpoint: "https://example.com/token",
			extraParams,
		});

		const [, init] = mockedBetterFetch.mock.calls[0] ?? [];
		const body = init?.body as URLSearchParams;
		expect(body.get("grant_type")).toBe("refresh_token");
		expect(body.get("refresh_token")).toBe("old-refresh-token");
		expect(body.get("__proto__")).toBeNull();
		expect(body.get("constructor")).toBeNull();
		expect(body.get("prototype")).toBeNull();
		expect(body.get("audience")).toBe("https://api.example.com");
	});
});

describe("refreshAccessTokenRequest", () => {
	it("sends caller headers next to client authentication", async () => {
		const { headers } = await refreshAccessTokenRequest({
			refreshToken: "old-refresh-token",
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
				refreshAccessTokenRequest({
					refreshToken: "old-refresh-token",
					options: { clientId: "test-client" },
					tokenEndpointAuth: { method: "none" },
					headers: { [name]: "Bearer provider-token" },
				}),
			).rejects.toThrow('method: "custom"');
		},
	);

	it("lets a custom method set the authorization header", async () => {
		const { headers } = await refreshAccessTokenRequest({
			refreshToken: "old-refresh-token",
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

describe("parseScopeField", () => {
	it("accepts strings, arrays, empty values, and malformed provider output", () => {
		expect(parseScopeField("openid  email ")).toEqual(["openid", "email"]);
		expect(parseScopeField(["openid", "", " profile ", 1])).toEqual([
			"openid",
			"profile",
		]);
		expect(parseScopeField("")).toEqual([]);
		expect(parseScopeField(undefined)).toEqual([]);
		expect(parseScopeField({ scope: "openid" })).toEqual([]);
	});
});

describe("mergeScopes", () => {
	it("normalizes stored and incoming scopes before merging", () => {
		expect(
			mergeScopes("openid, email,,profile ", [
				"email",
				" offline_access ",
				"",
				"openid",
			]),
		).toBe("openid,email,profile,offline_access");
	});
});
