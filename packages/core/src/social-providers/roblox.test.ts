import { describe, expect, expectTypeOf, it, vi } from "vitest";

vi.mock(import("@better-fetch/fetch"), () => ({
	betterFetch: vi.fn(),
}));

import { betterFetch } from "@better-fetch/fetch";
import type { RobloxProfile } from "./roblox";
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

/**
 * @see https://create.roblox.com/docs/cloud/auth/oauth2-reference
 */
describe("Roblox userinfo claims", () => {
	it("accepts a subject-only response without the profile scope", async () => {
		const profile = { sub: "roblox-user-1" } satisfies RobloxProfile;
		mockedBetterFetch.mockResolvedValue({ data: profile, error: null });
		const provider = roblox({
			clientId: "roblox-app",
			clientSecret: "roblox-secret",
			disableDefaultScope: true,
			scope: ["openid"],
			mapProfileToUser(rawProfile) {
				expectTypeOf(rawProfile.sub).toEqualTypeOf<string>();
				expectTypeOf(rawProfile.preferred_username).toEqualTypeOf<
					string | undefined
				>();
				expectTypeOf(rawProfile.nickname).toEqualTypeOf<string | undefined>();
				expectTypeOf(rawProfile.name).toEqualTypeOf<string | undefined>();
				expectTypeOf(rawProfile.created_at).toEqualTypeOf<number | undefined>();
				expectTypeOf(rawProfile.profile).toEqualTypeOf<string | undefined>();
				expectTypeOf(rawProfile.picture).toEqualTypeOf<
					string | null | undefined
				>();
				expectTypeOf(rawProfile.custom_claim).toEqualTypeOf<unknown>();
				return {};
			},
		});
		const result = await provider.getUserInfo({ accessToken: "access-token" });

		expect(result?.user).toEqual({
			name: "",
			image: undefined,
			email: "roblox-user-1@roblox.placeholder.invalid",
			emailVerified: false,
		});
		expect(result?.data).toEqual(profile);
		expect(
			provider.accountSubject({
				profile,
				tokens: { accessToken: "access-token" },
			}),
		).toBe(profile.sub);
	});

	it.each([null, "https://example.com/avatar.png"])(
		"preserves the raw picture %s while normalizing the local image",
		async (picture) => {
			const profile = {
				sub: "roblox-user-1",
				nickname: "Builderman",
				picture,
			} satisfies RobloxProfile;
			mockedBetterFetch.mockResolvedValue({ data: profile, error: null });
			const mapProfileToUser = vi.fn((rawProfile: RobloxProfile) => {
				expect(rawProfile).toEqual(profile);
				return {};
			});
			const result = await roblox({
				clientId: "roblox-app",
				clientSecret: "roblox-secret",
				mapProfileToUser,
			}).getUserInfo({ accessToken: "access-token" });

			expect(result?.user.image).toBe(picture ?? undefined);
			expect(result?.user.name).toBe("Builderman");
			expect(result?.data.picture).toBe(picture);
			expect(mapProfileToUser).toHaveBeenCalledOnce();
		},
	);
});
