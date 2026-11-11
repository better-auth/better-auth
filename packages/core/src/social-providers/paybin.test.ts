import { UnsecuredJWT } from "jose";
import { describe, expect, it } from "vitest";
import { paybin } from "./paybin";

/**
 * @see https://openid.net/specs/openid-connect-core-1_0.html#RefreshTokenResponse
 */
describe("paybin.getUserInfo", () => {
	it("maps the profile from a stored ID token after it expires", async () => {
		const profile = {
			sub: "provider-user",
			name: "Provider User",
			email: "user@example.com",
			email_verified: true,
			picture: "https://example.com/avatar.png",
			exp: Math.floor(Date.now() / 1000) - 3600,
		};

		const result = await paybin({
			clientId: "paybin-client",
			clientSecret: "client-secret",
		}).getUserInfo({
			idToken: new UnsecuredJWT(profile).encode(),
			accessToken: "refreshed-access-token",
		});

		expect(result?.user).toEqual({
			name: profile.name,
			email: profile.email,
			image: profile.picture,
			emailVerified: true,
		});
	});
});
