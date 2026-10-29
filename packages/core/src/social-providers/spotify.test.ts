import { betterFetch } from "@better-fetch/fetch";
import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import type { SpotifyProfile } from "./spotify";
import { spotify } from "./spotify";

vi.mock(import("@better-fetch/fetch"), () => ({ betterFetch: vi.fn() }));
const mockedBetterFetch = vi.mocked(betterFetch);
const credentials = {
	clientId: "provider-client",
	clientSecret: "provider-secret",
};
beforeEach(() => mockedBetterFetch.mockReset());

/**
 * @see https://developer.spotify.com/documentation/web-api/reference/get-current-users-profile
 */
describe("spotify profile fields", () => {
	it.each([
		{ displayName: null, images: [], name: undefined, image: undefined },
		{
			displayName: "Spotify User",
			images: [
				{ url: "https://example.com/avatar.png", height: null, width: 300 },
			],
			name: "Spotify User",
			image: "https://example.com/avatar.png",
		},
	])(
		"maps the display name $displayName",
		async ({ displayName, images, name, image }) => {
			const profile = {
				id: "spotify-user",
				display_name: displayName,
				email: "user@example.com",
				images,
			} satisfies SpotifyProfile;
			mockedBetterFetch.mockResolvedValueOnce({ data: profile, error: null });
			const mapProfileToUser = vi.fn((claims: SpotifyProfile) => {
				expectTypeOf(claims.display_name).toEqualTypeOf<string | null>();
				expectTypeOf(claims.images).toEqualTypeOf<
					{ url: string; height: number | null; width: number | null }[]
				>();
				return {};
			});
			const provider = spotify({ ...credentials, mapProfileToUser });
			const tokens = { accessToken: "spotify-token" };
			const result = await provider.getUserInfo(tokens);

			expect(result?.user.name).toBe(name);
			expect(result?.user.image).toBe(image);
			expect(result?.user.emailVerified).toBe(false);
			expect(result?.data).toEqual(profile);
			expect(mapProfileToUser).toHaveBeenCalledWith(profile);
			expect(provider.accountSubject({ tokens, profile })).toBe("spotify-user");
		},
	);

	it("lets profile mapping supply an email without the email scope", async () => {
		const profile = {
			id: "spotify-user",
			display_name: "Spotify User",
			images: [],
		} satisfies SpotifyProfile;
		mockedBetterFetch.mockResolvedValueOnce({ data: profile, error: null });
		const provider = spotify({
			...credentials,
			disableDefaultScope: true,
			scope: ["user-read-private"],
			mapProfileToUser(claims) {
				expectTypeOf(claims.email).toEqualTypeOf<string | undefined>();
				return { email: claims.email ?? `${claims.id}@example.com` };
			},
		});
		const authorizationURL = await provider.createAuthorizationURL({
			state: "state",
			redirectURI: "https://example.com/callback",
			codeVerifier: "verifier",
		});
		expect(authorizationURL.searchParams.get("scope")).toBe(
			"user-read-private",
		);
		const result = await provider.getUserInfo({ accessToken: "spotify-token" });

		expect(result?.user.email).toBe("spotify-user@example.com");
		expect(result?.user.emailVerified).toBe(false);
		expect(result?.data).toEqual(profile);
	});
});
