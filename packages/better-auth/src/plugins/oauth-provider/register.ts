import type { GenericEndpointContext } from "@better-auth/core";
import type { SchemaClient, OAuthOptions } from "./types";
import type { OAuthClient } from "../../oauth-2.1/types";
import { APIError, getSessionFromCtx } from "../../api";
import { generateRandomString } from "../../crypto";
import { storeClientSecret } from "./utils";
import { toExpJWT } from "../jwt/utils";

export async function registerEndpoint(
	ctx: GenericEndpointContext,
	opts: OAuthOptions,
) {
	// Check if registration endpoint is enabled
	if (!opts.allowDynamicClientRegistration) {
		throw new APIError("FORBIDDEN", {
			error: "access_denied",
			error_description: "Client registration is disabled",
		});
	}

	const body = ctx.body as OAuthClient;
	const session = await getSessionFromCtx(ctx);

	// Check authorization
	if (!(session || opts.allowUnauthenticatedClientRegistration)) {
		throw new APIError("UNAUTHORIZED", {
			error: "invalid_token",
			error_description: "Authentication required for client registration",
		});
	}

	// Determine whether registration request for public client
	// https://datatracker.ietf.org/doc/html/rfc7591#section-2
	const isPublic = body.token_endpoint_auth_method === "none";

	// Check unauthenticated user is requesting a confidential client
	if (!session && !isPublic) {
		throw new APIError("UNAUTHORIZED", {
			error: "invalid_request",
			error_description:
				"Authentication required for confidential client registration",
		});
	}

	return createOAuthClientEndpoint(ctx, opts);
}

export async function checkOAuthClient(
	client: OAuthClient,
	opts: OAuthOptions,
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

	// Check requested application scopes
	const requestedScopes = (client?.scope as string | undefined)
		?.split(" ")
		.filter((v) => v.length);
	const allowedScopes = opts.clientRegistrationAllowedScopes ?? opts.scopes;
	if (allowedScopes) {
		for (const requestedScope of requestedScopes ?? []) {
			if (!allowedScopes?.includes(requestedScope)) {
				throw new APIError("BAD_REQUEST", {
					error: "invalid_scope",
					error_description: `cannot request scope ${requestedScope}`,
				});
			}
		}
	}
}

export async function createOAuthClientEndpoint(
	ctx: GenericEndpointContext,
	opts: OAuthOptions,
) {
	const body = ctx.body as OAuthClient;
	const session = await getSessionFromCtx(ctx);

	// Determine whether registration request for public client
	// https://datatracker.ietf.org/doc/html/rfc7591#section-2
	const isPublic = body.token_endpoint_auth_method === "none";

	// Check if client parameters are valid combination
	await checkOAuthClient(ctx.body, opts);

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
	let schema = oauthToSchema(
		{
			scope: opts.clientRegistrationDefaultScopes?.join(" "),
			...((body ?? {}) as Partial<OAuthClient>),
			// Dynamic registration should not have disabled defined
			disabled: undefined,
			// Jwks unsupported
			jwks: undefined,
			jwks_uri: undefined,
			// Required if client secret is issued
			client_secret_expires_at: storedClientSecret
				? opts?.clientRegistrationClientSecretExpiration
					? toExpJWT(opts.clientRegistrationClientSecretExpiration, iat)
					: 0
				: undefined,
			// Override
			client_id: clientId,
			client_secret: storedClientSecret,
			client_id_issued_at: iat,
			public: isPublic,
			user_id: session?.session.userId,
		},
		true,
	);
	const client = await ctx.context.adapter
		.create<DatabaseClient>({
			model: opts.schema?.oauthClient?.modelName ?? "oauthClient",
			data: schemaToDatabase(schema),
		})
		.then((res) => {
			return databaseToSchema(res as DatabaseClient);
		});
	// Format the response according to RFC7591
	return ctx.json(
		schemaToOAuth(
			{
				...client,
				clientSecret: clientSecret
					? (opts.clientSecretPrefix ?? "") + clientSecret
					: undefined,
			},
			true,
		),
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
 * Client values as stored on the database.
 * TODO: Easily removable when native `string[]` is used
 *
 * @internal
 */
export interface DatabaseClient
	extends Omit<
		SchemaClient,
		| "allowedScopes"
		| "contacts"
		| "redirectUris"
		| "grantTypes"
		| "responseTypes"
	> {
	allowedScopes?: string;
	contacts?: string;
	redirectUris?: string;
	grantTypes?: string;
	responseTypes?: string;
}

/**
 * Converts values stored on the database to a typed schema client.
 * TODO: Easily removable when native `string[]` is used
 *
 * @internal
 */
export function databaseToSchema(input: DatabaseClient): SchemaClient {
	return {
		...input,
		allowedScopes: input.allowedScopes?.split(" "),
		contacts: input.contacts?.split(","),
		redirectUris: input.redirectUris?.split(","),
		grantTypes: input.grantTypes?.split(",") as SchemaClient["grantTypes"],
		responseTypes: input.responseTypes?.split(
			",",
		) as SchemaClient["responseTypes"],
	};
}

/**
 * Converts typed schema client to untyped database type.
 * TODO: Easily removable when native `string[]` is used
 *
 * @internal
 */
export function schemaToDatabase(input: SchemaClient): DatabaseClient {
	return {
		...input,
		allowedScopes: input.allowedScopes?.join(" "),
		contacts: input.contacts?.join(","),
		redirectUris: input.redirectUris?.join(","),
		grantTypes: input.grantTypes?.join(","),
		responseTypes: input.responseTypes?.join(","),
	};
}

/**
 * Converts an OAuth 2.0 Dynamic Client Schema to a Database Schema
 *
 * @param input
 * @param cleaned - determines if the `rest` is converted into metadata
 * @returns
 */
export function oauthToSchema(
	input: OAuthClient,
	cleaned = true,
): SchemaClient {
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
		jwks,
		jwks_uri: jwksUri,
		// User Software Identifiers
		software_id: softwareId,
		software_version: softwareVersion,
		software_statement: softwareStatement,
		// Authentication Metadata
		redirect_uris: redirectUris,
		token_endpoint_auth_method: tokenEndpointAuthMethod,
		grant_types: grantTypes,
		response_types: responseTypes,
		// RFC6749 Spec
		public: _public,
		type,
		// Not Part of RFC7591 Spec
		disabled,
		skip_consent: skipConsent,
		// All other metadata
		...rest
	} = input;

	// Type conversions
	const expiresAt = _expiresAt ? new Date(_expiresAt * 1000) : undefined;
	const createdAt = _createdAt ? new Date(_createdAt * 1000) : undefined;
	const allowedScopes = _scope?.split(" ");

	return {
		// Important Fields
		clientId,
		clientSecret,
		disabled,
		allowedScopes,
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
		tokenEndpointAuthMethod,
		grantTypes,
		responseTypes,
		// RFC6749 Spec
		public: _public,
		type,
		// All other metadata
		skipConsent,
		metadata: cleaned ? undefined : JSON.stringify(rest),
	};
}

/**
 * Converts a Database Schema to an OAuth 2.0 Dynamic Client Schema
 * @param input
 * @param cleaned - determines if the output has only Oauth 2.0 compatible data
 * @returns
 */
export function schemaToOAuth(
	input: SchemaClient,
	cleaned = true,
): OAuthClient {
	const {
		// Important Fields
		clientId,
		clientSecret,
		disabled,
		allowedScopes,
		// Recommended client data
		userId,
		createdAt,
		updatedAt,
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
		tokenEndpointAuthMethod,
		grantTypes,
		responseTypes,
		// RFC6749 Spec
		public: _public,
		type,
		// All other metadata
		skipConsent,
		metadata, // in JSON format
	} = input;

	// Type conversions
	const _expiresAt = expiresAt
		? Math.round(expiresAt.getTime() / 1000)
		: undefined;
	const _createdAt = createdAt
		? Math.round(createdAt.getTime() / 1000)
		: undefined;
	const _allowedScopes = allowedScopes?.join(" ");
	const rest = metadata ? JSON.parse(metadata) : undefined;

	return {
		// All other metadata
		...(cleaned ? undefined : rest),
		// Important Fields
		client_id: clientId,
		client_secret: clientSecret,
		client_secret_expires_at: clientSecret ? (_expiresAt ?? 0) : undefined,
		scope: _allowedScopes,
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
		// jwks, // Not Stored
		// jwks_uri: jwksUri, // Not Stored
		// User Software Identifiers
		software_id: softwareId,
		software_version: softwareVersion,
		software_statement: softwareStatement,
		// Authentication Metadata
		redirect_uris: redirectUris,
		token_endpoint_auth_method: tokenEndpointAuthMethod,
		grant_types: grantTypes,
		response_types: responseTypes,
		// RFC6749 Spec
		public: _public,
		type,
		// Not Part of RFC7591 Spec
		disabled,
		skip_consent: skipConsent,
	};
}
