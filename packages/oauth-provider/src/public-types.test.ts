import type {
	AuthMethod,
	ClientRegistrationEndSessionInput,
	ClientRegistrationRequest,
	GrantType,
	OAuthClient,
	OAuthClientAdministrativeResponse,
	OAuthClientRegistrationResponse,
	OAuthOptions,
	ResourceServerMetadata,
	SchemaClient,
	Scope,
	TokenEndpointAuthMethod,
} from "@better-auth/oauth-provider";
import { describe, expectTypeOf, it } from "vitest";

type ClientPrivilegeAction = Parameters<
	NonNullable<OAuthOptions["clientPrivileges"]>
>[0]["action"];
type ClientPrivilegeContext = Parameters<
	NonNullable<OAuthOptions["clientPrivileges"]>
>[0];

describe("public oauth-provider types", () => {
	it("types the registered-client logout policy from the package entrypoint", () => {
		expectTypeOf<
			ClientRegistrationEndSessionInput["registrationSource"]
		>().toEqualTypeOf<
			"dynamic" | "clientMetadataDocument" | "createOAuthClient"
		>();
		expectTypeOf<
			ClientRegistrationEndSessionInput["client"]["client_id"]
		>().toEqualTypeOf<string>();
		expectTypeOf<
			ClientRegistrationEndSessionInput["client"]
		>().not.toHaveProperty("enable_end_session");
		expectTypeOf<
			OAuthOptions["clientRegistrationEnableEndSession"]
		>().toEqualTypeOf<
			| boolean
			| ((
					input: ClientRegistrationEndSessionInput,
			  ) => boolean | Promise<boolean>)
			| undefined
		>();
	});

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
	 * @see https://datatracker.ietf.org/doc/html/rfc9728#section-2
	 */
	it("types protected resource metadata arrays as in RFC 9728", () => {
		expectTypeOf<
			ResourceServerMetadata["authorization_details_types_supported"]
		>().toEqualTypeOf<string[] | undefined>();
	});
});
