import { assertType, it } from "vitest";
import type { LoginType, ZoomProfile } from "./zoom";

/**
 * @see https://developers.zoom.us/docs/api/users/#tag/users/GET/users/{userId}
 */
it.each([11, 21, 23] as const)("accepts Zoom login type %s", (loginType) => {
	assertType<LoginType>(loginType);
	assertType<ZoomProfile["login_types"]>([loginType]);
});
