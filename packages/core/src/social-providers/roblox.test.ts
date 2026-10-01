import { describe, expect, it, vi } from "vitest";

vi.mock(import("@better-fetch/fetch"), () => ({
	betterFetch: vi.fn(),
}));

import { betterFetch } from "@better-fetch/fetch";

import { roblox } from "./roblox";

const mockedBetterFetch = vi.mocked(betterFetch);

describe("roblox.getUserInfo", () => {
	it("uses the user ID in the placeholder email", async () => {
		mockedBetterFetch.mockResolvedValue({
			data: {
				sub: "roblox-user-1",
				preferred_username: "builderman",
				nickname: "Builderman",
				name: "Builderman",
				created_at: 0,
				profile: "https://www.roblox.com/users/1/profile",
				picture: "https://example.com/avatar.png",
			},
			error: null,
		});

		const result = await roblox({
			clientId: "roblox-app",
			clientSecret: "roblox-secret",
		}).getUserInfo({ accessToken: "access-token" });

		expect(result?.user.email).toBe("roblox-user-1@roblox.placeholder.invalid");
	});
});
