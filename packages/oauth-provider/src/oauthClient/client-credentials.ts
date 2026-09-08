import { APIError } from "better-auth/api";
import type { OAuthOptions, Scope } from "../types";
import type { GrantType, TokenEndpointAuthMethod } from "../types/oauth";

const USER_DELEGATED_SCOPES = new Set([
	"openid",
	"profile",
	"email",
	"offline_access",
]);

export function isUserDelegatedScope(scope: string): boolean {
	return USER_DELEGATED_SCOPES.has(scope);
}

export function normalizeClientCredentialsScopes(
	scopes: readonly string[],
): Scope[] {
	return [...new Set(scopes.map((scope) => scope.trim()).filter(Boolean))];
}

export function validateClientCredentialsScopes(
	scopes: readonly Scope[],
	grantTypes: readonly GrantType[],
	tokenEndpointAuthMethod: TokenEndpointAuthMethod | undefined,
	opts: OAuthOptions<Scope[]>,
): void {
	if (scopes.length === 0) return;
	if (!grantTypes.includes("client_credentials")) {
		throw new APIError("BAD_REQUEST", {
			error: "invalid_client_metadata",
			error_description:
				"client_credentials_scopes requires the client_credentials grant",
		});
	}
	if (tokenEndpointAuthMethod === "none") {
		throw new APIError("BAD_REQUEST", {
			error: "invalid_client_metadata",
			error_description:
				"public clients cannot be assigned client_credentials scopes",
		});
	}

	const providerScopes = new Set(opts.scopes ?? []);
	const invalidScopes = scopes.filter(
		(scope) => !providerScopes.has(scope) || isUserDelegatedScope(scope),
	);
	if (invalidScopes.length > 0) {
		throw new APIError("BAD_REQUEST", {
			error: "invalid_scope",
			error_description: `The following client_credentials scopes are invalid: ${invalidScopes.join(", ")}`,
		});
	}
}
