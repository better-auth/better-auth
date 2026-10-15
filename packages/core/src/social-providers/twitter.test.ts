import { assertType, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(import("@better-fetch/fetch"), () => ({
	betterFetch: vi.fn(),
}));

import { betterFetch } from "@better-fetch/fetch";

import type { TwitterProfile } from "./twitter";
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

/**
 * @see https://api.x.com/2/openapi.json
 */
it.each([
	{},
	{ url: {} },
	{ url: null, description: null },
	{ url: { urls: null }, description: { hashtags: null } },
	{
		url: { urls: [{ start: 0, end: 20, url: "https://example.com" }] },
		description: {},
	},
	{
		url: {
			urls: [
				{
					start: 0,
					end: 20,
					url: "https://example.com",
					expanded_url: null,
					display_url: null,
				},
			],
		},
		description: { hashtags: [{ start: 0, end: 4, tag: "tag" }] },
	},
])("accepts partial or null Twitter entities: %j", async (entities) => {
	const profile = {
		data: { id: "user", name: "User", username: "user", entities },
	};
	assertType<TwitterProfile>(profile);
	const provider = twitter({
		clientId: "twitter-app",
		getUserInfo: async () => ({
			user: { name: profile.data.name, emailVerified: false },
			data: profile,
		}),
	});

	const result = await provider.getUserInfo({ accessToken: "access-token" });

	expect(result?.data.data.entities).toEqual(entities);
});
