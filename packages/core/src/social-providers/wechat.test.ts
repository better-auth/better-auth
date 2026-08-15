import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@better-fetch/fetch", () => ({
	betterFetch: vi.fn(),
}));

import { betterFetch } from "@better-fetch/fetch";

import { wechat } from "./wechat";

const mockedBetterFetch = vi.mocked(betterFetch);

const options = {
	clientId: "wx-app",
	clientSecret: "wx-secret",
};

function profileResponse(profile: Record<string, unknown>) {
	return { data: profile, error: null } as Awaited<
		ReturnType<typeof betterFetch>
	>;
}

describe("wechat.getUserInfo (no provider email)", () => {
	beforeEach(() => {
		mockedBetterFetch.mockReset();
	});

	it("synthesizes a non-routable placeholder email keyed to unionid", async () => {
		mockedBetterFetch.mockResolvedValue(
			profileResponse({
				openid: "open-123",
				unionid: "union-abc",
				nickname: "WeChat User",
				headimgurl: "https://example.com/avatar.png",
			}),
		);
		const provider = wechat(options);
		const res = await provider.getUserInfo({
			accessToken: "access-token",
			openid: "open-123",
		} as any);

		expect(res?.user.email).toBe("union-abc@wechat.invalid");
		expect(res?.user.emailVerified).toBe(false);
		expect(res?.user.id).toBe("union-abc");
	});

	it("falls back to openid for the placeholder when unionid is absent", async () => {
		mockedBetterFetch.mockResolvedValue(
			profileResponse({
				openid: "open-456",
				nickname: "No Union",
				headimgurl: "https://example.com/avatar.png",
			}),
		);
		const provider = wechat(options);
		const res = await provider.getUserInfo({
			accessToken: "access-token",
			openid: "open-456",
		} as any);

		expect(res?.user.email).toBe("open-456@wechat.invalid");
		expect(res?.user.emailVerified).toBe(false);
	});

	it("lets mapProfileToUser supply a real email", async () => {
		mockedBetterFetch.mockResolvedValue(
			profileResponse({
				openid: "open-789",
				unionid: "union-xyz",
				nickname: "Mapped User",
				headimgurl: "https://example.com/avatar.png",
			}),
		);
		const provider = wechat({
			...options,
			mapProfileToUser: () => ({ email: "real@example.com" }),
		});
		const res = await provider.getUserInfo({
			accessToken: "access-token",
			openid: "open-789",
		} as any);

		expect(res?.user.email).toBe("real@example.com");
	});

	it("returns null when the token carries no openid", async () => {
		const provider = wechat(options);
		const res = await provider.getUserInfo({
			accessToken: "access-token",
		} as any);

		expect(res).toBeNull();
		expect(mockedBetterFetch).not.toHaveBeenCalled();
	});
});
