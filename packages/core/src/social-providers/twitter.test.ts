import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(import("@better-fetch/fetch"), () => ({
	betterFetch: vi.fn(),
}));

import { betterFetch } from "@better-fetch/fetch";

import { twitter } from "./twitter";

const mockedBetterFetch = vi.mocked(betterFetch);

describe("twitter.getUserInfo", () => {
	beforeEach(() => {
		mockedBetterFetch.mockReset();
		mockedBetterFetch.mockResolvedValueOnce({
			data: {
				data: {
					id: "twitter-user-1",
					name: "Twitter User",
					username: "twitter-user",
				},
			},
			error: null,
		});
	});

	it("uses the user id for the placeholder when no confirmed email exists", async () => {
		mockedBetterFetch.mockResolvedValueOnce({
			data: null,
			error: { message: "Email unavailable" },
		});

		const result = await twitter({
			clientId: "twitter-app",
			clientSecret: "twitter-secret",
		}).getUserInfo({ accessToken: "access-token" });

		expect(result?.user.email).toBe(
			"twitter-user-1@twitter.placeholder.invalid",
		);
	});

	it("keeps a confirmed email", async () => {
		mockedBetterFetch.mockResolvedValueOnce({
			data: { data: { confirmed_email: "user@example.com" } },
			error: null,
		});

		const result = await twitter({
			clientId: "twitter-app",
			clientSecret: "twitter-secret",
		}).getUserInfo({ accessToken: "access-token" });

		expect(result?.user.email).toBe("user@example.com");
	});
});
