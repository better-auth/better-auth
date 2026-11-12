import type {
	AuthMethod,
	ClientRegistrationRequest,
	GrantType,
	OAuthClient,
	OAuthClientAdministrativeResponse,
	OAuthClientRegistrationResponse,
	OAuthOptions,
	OAuthProviderApi,
	SchemaClient,
	Scope,
	StoredAuthorizationQuery,
	TokenEndpointAuthMethod,
} from "@better-auth/oauth-provider";
import type { Session } from "better-auth/types";
import { describe, expectTypeOf, it } from "vitest";

type ClientPrivilegeAction = Parameters<
	NonNullable<OAuthOptions["clientPrivileges"]>
>[0]["action"];
type ClientPrivilegeContext = Parameters<
	NonNullable<OAuthOptions["clientPrivileges"]>
>[0];

describe("public oauth-provider types", () => {
	it("exports the signed-query verifier with a server-side secret", () => {
		expectTypeOf<
			typeof import("@better-auth/oauth-provider").verifyOAuthQueryParams
		>().toEqualTypeOf<
			(oauth_query: string, secret: string) => Promise<boolean>
		>();
	});

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
		expectTypeOf<OAuthClient["application_type"]>().toEqualTypeOf<
			"web" | "native" | null | undefined
		>();
		expectTypeOf<SchemaClient["applicationType"]>().toEqualTypeOf<
			"web" | "native" | null | undefined
		>();
		expectTypeOf<ClientRegistrationRequest["application_type"]>().toEqualTypeOf<
			"web" | "native" | undefined
		>();
		expectTypeOf<OAuthOptions>().not.toHaveProperty(
			"clientCredentialGrantDefaultScopes",
		);
		expectTypeOf<ClientRegistrationRequest>().not.toHaveProperty("public");
		expectTypeOf<ClientRegistrationRequest>().not.toHaveProperty("type");
		expectTypeOf<OAuthClient>().not.toHaveProperty("public");
		expectTypeOf<OAuthClient>().not.toHaveProperty("type");
		expectTypeOf<OAuthClientRegistrationResponse["resources"]>().toEqualTypeOf<
			string[] | undefined
		>();
		expectTypeOf<OAuthClientRegistrationResponse>().not.toHaveProperty(
			"client_credentials_scopes",
		);
		expectTypeOf<
			OAuthClientAdministrativeResponse["resources"]
		>().toEqualTypeOf<string[] | undefined>();
		expectTypeOf<
			OAuthClientAdministrativeResponse["client_credentials_scopes"]
		>().toEqualTypeOf<Scope[]>();
		expectTypeOf<OAuthClientAdministrativeResponse>().not.toHaveProperty(
			"public",
		);
		expectTypeOf<OAuthClientAdministrativeResponse>().not.toHaveProperty(
			"type",
		);
		expectTypeOf<SchemaClient>().toHaveProperty("applicationType");
		expectTypeOf<SchemaClient>().toHaveProperty("clientCredentialsScopes");
		expectTypeOf<SchemaClient>().not.toHaveProperty("public");
		expectTypeOf<SchemaClient>().not.toHaveProperty("type");
		expectTypeOf<"configure-client-credentials-scopes">().toMatchTypeOf<ClientPrivilegeAction>();
		expectTypeOf<"configure-client-credentials">().not.toMatchTypeOf<ClientPrivilegeAction>();
		expectTypeOf<ClientPrivilegeContext["clientId"]>().toEqualTypeOf<
			string | undefined
		>();
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/10414
	 */
	it("passes a validated authorization request on to code issuance", () => {
		type Validate = OAuthProviderApi["validateAuthorizationRequest"];
		type Issue = OAuthProviderApi["issueAuthorizationCode"];
		expectTypeOf<Parameters<Validate>[0]["mode"]>().toEqualTypeOf<
			"redirect" | "headless"
		>();
		expectTypeOf<ReturnType<Validate>>().toEqualTypeOf<
			Promise<StoredAuthorizationQuery>
		>();
		expectTypeOf<Parameters<Issue>[0]["request"]>().toEqualTypeOf<
			Awaited<ReturnType<Validate>>
		>();
		expectTypeOf<Parameters<Issue>[0]["session"]>().toEqualTypeOf<Session>();
		expectTypeOf<ReturnType<Issue>>().toEqualTypeOf<
			Promise<{ code: string; expiresAt: Date; url?: string }>
		>();
	});
});
