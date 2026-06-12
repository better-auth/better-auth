import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@better-fetch/fetch", () => ({
	betterFetch: vi.fn(),
}));

import { betterFetch } from "@better-fetch/fetch";

import { reddit } from "./reddit";

const mockedBetterFetch = vi.mocked(betterFetch);

const options = {
	clientId: "reddit-app",
	clientSecret: "reddit-secret",
};

function profileResponse(profile: Record<string, unknown>) {
	return { data: profile, error: null } as Awaited<
		ReturnType<typeof betterFetch>
	>;
}

describe("reddit.getUserInfo (no provider email)", () => {
	beforeEach(() => {
		mockedBetterFetch.mockReset();
	});

	it("synthesizes a non-routable placeholder email and never trusts oauth_client_id", async () => {
		mockedBetterFetch.mockResolvedValue(
			profileResponse({
				id: "reddit-user-1",
				name: "spez",
				icon_img: "https://example.com/avatar.png",
				has_verified_email: true,
				oauth_client_id: "shared-app-client-id",
				verified: true,
			}),
		);
		const provider = reddit(options);
		const res = await provider.getUserInfo({
			accessToken: "access-token",
		} as any);

		expect(res?.user.email).toBe("reddit-user-1@reddit.invalid");
		// `has_verified_email` describes the user's real Reddit email, not the
		// synthetic placeholder, so the placeholder must never be marked verified.
		expect(res?.user.emailVerified).toBe(false);
		// The OAuth app's client id must never become the user's identity anchor.
		expect(res?.user.email).not.toContain("shared-app-client-id");
	});

	it("gives distinct users distinct placeholder emails", async () => {
		const provider = reddit(options);

		mockedBetterFetch.mockResolvedValue(
			profileResponse({
				id: "user-a",
				name: "a",
				icon_img: null,
				has_verified_email: true,
				oauth_client_id: "same-client",
				verified: true,
			}),
		);
		const a = await provider.getUserInfo({ accessToken: "t-a" } as any);

		mockedBetterFetch.mockResolvedValue(
			profileResponse({
				id: "user-b",
				name: "b",
				icon_img: null,
				has_verified_email: true,
				oauth_client_id: "same-client",
				verified: true,
			}),
		);
		const b = await provider.getUserInfo({ accessToken: "t-b" } as any);

		expect(a?.user.email).toBe("user-a@reddit.invalid");
		expect(b?.user.email).toBe("user-b@reddit.invalid");
		expect(a?.user.email).not.toBe(b?.user.email);
	});

	it("lets mapProfileToUser supply a real email", async () => {
		mockedBetterFetch.mockResolvedValue(
			profileResponse({
				id: "reddit-user-2",
				name: "mapped",
				icon_img: null,
				has_verified_email: true,
				oauth_client_id: "client",
				verified: true,
			}),
		);
		const provider = reddit({
			...options,
			mapProfileToUser: () => ({ email: "real@example.com" }),
		});
		const res = await provider.getUserInfo({ accessToken: "t" } as any);

		expect(res?.user.email).toBe("real@example.com");
	});
});
