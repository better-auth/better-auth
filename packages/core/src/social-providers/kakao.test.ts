import { assertType, it } from "vitest";
import type { KakaoProfile } from "./kakao";

/**
 * @see https://developers.kakao.com/docs/ko/kakaologin/rest-api#req-user-info
 */
it("accepts a Kakao profile without account information", () => {
	assertType<KakaoProfile>({ id: 123 });
});
