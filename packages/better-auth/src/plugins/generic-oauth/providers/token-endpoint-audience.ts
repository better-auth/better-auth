import type { BaseOAuthProviderOptions } from "../index";

/**
 * Withholds the discovered issuer from a `private_key_jwt` assertion getter,
 * so a getter that signs for the issuer when it knows one signs for the token
 * endpoint instead. For providers that document only their token endpoint URL
 * as the client assertion audience.
 */
export function signForTokenEndpoint(
	tokenEndpointAuth: BaseOAuthProviderOptions["tokenEndpointAuth"],
): BaseOAuthProviderOptions["tokenEndpointAuth"] {
	if (tokenEndpointAuth?.method !== "private_key_jwt") {
		return tokenEndpointAuth;
	}
	return {
		method: "private_key_jwt",
		getClientAssertion: ({ issuer: _issuer, ...context }) =>
			tokenEndpointAuth.getClientAssertion(context),
	};
}
