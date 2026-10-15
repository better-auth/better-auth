import { UnsecuredJWT } from "jose";
import { assertType, expect, it } from "vitest";
import type { TwitchProfile } from "./twitch";
import { twitch } from "./twitch";

/**
 * @see https://dev.twitch.tv/docs/authentication/getting-tokens-oidc/#requesting-claims
 */
it("accepts an unverified email with no optional Twitch claims", async () => {
	const profile = { sub: "twitch-user", email: null, email_verified: false };
	assertType<TwitchProfile>(profile);
	const provider = twitch({ clientId: "twitch-app", claims: [] });
	const url = await provider.createAuthorizationURL({
		state: "state",
		redirectURI: "https://example.com/callback",
		codeVerifier: "",
	});
	expect(JSON.parse(url.searchParams.get("claims")!)).toEqual({
		id_token: { email: null, email_verified: null },
	});

	const result = await provider.getUserInfo({
		idToken: new UnsecuredJWT(profile).encode(),
	});

	expect(result?.user).toEqual({
		name: undefined,
		email: null,
		image: undefined,
		emailVerified: false,
	});
	expect(result?.data).toMatchObject(profile);
});
