import { describe, expect, it, vi } from "vitest";

vi.mock(import("@better-fetch/fetch"), () => ({
	betterFetch: vi.fn(),
}));

import { betterFetch } from "@better-fetch/fetch";

import { tiktok } from "./tiktok";

const mockedBetterFetch = vi.mocked(betterFetch);

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
