import type {
	AuthMethod,
	GrantType,
	OAuthOptions,
	TokenEndpointAuthMethod,
} from "@better-auth/oauth-provider";
import { describe, expectTypeOf, it } from "vitest";

describe("public oauth-provider types", () => {
	/**
	 * @see https://github.com/better-auth/better-auth/issues/9378
	 */
	it("exports option helper types from the package entrypoint", () => {
		expectTypeOf<OAuthOptions["grantTypes"]>().toEqualTypeOf<
			GrantType[] | undefined
		>();
		expectTypeOf<TokenEndpointAuthMethod>().toEqualTypeOf<
			AuthMethod | "none"
		>();
	});
});
