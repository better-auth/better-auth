import { describe, expect, it, vi } from "vitest";

vi.mock("@better-fetch/fetch", () => ({
	betterFetch: vi.fn(),
}));

import { betterFetch } from "@better-fetch/fetch";
import { refreshAccessToken } from "./refresh-access-token";

const mockedBetterFetch = vi.mocked(betterFetch);

describe("refreshAccessToken", () => {
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
});
