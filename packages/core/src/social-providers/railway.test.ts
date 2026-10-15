import { assertType, it } from "vitest";
import type { RailwayProfile } from "./railway";

/**
 * @see https://docs.railway.com/integrations/oauth/scopes-and-user-consent
 */
it("accepts Railway profiles with only the openid subject", () => {
	assertType<RailwayProfile>({ sub: "railway-user" });
});
