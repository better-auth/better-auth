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

	it("infers user additionalFields in customUserInfoClaims and claim callbacks", () => {
		const options: OAuthOptions = {
			loginPage: "/login",
			consentPage: "/consent",
			customUserInfoClaims: ({ user }) => {
				const role: string = user.role;
				const customField: unknown = user.customField;
				return { role, customField };
			},
			customIdTokenClaims: ({ user }) => {
				const role: string = user.role;
				return { role };
			},
			customAccessTokenClaims: ({ user }) => {
				const role: string = user?.role;
				return { role };
			},
			customTokenResponseFields: ({ user }) => {
				const role: string = user?.role;
				return { role };
			},
		};
		expectTypeOf(options.customUserInfoClaims).not.toBeUndefined();
	});
});

