import { assertType, expect, it } from "vitest";
import type { KakaoProfile } from "./kakao";

/**
 * @see https://developers.kakao.com/docs/ko/kakaologin/rest-api#req-user-info
 */
it("accepts a Kakao profile without account information", () => {
	assertType<KakaoProfile>({ id: 123 });
});

import { kakao } from "./kakao";

/**
 * @see https://developers.kakao.com/docs/ko/kakaologin/rest-api#req-auth-code
 */
it("joins authorization scopes with commas", async () => {
	const provider = kakao({ clientId: "app", scope: ["openid"] });
	const url = await provider.createAuthorizationURL({
		state: "state",
		redirectURI: "https://example.com/callback",
		codeVerifier: "",
		scopes: ["gender"],
	});
	expect(url.searchParams.get("scope")).toBe(
		"account_email,profile_image,profile_nickname,openid,gender",
	);
	const custom = await kakao({
		clientId: "app",
		disableDefaultScope: true,
		scope: ["account_email", "gender"],
	}).createAuthorizationURL({
		state: "state",
		redirectURI: "https://example.com/callback",
		codeVerifier: "",
	});
	expect(custom.searchParams.get("scope")).toBe("account_email,gender");
});
