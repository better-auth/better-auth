import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../oauth2", async (importOriginal) => {
	const mod = await importOriginal<typeof import("../oauth2")>();
	return {
		...mod,
		validateAuthorizationCode: vi.fn(
			async (args: {
				options: {
					clientId?: string;
					clientKey?: string;
					clientSecret?: string;
				};
			}) => {
				// Mirror production token-auth layer: secret + post requires clientId.
				if (args.options.clientSecret && !args.options.clientId) {
					throw new Error(
						"client_secret_post token endpoint authentication requires clientId",
					);
				}
				return {
					accessToken: "access",
					refreshToken: "refresh",
					accessTokenExpiresAt: new Date(),
				};
			},
		),
		refreshAccessToken: vi.fn(
			async (args: {
				options: { clientId?: string; clientSecret?: string };
			}) => {
				if (args.options.clientSecret && !args.options.clientId) {
					throw new Error(
						"client_secret_post token endpoint authentication requires clientId",
					);
				}
				return {
					accessToken: "access-refreshed",
					refreshToken: "refresh",
					accessTokenExpiresAt: new Date(),
				};
			},
		),
	};
});

vi.mock(import("@better-fetch/fetch"), () => ({
	betterFetch: vi.fn(),
}));

import { betterFetch } from "@better-fetch/fetch";
import { refreshAccessToken, validateAuthorizationCode } from "../oauth2";
import { tiktok } from "./tiktok";

const mockedBetterFetch = vi.mocked(betterFetch);

describe("tiktok OAuth clientId mapping (#10696)", () => {
	beforeEach(() => {
		vi.mocked(validateAuthorizationCode).mockClear();
		vi.mocked(refreshAccessToken).mockClear();
	});

	const options = {
		clientKey: "tt-client-key",
		clientSecret: "tt-secret",
	};

	it("maps clientKey to clientId on authorization-code exchange", async () => {
		const provider = tiktok(options);
		await provider.validateAuthorizationCode!({
			code: "auth-code",
			redirectURI: "https://app.example/callback",
		});

		expect(validateAuthorizationCode).toHaveBeenCalledWith(
			expect.objectContaining({
				options: expect.objectContaining({
					clientId: "tt-client-key",
					clientKey: "tt-client-key",
					clientSecret: "tt-secret",
				}),
			}),
		);
	});

	it("maps clientKey to clientId on token refresh", async () => {
		const provider = tiktok(options);
		await provider.refreshAccessToken!("refresh-token");

		expect(refreshAccessToken).toHaveBeenCalledWith(
			expect.objectContaining({
				options: expect.objectContaining({
					clientId: "tt-client-key",
					clientSecret: "tt-secret",
				}),
				extraParams: expect.objectContaining({
					client_key: "tt-client-key",
				}),
			}),
		);
	});

	it("does not throw client_secret_post requires clientId after mapping", async () => {
		const provider = tiktok(options);
		await expect(
			provider.validateAuthorizationCode!({
				code: "auth-code",
				redirectURI: "https://app.example/callback",
			}),
		).resolves.toMatchObject({ accessToken: "access" });
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
