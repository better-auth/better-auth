import type {
	AuthMethod,
	GrantType,
	OAuthOptions,
	Scope,
	TokenEndpointAuthMethod,
} from "@better-auth/oauth-provider";
import type { BetterAuthOptions } from "better-auth";
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

/**
 * The claim callbacks receive the user, so a deployment's configured
 * `additionalFields` must arrive with their declared types rather than as
 * `unknown` — otherwise every custom claim needs a cast.
 *
 * @see https://github.com/better-auth/better-auth/issues/10652
 */
describe("claim callbacks infer configured additional user fields", () => {
	const authOptions = {
		user: {
			additionalFields: {
				phoneNumber: { type: "string", required: true },
				loyaltyPoints: { type: "number", required: false },
			},
		},
	} satisfies BetterAuthOptions;

	type Options = OAuthOptions<Scope[], typeof authOptions>;

	it("types additional fields on customUserInfoClaims", () => {
		type Info = Parameters<NonNullable<Options["customUserInfoClaims"]>>[0];

		expectTypeOf<Info["user"]["phoneNumber"]>().toEqualTypeOf<string>();
		expectTypeOf<Info["user"]["email"]>().toEqualTypeOf<string>();
	});

	it("types additional fields on customIdTokenClaims", () => {
		type Info = Parameters<NonNullable<Options["customIdTokenClaims"]>>[0];

		expectTypeOf<Info["user"]["phoneNumber"]>().toEqualTypeOf<string>();
	});

	it("types additional fields on customAccessTokenClaims", () => {
		type Info = Parameters<NonNullable<Options["customAccessTokenClaims"]>>[0];

		expectTypeOf<
			NonNullable<Info["user"]>["phoneNumber"]
		>().toEqualTypeOf<string>();
	});

	it("leaves the user type intact when no options are supplied", () => {
		type Info = Parameters<
			NonNullable<OAuthOptions["customUserInfoClaims"]>
		>[0];

		expectTypeOf<Info["user"]["email"]>().toEqualTypeOf<string>();
	});
});
