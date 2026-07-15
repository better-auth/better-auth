import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@better-fetch/fetch", () => ({
	betterFetch: vi.fn(),
}));

import { betterFetch } from "@better-fetch/fetch";
import type { ThreadsProfile } from "./threads";
import { threads } from "./threads";

const mockedBetterFetch = vi.mocked(betterFetch);

const options = {
	clientId: "threads-client-id",
	clientSecret: "threads-client-secret",
};

function fetchResponse<T>(data: T) {
	return { data, error: null } as unknown as Awaited<
		ReturnType<typeof betterFetch>
	>;
}

function fetchError(message: string) {
	return {
		data: null,
		error: new Error(message),
	} as unknown as Awaited<ReturnType<typeof betterFetch>>;
}

describe("threads", () => {
	beforeEach(() => {
		mockedBetterFetch.mockReset();
	});

	it("creates an authorization URL with default and requested scopes", async () => {
		const provider = threads({ ...options, scope: ["threads_read_replies"] });
		const url = await provider.createAuthorizationURL({
			state: "state",
			codeVerifier: "verifier",
			scopes: ["threads_manage_replies"],
			redirectURI: "https://example.com/callback",
		});

		expect(url.origin + url.pathname).toBe(
			"https://threads.net/oauth/authorize",
		);
		expect(url.searchParams.get("client_id")).toBe(options.clientId);
		expect(url.searchParams.get("redirect_uri")).toBe(
			"https://example.com/callback",
		);
		expect(url.searchParams.get("state")).toBe("state");
		expect(url.searchParams.get("response_type")).toBe("code");
		expect(url.searchParams.get("scope")?.split(" ")).toEqual([
			"threads_basic",
			"threads_read_replies",
			"threads_manage_replies",
		]);
	});

	it("supports disabling the default scope", async () => {
		const provider = threads({ ...options, disableDefaultScope: true });
		const url = await provider.createAuthorizationURL({
			state: "state",
			codeVerifier: "verifier",
			scopes: ["threads_content_publish"],
			redirectURI: "https://example.com/callback",
		});

		expect(url.searchParams.get("scope")).toBe("threads_content_publish");
	});

	it("rejects authorization without credentials", async () => {
		const provider = threads({ clientId: "" });

		await expect(
			provider.createAuthorizationURL({
				state: "state",
				codeVerifier: "verifier",
				redirectURI: "https://example.com/callback",
			}),
		).rejects.toThrow("CLIENT_ID_AND_SECRET_REQUIRED");
	});

	it("exchanges an authorization code for a refreshable long-lived token", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
		mockedBetterFetch
			.mockResolvedValueOnce(
				fetchResponse({
					access_token: "short-lived-token",
					scope: "threads_basic threads_read_replies",
				}),
			)
			.mockResolvedValueOnce(
				fetchResponse({
					access_token: "long-lived-token",
					token_type: "bearer",
					expires_in: 3600,
				}),
			);

		try {
			const result = await threads(options).validateAuthorizationCode({
				code: "authorization-code",
				redirectURI: "https://example.com/callback",
			});

			expect(result).toMatchObject({
				accessToken: "long-lived-token",
				refreshToken: "long-lived-token",
				tokenType: "bearer",
				scopes: ["threads_basic", "threads_read_replies"],
				accessTokenExpiresAt: new Date("2026-01-01T01:00:00.000Z"),
				raw: {
					access_token: "long-lived-token",
					token_type: "bearer",
					expires_in: 3600,
				},
			});
			expect(mockedBetterFetch).toHaveBeenNthCalledWith(
				2,
				"https://graph.threads.net/access_token",
				expect.objectContaining({
					query: {
						grant_type: "th_exchange_token",
						client_secret: options.clientSecret,
						access_token: "short-lived-token",
					},
				}),
			);
		} finally {
			vi.useRealTimers();
		}
	});

	it("throws when the long-lived token exchange fails", async () => {
		mockedBetterFetch
			.mockResolvedValueOnce(fetchResponse({ access_token: "short-token" }))
			.mockResolvedValueOnce(fetchError("exchange failed"));

		await expect(
			threads(options).validateAuthorizationCode({
				code: "authorization-code",
				redirectURI: "https://example.com/callback",
			}),
		).rejects.toThrow("exchange failed");
	});

	it("refreshes and rotates a long-lived token", async () => {
		mockedBetterFetch.mockResolvedValueOnce(
			fetchResponse({ access_token: "rotated-token", expires_in: 3600 }),
		);
		const provider = threads(options);

		const result = await provider.refreshAccessToken("current-token");

		expect(result.accessToken).toBe("rotated-token");
		expect(result.refreshToken).toBe("rotated-token");
		expect(mockedBetterFetch).toHaveBeenCalledWith(
			"https://graph.threads.net/refresh_access_token",
			expect.objectContaining({
				query: {
					grant_type: "th_refresh_token",
					access_token: "current-token",
				},
			}),
		);
	});

	it("uses a custom refresh implementation when supplied", async () => {
		const refreshAccessToken = vi
			.fn()
			.mockResolvedValue({ accessToken: "custom-token" });
		const provider = threads({ ...options, refreshAccessToken });

		await expect(provider.refreshAccessToken("stored-token")).resolves.toEqual({
			accessToken: "custom-token",
		});
		expect(refreshAccessToken).toHaveBeenCalledWith("stored-token");
		expect(mockedBetterFetch).not.toHaveBeenCalled();
	});

	it("maps a Threads profile to a Better Auth user", async () => {
		const profile: ThreadsProfile = {
			id: "threads-user-id",
			username: "threads-user",
			name: "Threads User",
			threads_profile_picture_url: "https://example.com/avatar.png",
			threads_biography: "Biography",
		};
		mockedBetterFetch.mockResolvedValueOnce(fetchResponse(profile));

		const result = await threads(options).getUserInfo({
			accessToken: "access-token",
		});

		expect(result).toEqual({
			user: {
				id: "threads-user-id",
				name: "Threads User",
				email: "threads-user",
				image: "https://example.com/avatar.png",
				emailVerified: false,
			},
			data: profile,
		});
		expect(mockedBetterFetch).toHaveBeenCalledWith(
			"https://graph.threads.net/me",
			{
				query: {
					fields:
						"id,username,name,threads_profile_picture_url,threads_biography",
				},
				headers: { authorization: "Bearer access-token" },
			},
		);
	});

	it("applies custom profile mapping", async () => {
		mockedBetterFetch.mockResolvedValueOnce(
			fetchResponse({
				id: "threads-user-id",
				username: "threads-user",
				name: "Threads User",
			}),
		);
		const provider = threads({
			...options,
			mapProfileToUser: () => ({
				email: "user@example.com",
				emailVerified: true,
			}),
		});

		const result = await provider.getUserInfo({ accessToken: "access-token" });

		expect(result?.user.email).toBe("user@example.com");
		expect(result?.user.emailVerified).toBe(true);
	});

	it("uses custom user info and skips requests without an access token", async () => {
		const customResult = {
			user: {
				id: "custom-id",
				name: "Custom User",
				email: "custom@example.com",
				emailVerified: true,
			},
			data: {
				id: "custom-id",
				username: "custom",
				name: "Custom User",
			},
		};
		const customProvider = threads({
			...options,
			getUserInfo: vi.fn().mockResolvedValue(customResult),
		});

		await expect(
			customProvider.getUserInfo({ accessToken: "access-token" }),
		).resolves.toEqual(customResult);
		await expect(threads(options).getUserInfo({})).resolves.toBeNull();
		expect(mockedBetterFetch).not.toHaveBeenCalled();
	});

	it("returns null when the profile request fails", async () => {
		mockedBetterFetch.mockResolvedValueOnce(fetchError("profile failed"));

		await expect(
			threads(options).getUserInfo({ accessToken: "access-token" }),
		).resolves.toBeNull();
	});
});
