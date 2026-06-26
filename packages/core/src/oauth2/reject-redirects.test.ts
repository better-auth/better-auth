import { describe, expect, it, vi } from "vitest";

vi.mock("@better-fetch/fetch", () => ({
	betterFetch: vi.fn(),
}));

import { betterFetch } from "@better-fetch/fetch";
import { BetterAuthError } from "../error";
import { clientCredentialsToken } from "./client-credentials-token";
import { refreshAccessToken } from "./refresh-access-token";
import { assertNoRedirect } from "./reject-redirects";
import { validateAuthorizationCode } from "./validate-authorization-code";

const mockedBetterFetch = vi.mocked(betterFetch);

describe("assertNoRedirect", () => {
	it("throws on every redirect status", () => {
		for (const status of [301, 302, 303, 307, 308]) {
			expect(() =>
				assertNoRedirect("https://idp.example/token", status),
			).toThrow(BetterAuthError);
		}
	});

	it("does nothing for non-redirect or absent statuses", () => {
		for (const status of [200, 304, 400, 401, 0]) {
			expect(() =>
				assertNoRedirect("https://idp.example/token", status),
			).not.toThrow();
		}
		expect(() =>
			assertNoRedirect("https://idp.example/token", undefined),
		).not.toThrow();
		expect(() =>
			assertNoRedirect("https://idp.example/token", null),
		).not.toThrow();
	});
});

/**
 * Server-side OAuth fetches reach endpoints whose URLs are influenced by data an
 * authenticated user can register through SSO/OIDC discovery. Following a 3xx
 * could bounce the request to an internal address, so every server-side OAuth
 * fetch runs with redirect handling disabled and rejects a redirect response.
 */
describe("server-side OAuth fetches refuse redirects", () => {
	const REDIRECT = {
		data: null,
		error: { status: 302, message: "Found", statusText: "Found" },
	};

	it("validateAuthorizationCode refuses a redirecting token endpoint", async () => {
		mockedBetterFetch.mockResolvedValueOnce(REDIRECT as never);

		await expect(
			validateAuthorizationCode({
				code: "auth-code",
				redirectURI: "https://app.example/callback",
				options: { clientId: "client", clientSecret: "secret" },
				tokenEndpoint: "https://idp.example/token",
			}),
		).rejects.toThrow(BetterAuthError);

		expect(mockedBetterFetch).toHaveBeenCalledWith(
			"https://idp.example/token",
			expect.objectContaining({ redirect: "manual" }),
		);
	});

	it("refreshAccessToken refuses a redirecting token endpoint", async () => {
		mockedBetterFetch.mockResolvedValueOnce(REDIRECT as never);

		await expect(
			refreshAccessToken({
				refreshToken: "refresh-token",
				options: { clientId: "client", clientSecret: "secret" },
				tokenEndpoint: "https://idp.example/token",
			}),
		).rejects.toThrow(BetterAuthError);

		expect(mockedBetterFetch).toHaveBeenCalledWith(
			"https://idp.example/token",
			expect.objectContaining({ redirect: "manual" }),
		);
	});

	it("clientCredentialsToken refuses a redirecting token endpoint", async () => {
		mockedBetterFetch.mockResolvedValueOnce(REDIRECT as never);

		await expect(
			clientCredentialsToken({
				options: { clientId: "client", clientSecret: "secret" },
				tokenEndpoint: "https://idp.example/token",
				scope: "openid",
			}),
		).rejects.toThrow(BetterAuthError);

		expect(mockedBetterFetch).toHaveBeenCalledWith(
			"https://idp.example/token",
			expect.objectContaining({ redirect: "manual" }),
		);
	});
});
