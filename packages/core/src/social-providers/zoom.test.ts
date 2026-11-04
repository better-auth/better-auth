import { assertType, it } from "vitest";
import type { ZoomProfile } from "./zoom";

/**
 * @see https://developers.zoom.us/docs/api/users/#tag/users/GET/users/{userId}
 */
it("types phone, WeChat, and Alipay login types", () => {
	assertType<ZoomProfile["login_types"]>([11, 21, 23]);
});
