import type {
	AuthMethod,
	ClientRegistrationRequest,
	GrantType,
	OAuthClient,
	OAuthClientAdministrativeResponse,
	OAuthClientRegistrationResponse,
	OAuthOptions,
	PendingClientApproval,
	PendingClientApprovalContext,
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

type ApprovePendingClient = NonNullable<OAuthOptions["approvePendingClient"]>;

describe("public oauth-provider types", () => {
	it("types the pending client approval callback", () => {
		expectTypeOf<
			Parameters<ApprovePendingClient>[0]
		>().toEqualTypeOf<PendingClientApprovalContext>();
		expectTypeOf<
			PendingClientApprovalContext["client"]
		>().toEqualTypeOf<OAuthClient>();
		expectTypeOf<
			PendingClientApprovalContext["consentReferenceId"]
		>().toEqualTypeOf<string | undefined>();
		expectTypeOf<
			PendingClientApproval["clientReference"]
		>().toEqualTypeOf<string>();
		expectTypeOf<ReturnType<ApprovePendingClient>>().toEqualTypeOf<
			PendingClientApproval | false | Promise<PendingClientApproval | false>
		>();
		expectTypeOf<SchemaClient>().toHaveProperty("pending");
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
});
