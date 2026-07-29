import type {
	AuthMethod,
	ClientRegistrationRequest,
	GrantType,
	OAuthClient,
	OAuthOptions,
	SchemaClient,
	TokenEndpointAuthMethod,
} from "@better-auth/oauth-provider";
import { describe, expect, expectTypeOf, it } from "vitest";
import * as oauthProviderExports from "./index";

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
		expectTypeOf<OAuthClient>().toHaveProperty("application_type");
		expectTypeOf<ClientRegistrationRequest>().not.toHaveProperty("public");
		expectTypeOf<ClientRegistrationRequest>().not.toHaveProperty("type");
		expectTypeOf<SchemaClient>().toHaveProperty("applicationType");
		expectTypeOf<SchemaClient>().not.toHaveProperty("public");
		expectTypeOf<SchemaClient>().not.toHaveProperty("type");
	});

	it("does not expose registration implementation helpers from the package root", () => {
		expect(oauthProviderExports).not.toHaveProperty("checkOAuthClient");
		expect(oauthProviderExports).not.toHaveProperty("oauthToSchema");
	});
});
