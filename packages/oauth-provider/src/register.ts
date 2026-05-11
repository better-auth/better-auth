import type { GenericEndpointContext } from "@better-auth/core";
import { APIError, getSessionFromCtx } from "better-auth/api";
import { generateRandomString } from "better-auth/crypto";
import { toExpJWT } from "better-auth/plugins";
import type { OAuthOptions, SchemaClient, Scope } from "./types";
import type { OAuthClient, TokenEndpointAuthMethod } from "./types/oauth";
import { parseClientMetadata, storeClientSecret } from "./utils";

/**
 * Resolves the auth method and type for unauthenticated DCR.
 * Overrides confidential methods to "none" per RFC 7591 Section 3.2.1.
 * When overriding, clears type "web" since it is only valid for confidential clients.
 */
function resolveUnauthenticatedAuth(body: OAuthClient): {
	tokenEndpointAuthMethod: TokenEndpointAuthMethod;
	type: OAuthClient["type"];
} {
	if (body.token_endpoint_auth_method === "none") {
		return {
			tokenEndpointAuthMethod: "none",
			type: body.type,
		};
	}
	return {
		tokenEndpointAuthMethod: "none",
		type: body.type === "web" ? undefined : body.type,
	};
}

export async function registerEndpoint(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
) {
	if (!opts.allowDynamicClientRegistration) {
		throw new APIError("FORBIDDEN", {
			error: "access_denied",
			error_description: "Client registration is disabled",
		});
	}

	const body = ctx.body as OAuthClient;
	const session = await getSessionFromCtx(ctx);

	if (!(session || opts.allowUnauthenticatedClientRegistration)) {
		throw new APIError("UNAUTHORIZED", {
			error: "invalid_token",
			error_description: "Authentication required for client registration",
		});
	}

	if (!session) {
		if (body.grant_types?.includes("client_credentials")) {
			throw new APIError("BAD_REQUEST", {
				error: "invalid_client_metadata",
				error_description:
					"client_credentials grant requires authenticated registration",
			});
		}

		const resolved = resolveUnauthenticatedAuth(body);
		body.token_endpoint_auth_method = resolved.tokenEndpointAuthMethod;
		body.type = resolved.type;
	}

	if (!body.scope) {
		body.scope = (opts.clientRegistrationDefaultScopes ?? opts.scopes)?.join(
			" ",
		);
	}

	return createOAuthClientEndpoint(ctx, opts, {
		isRegister: true,
	});
}

export async function checkOAuthClient(
	client: OAuthClient,
	opts: OAuthOptions<Scope[]>,
	settings?: {
		isRegister?: boolean;
	},
) {
	// Determine whether registration request for public client
	// https://datatracker.ietf.org/doc/html/rfc7591#section-2
	const isPublic = client.token_endpoint_auth_method === "none";

	// Check value of type, if sent, matches isPublic
	if (client.type) {
		if (
			isPublic &&
			!(client.type === "native" || client.type === "user-agent-based")
		) {
			throw new APIError("BAD_REQUEST", {
				error: "invalid_client_metadata",
				error_description: `Type must be 'native' or 'user-agent-based' for public applications`,
			});
		} else if (!isPublic && !(client.type === "web")) {
			throw new APIError("BAD_REQUEST", {
				error: "invalid_client_metadata",
				error_description: `Type must be 'web' for confidential applications`,
			});
		}
	}

	// Validate redirect URIs for redirect-based flows
	if (
		(!client.grant_types ||
			client.grant_types.includes("authorization_code")) &&
		(!client.redirect_uris || client.redirect_uris.length === 0)
	) {
		throw new APIError("BAD_REQUEST", {
			error: "invalid_redirect_uri",
			error_description:
				"Redirect URIs are required for authorization_code and implicit grant types",
		});
	}

	// Validate correlation between grant_types and response_types
	const grantTypes = client.grant_types ?? ["authorization_code"];
	const responseTypes = client.response_types ?? ["code"];
	if (
		grantTypes.includes("authorization_code") &&
		!responseTypes.includes("code")
	) {
		throw new APIError("BAD_REQUEST", {
			error: "invalid_client_metadata",
			error_description:
				"When 'authorization_code' grant type is used, 'code' response type must be included",
		});
	}

	// Validate subject_type
	if (client.subject_type !== undefined) {
		if (
			client.subject_type !== "public" &&
			client.subject_type !== "pairwise"
		) {
			throw new APIError("BAD_REQUEST", {
				error: "invalid_client_metadata",
				error_description: `subject_type must be "public" or "pairwise"`,
			});
		}
		if (client.subject_type === "pairwise" && !opts.pairwiseSecret) {
			throw new APIError("BAD_REQUEST", {
				error: "invalid_client_metadata",
				error_description:
					"pairwise subject_type requires server pairwiseSecret configuration",
			});
		}
		// Per OIDC Core §8.1, when multiple redirect_uris have different hosts,
		// a sector_identifier_uri is required (not yet supported). Reject registration
		// until sector_identifier_uri support is added.
		if (
			client.subject_type === "pairwise" &&
			client.redirect_uris &&
			client.redirect_uris.length > 1
		) {
			const hosts = new Set(
				client.redirect_uris.map((uri: string) => new URL(uri).host),
			);
			if (hosts.size > 1) {
				throw new APIError("BAD_REQUEST", {
					error: "invalid_client_metadata",
					error_description:
						"pairwise clients with redirect_uris on different hosts require a sector_identifier_uri, which is not yet supported. All redirect_uris must share the same host.",
				});
			}
		}
	}

	// Check requested application scopes
	const requestedScopes = (client?.scope as string | undefined)
		?.split(" ")
		.filter((v) => v.length);
	const allowedScopes = settings?.isRegister
		? (opts.clientRegistrationAllowedScopes ?? opts.scopes)
		: opts.scopes;
	if (allowedScopes) {
		const validScopes = new Set(allowedScopes);
		for (const requestedScope of requestedScopes ?? []) {
			if (!validScopes?.has(requestedScope)) {
				throw new APIError("BAD_REQUEST", {
					error: "invalid_scope",
					error_description: `cannot request scope ${requestedScope}`,
				});
			}
		}
	}

	if (settings?.isRegister && client.require_pkce === false) {
		throw new APIError("BAD_REQUEST", {
			error: "invalid_client_metadata",
			error_description: `pkce is required for registered clients.`,
		});
	}
}

export async function createOAuthClientEndpoint(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	settings: {
		isRegister: boolean;
	},
) {
	const body = ctx.body as OAuthClient;
	const session = await getSessionFromCtx(ctx);

	// Determine whether registration request for public client
	// https://datatracker.ietf.org/doc/html/rfc7591#section-2
	const isPublic = body.token_endpoint_auth_method === "none";

	// Check if client parameters are valid combination
	await checkOAuthClient(ctx.body, opts, settings);

	// Generate clientId and clientSecret based on its type
	const clientId =
		opts.generateClientId?.() || generateRandomString(32, "a-z", "A-Z");
	const clientSecret = isPublic
		? undefined
		: opts.generateClientSecret?.() || generateRandomString(32, "a-z", "A-Z");
	const storedClientSecret = clientSecret
		? await storeClientSecret(ctx, opts, clientSecret)
		: undefined;

	// Create the client with the existing schema
	const iat = Math.floor(Date.now() / 1000);
	const referenceId = opts.clientReference
		? await opts.clientReference({
				user: session?.user,
				session: session?.session,
			})
		: undefined;
	const schema = oauthToSchema({
		...((body ?? {}) as OAuthClient),
		// Dynamic registration should not have disabled defined
		disabled: undefined,
		// Jwks unsupported
		jwks: undefined,
		jwks_uri: undefined,
		// Required if client secret is issued
		client_secret_expires_at: storedClientSecret
			? settings.isRegister && opts?.clientRegistrationClientSecretExpiration
				? toExpJWT(opts.clientRegistrationClientSecretExpiration, iat)
				: 0
			: undefined,
		// Override
		client_id: clientId,
		client_secret: storedClientSecret,
		client_id_issued_at: iat,
		public: isPublic,
		user_id: referenceId ? undefined : session?.session.userId,
		reference_id: referenceId,
	});
	const client = await ctx.context.adapter.create<SchemaClient<Scope[]>>({
		model: "oauthClient",
		data: {
			...schema,
			createdAt: new Date(iat * 1000),
			updatedAt: new Date(iat * 1000),
		},
	});
	// Format the response according to RFC7591
	return ctx.json(
		schemaToOAuth({
			...client,
			clientSecret: clientSecret
				? (opts.prefix?.clientSecret ?? "") + clientSecret
				: undefined,
		}),
		{
			status: 201,
			headers: {
				"Cache-Control": "no-store",
				Pragma: "no-cache",
			},
		},
	);
}

/**
 * Converts an OAuth 2.0 Dynamic Client Schema to a Database Schema
 *
 * @param input
 * @returns
 */
export function oauthToSchema(input: OAuthClient): SchemaClient<Scope[]> {
	const {
		// Important Fields
		client_id: clientId,
		client_secret: clientSecret,
		client_secret_expires_at: _expiresAt,
		scope: _scope,
		// Recommended client data
		user_id: userId,
		client_id_issued_at: _createdAt,
		// UI Metadata
		client_name: name,
		client_uri: uri,
		logo_uri: icon,
		contacts,
		tos_uri: tos,
		policy_uri: policy,
		// Jwks (only one can be used)
		jwks: _jwks,
		jwks_uri: _jwksUri,
		// User Software Identifiers
		software_id: softwareId,
		software_version: softwareVersion,
		software_statement: softwareStatement,
		// Authentication Metadata
		redirect_uris: redirectUris,
		post_logout_redirect_uris: postLogoutRedirectUris,
		token_endpoint_auth_method: tokenEndpointAuthMethod,
		grant_types: grantTypes,
		response_types: responseTypes,
		// RFC6749 Spec
		public: _public,
		type,
		// Not Part of RFC7591 Spec
		disabled,
		skip_consent: skipConsent,
		enable_end_session: enableEndSession,
		require_pkce: requirePKCE,
		subject_type: subjectType,
		reference_id: referenceId,
		metadata: inputMetadata,
		// All other metadata
		...rest
	} = input;

	// Type conversions
	const expiresAt = _expiresAt ? new Date(_expiresAt * 1000) : undefined;
	const createdAt = _createdAt ? new Date(_createdAt * 1000) : undefined;
	const scopes = _scope?.split(" ");
	const metadataObj = {
		...(rest && Object.keys(rest).length ? rest : {}),
		...(inputMetadata && typeof inputMetadata === "object"
			? inputMetadata
			: {}),
	};
	const metadata = Object.keys(metadataObj).length
		? JSON.stringify(metadataObj)
		: undefined;

	return {
		// Important Fields
		clientId,
		clientSecret,
		disabled,
		scopes,
		// Recommended client data
		userId,
		createdAt,
		expiresAt,
		// UI Metadata
		name,
		uri,
		icon,
		contacts,
		tos,
		policy,
		// User Software Identifiers
		softwareId,
		softwareVersion,
		softwareStatement,
		// Authentication Metadata
		redirectUris,
		postLogoutRedirectUris,
		tokenEndpointAuthMethod,
		grantTypes,
		responseTypes,
		// RFC6749 Spec
		public: _public,
		type,
		// All other metadata
		skipConsent,
		enableEndSession,
		requirePKCE,
		subjectType,
		referenceId,
		metadata,
	};
}

/**
 * Converts a Database Schema to an OAuth 2.0 Dynamic Client Schema
 * @param input
 * @param cleaned - default true, determines if the output has only Oauth 2.0 compatible data
 * @returns
 */
export function schemaToOAuth(input: SchemaClient<Scope[]>): OAuthClient {
	const {
		// Important Fields
		clientId,
		clientSecret,
		disabled,
		scopes,
		// Recommended client data
		userId,
		createdAt,
		updatedAt: _updatedAt,
		expiresAt,
		// UI Metadata
		name,
		uri,
		icon,
		contacts,
		tos,
		policy,
		// User Software Identifiers
		softwareId,
		softwareVersion,
		softwareStatement,
		// Authentication Metadata
		redirectUris,
		postLogoutRedirectUris,
		tokenEndpointAuthMethod,
		grantTypes,
		responseTypes,
		// RFC6749 Spec
		public: _public,
		type,
		// All other metadata
		skipConsent,
		enableEndSession,
		requirePKCE,
		subjectType,
		referenceId,
		metadata, // in JSON format
	} = input;

	// Type conversions
	const _expiresAt = expiresAt
		? Math.round(new Date(expiresAt).getTime() / 1000)
		: undefined;
	const _createdAt = createdAt
		? Math.round(new Date(createdAt).getTime() / 1000)
		: undefined;
	const _scopes = scopes?.join(" ");
	const _metadata = parseClientMetadata(metadata);

	return {
		// All other metadata
		..._metadata,
		// Important Fields
		client_id: clientId,
		client_secret: clientSecret ?? undefined,
		client_secret_expires_at: clientSecret ? (_expiresAt ?? 0) : undefined,
		scope: _scopes ?? undefined,
		// Recommended client data
		user_id: userId ?? undefined,
		client_id_issued_at: _createdAt ?? undefined,
		// UI Metadata
		client_name: name ?? undefined,
		client_uri: uri ?? undefined,
		logo_uri: icon ?? undefined,
		contacts: contacts ?? undefined,
		tos_uri: tos ?? undefined,
		policy_uri: policy ?? undefined,
		// Jwks (only one can be used)
		// jwks, // Not Stored
		// jwks_uri: jwksUri, // Not Stored
		// User Software Identifiers
		software_id: softwareId ?? undefined,
		software_version: softwareVersion ?? undefined,
		software_statement: softwareStatement ?? undefined,
		// Authentication Metadata
		redirect_uris: redirectUris ?? [],
		post_logout_redirect_uris: postLogoutRedirectUris ?? undefined,
		token_endpoint_auth_method: tokenEndpointAuthMethod ?? undefined,
		grant_types: grantTypes ?? undefined,
		response_types: responseTypes ?? undefined,
		// RFC6749 Spec
		public: _public ?? undefined,
		type: type ?? undefined,
		// Not Part of RFC7591 Spec
		disabled: disabled ?? undefined,
		skip_consent: skipConsent ?? undefined,
		enable_end_session: enableEndSession ?? undefined,
		require_pkce: requirePKCE ?? undefined,
		subject_type: subjectType ?? undefined,
		reference_id: referenceId ?? undefined,
	};
}
