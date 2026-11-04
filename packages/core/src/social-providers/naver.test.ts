import { assertType, it } from "vitest";
import type { NaverProfile } from "./naver";

/**
 * @see https://developers.naver.com/docs/login/devguide/devguide.md
 */
it("accepts a Naver profile with only the user identifier", () => {
	assertType<NaverProfile>({
		resultcode: "00",
		message: "success",
		response: { id: "naver-user" },
	});
});
