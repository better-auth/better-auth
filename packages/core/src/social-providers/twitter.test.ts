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
it("types omitted and nullable entity details and URL previews", () => {
	assertType<TwitterProfile["data"]["entities"]>({});
	assertType<TwitterProfile["data"]["entities"]>({ url: {}, description: {} });
	assertType<TwitterProfile["data"]["entities"]>({
		url: null,
		description: null,
	});
	assertType<TwitterProfile["data"]["entities"]>({
		url: { urls: null },
		description: {
			hashtags: null,
			cashtags: [{ start: 0, end: 4, tag: "X" }],
			mentions: [{ start: 5, end: 10, username: "user", id: null }],
			urls: [
				{
					start: 11,
					end: 34,
					url: "https://t.co/example",
					expanded_url: null,
					display_url: null,
					title: null,
					description: "Page",
					status: 200,
					unwound_url: "https://example.com",
					media_key: null,
					images: [{ url: null, width: 640, height: null }],
				},
			],
		},
	});
});
