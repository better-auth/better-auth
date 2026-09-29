import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(import("@better-fetch/fetch"), () => ({
	betterFetch: vi.fn(),
}));

import { betterFetch } from "@better-fetch/fetch";

import { tiktok } from "./tiktok";

const mockedBetterFetch = vi.mocked(betterFetch);

beforeEach(() => {
	mockedBetterFetch.mockReset();
});

/**
 * @see https://github.com/better-auth/better-auth/issues/10696
 * @see https://developers.tiktok.com/docs/en/oauth-user-access-token-management
 */
describe("tiktok token requests", () => {
	it("exchanges an authorization code with TikTok client credentials", async () => {
		mockedBetterFetch.mockResolvedValueOnce({
			data: {
				access_token: "access-token",
				refresh_token: "refresh-token",
				expires_in: 86400,
				token_type: "Bearer",
			},
			error: null,
		});

		const tokens = await tiktok({
			clientKey: "tiktok-client-key",
			clientSecret: "tiktok-client-secret",
		}).validateAuthorizationCode({
			code: "authorization-code",
			codeVerifier: "code-verifier",
			redirectURI: "https://app.example.com/api/auth/callback/tiktok",
		});

		expect(tokens.accessToken).toBe("access-token");
		const [url, init] = mockedBetterFetch.mock.calls[0] ?? [];
		expect(url).toBe("https://open.tiktokapis.com/v2/oauth/token/");
		expect(init?.body).toBeInstanceOf(URLSearchParams);
		expect(Object.fromEntries(init?.body as URLSearchParams)).toEqual({
			client_key: "tiktok-client-key",
			client_secret: "tiktok-client-secret",
			code: "authorization-code",
			code_verifier: "code-verifier",
			grant_type: "authorization_code",
			redirect_uri: "https://app.example.com/api/auth/callback/tiktok",
		});
	});

	it("refreshes an access token with TikTok client credentials", async () => {
		mockedBetterFetch.mockResolvedValueOnce({
			data: {
				access_token: "refreshed-access-token",
				refresh_token: "rotated-refresh-token",
				expires_in: 86400,
				token_type: "Bearer",
			},
			error: null,
		});

		const tokens = await tiktok({
			clientKey: "tiktok-client-key",
			clientSecret: "tiktok-client-secret",
		}).refreshAccessToken("refresh-token");

		expect(tokens.accessToken).toBe("refreshed-access-token");
		const [url, init] = mockedBetterFetch.mock.calls[0] ?? [];
		expect(url).toBe("https://open.tiktokapis.com/v2/oauth/token/");
		expect(init?.body).toBeInstanceOf(URLSearchParams);
		expect(Object.fromEntries(init?.body as URLSearchParams)).toEqual({
			client_key: "tiktok-client-key",
			client_secret: "tiktok-client-secret",
			grant_type: "refresh_token",
			refresh_token: "refresh-token",
		});
	});
});

describe("tiktok.getUserInfo", () => {
	it("uses the open id for the placeholder email", async () => {
		mockedBetterFetch.mockResolvedValue({
			data: {
				data: {
					user: {
						open_id: "tiktok-user-1",
						avatar_large_url: "https://example.com/avatar.png",
						display_name: "TikTok User",
						username: "tiktok-user",
					},
				},
			},
			error: null,
		});

		const result = await tiktok({
			clientKey: "tiktok-app",
			clientSecret: "tiktok-secret",
		}).getUserInfo({ accessToken: "access-token" });

		expect(result?.user.email).toBe("tiktok-user-1@tiktok.placeholder.invalid");
	});
});
