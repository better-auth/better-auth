import { assertType, it } from "vitest";
import type { PaybinProfile } from "./paybin";

/** @see https://developers.paybin.io/knowledge-center/oidc#available-scopes */
it("accepts Paybin claims without email access", () => {
	assertType<PaybinProfile>({ sub: "paybin-user" });
});
