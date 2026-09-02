import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(import("@better-fetch/fetch"), () => ({
	betterFetch: vi.fn(),
}));

import { betterFetch } from "@better-fetch/fetch";
import type { CloudflareProfile } from "./cloudflare";
import { cloudflare } from "./cloudflare";

const mockedBetterFetch = vi.mocked(betterFetch);

function userResponse(profile: CloudflareProfile) {
	return {
		data: {
			success: true,
			errors: [],
			result: profile,
		},
		error: null,
	} as Awaited<ReturnType<typeof betterFetch>>;
}

describe("cloudflare.getUserInfo", () => {
	beforeEach(() => {
		mockedBetterFetch.mockReset();
	});

	it("maps the Cloudflare profile without redefining provider identity", async () => {
		mockedBetterFetch.mockResolvedValue(
			userResponse({
				id: "cloudflare-user-1",
				email: "user@example.com",
				first_name: "Cloudflare",
				last_name: "User",
			}),
		);
		const provider = cloudflare({
			clientId: "cloudflare-client",
			clientSecret: "cloudflare-secret",
		});

		const result = await provider.getUserInfo({ accessToken: "access-token" });

		expect(result?.user).toEqual({
			name: "Cloudflare User",
			email: "user@example.com",
			emailVerified: false,
		});
		expect(result?.user).not.toHaveProperty("id");
		if (!result) return;
		expect(
			await provider.accountSubject({
				tokens: { accessToken: "access-token" },
				profile: result.data,
			}),
		).toBe("cloudflare-user-1");
	});

	it("uses the email as the display name when Cloudflare omits both names", async () => {
		mockedBetterFetch.mockResolvedValue(
			userResponse({
				id: "cloudflare-user-2",
				email: "nameless@example.com",
			}),
		);
		const provider = cloudflare({
			clientId: "cloudflare-client",
			clientSecret: "cloudflare-secret",
		});

		const result = await provider.getUserInfo({ accessToken: "access-token" });

		expect(result?.user.name).toBe("nameless@example.com");
	});
});
