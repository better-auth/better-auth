/**
 * JSON-LD context every Solid-OIDC Client Identifier Document declares.
 *
 * @see https://solidproject.org/TR/oidc#clientids-document
 */
export const SOLID_OIDC_CONTEXT_URL =
	"https://www.w3.org/ns/solid/oidc-context.jsonld";

/** Media type a Client Identifier Document must be served as. */
export const CLIENT_ID_DOCUMENT_CONTENT_TYPE = "application/ld+json";

/**
 * The scopes Better Auth requests from a Solid OpenID Provider.
 *
 * `webid` is what makes the provider put the `webid` claim in the ID token, and
 * `offline_access` is what makes it issue the refresh token the plugin binds to
 * a DPoP key.
 *
 * @see https://solidproject.org/TR/oidc#authorization-code-pkce-flow
 */
export const DEFAULT_SOLID_SCOPES = ["openid", "webid", "offline_access"];

export interface SolidClientIdDocument {
	"@context": string[];
	client_id: string;
	client_name?: string | undefined;
	client_uri?: string | undefined;
	logo_uri?: string | undefined;
	tos_uri?: string | undefined;
	policy_uri?: string | undefined;
	contacts?: string[] | undefined;
	redirect_uris: string[];
	post_logout_redirect_uris?: string[] | undefined;
	grant_types: string[];
	response_types: string[];
	scope: string;
	token_endpoint_auth_method: string;
	application_type: string;
	require_auth_time?: boolean | undefined;
	/** Provider-specific or deployment-specific additions. */
	[key: string]: unknown;
}

export interface BuildClientIdDocumentOptions {
	/**
	 * The absolute URL this document is served from. Solid-OIDC requires
	 * `client_id` to be the document's own dereferenceable URI, so the two are
	 * always the same value.
	 */
	clientId: string;
	redirectURIs: string[];
	clientName?: string | undefined;
	clientURI?: string | undefined;
	logoURI?: string | undefined;
	tosURI?: string | undefined;
	policyURI?: string | undefined;
	contacts?: string[] | undefined;
	postLogoutRedirectURIs?: string[] | undefined;
	scopes?: string[] | undefined;
	/** Merged last, so a deployment can add or override any member. */
	additionalMetadata?: Record<string, unknown> | undefined;
}

function assertHttpsUri(value: string, field: string) {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new Error(
			`Solid Client Identifier Document ${field} must be an absolute URL, received "${value}"`,
		);
	}
	// `http:` is allowed on loopback so a local dev server can be dereferenced
	// by a Solid provider running on the same machine.
	const isLoopback =
		url.hostname === "localhost" ||
		url.hostname === "127.0.0.1" ||
		url.hostname === "[::1]";
	if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback)) {
		throw new Error(
			`Solid Client Identifier Document ${field} must use https, received "${value}"`,
		);
	}
}

/**
 * Builds the Client Identifier Document a Solid OpenID Provider dereferences
 * instead of looking the client up in a registration database.
 *
 * `token_endpoint_auth_method` is fixed to `none`: a client identified by a
 * public document has no secret to authenticate with, and its requests are
 * instead bound by PKCE and DPoP.
 *
 * @see https://solidproject.org/TR/oidc#clientids-document
 */
export function buildSolidClientIdDocument({
	clientId,
	redirectURIs,
	clientName,
	clientURI,
	logoURI,
	tosURI,
	policyURI,
	contacts,
	postLogoutRedirectURIs,
	scopes = DEFAULT_SOLID_SCOPES,
	additionalMetadata,
}: BuildClientIdDocumentOptions): SolidClientIdDocument {
	assertHttpsUri(clientId, "client_id");
	if (redirectURIs.length === 0) {
		throw new Error(
			"Solid Client Identifier Document requires at least one redirect URI",
		);
	}
	for (const redirectURI of redirectURIs) {
		assertHttpsUri(redirectURI, "redirect_uris");
	}
	for (const postLogoutRedirectURI of postLogoutRedirectURIs ?? []) {
		assertHttpsUri(postLogoutRedirectURI, "post_logout_redirect_uris");
	}

	const document: SolidClientIdDocument = {
		"@context": [SOLID_OIDC_CONTEXT_URL],
		client_id: clientId,
		client_name: clientName,
		client_uri: clientURI,
		logo_uri: logoURI,
		tos_uri: tosURI,
		policy_uri: policyURI,
		contacts: contacts?.length ? contacts : undefined,
		redirect_uris: redirectURIs,
		post_logout_redirect_uris: postLogoutRedirectURIs?.length
			? postLogoutRedirectURIs
			: undefined,
		grant_types: scopes.includes("offline_access")
			? ["authorization_code", "refresh_token"]
			: ["authorization_code"],
		response_types: ["code"],
		scope: scopes.join(" "),
		token_endpoint_auth_method: "none",
		application_type: "web",
		require_auth_time: false,
		...additionalMetadata,
	};

	for (const [key, value] of Object.entries(document)) {
		if (value === undefined) delete document[key];
	}
	return document;
}
