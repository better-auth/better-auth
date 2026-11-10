import { UnsecuredJWT } from "jose";
import { describe, expect, it } from "vitest";
import { twitch } from "./twitch";

/**
 * @see https://openid.net/specs/openid-connect-core-1_0.html#RefreshTokenResponse
 * @see https://dev.twitch.tv/docs/authentication/refresh-tokens/
 */
describe("twitch.getUserInfo", () => {
	it("maps the profile from a stored ID token after it expires", async () => {
		const profile = {
			sub: "provider-user",
			preferred_username: "Provider User",
			email: "user@example.com",
			email_verified: true,
			picture: "https://example.com/avatar.png",
			exp: Math.floor(Date.now() / 1000) - 3600,
		};

		const result = await twitch({
			clientId: "twitch-client",
			clientSecret: "client-secret",
		}).getUserInfo({
			idToken: new UnsecuredJWT(profile).encode(),
			accessToken: "refreshed-access-token",
		});

		expect(result?.user).toEqual({
			name: profile.preferred_username,
			email: profile.email,
			image: profile.picture,
			emailVerified: true,
		});
	});
});
