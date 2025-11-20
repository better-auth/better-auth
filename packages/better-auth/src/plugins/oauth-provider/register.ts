import type { GenericEndpointContext } from "@better-auth/core";
import { APIError, getSessionFromCtx } from "../../api";
import { generateRandomString } from "../../crypto";
import type { OAuthClient } from "../../oauth-2.1/types";
import { toExpJWT } from "../jwt/utils";
import type { OAuthOptions, SchemaClient, Scope } from "./types";
import { storeClientSecret } from "./utils";

export async function registerEndpoint(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
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

	// Ensure dynamically registered clients shall have a scope
	if (!ctx.body.scope) {
		ctx.body.scope = (
			opts.clientRegistrationDefaultScopes ?? opts.scopes
		)?.join(" ");
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
	const referenceId = opts.clientRegistrationReference
		? await opts.clientRegistrationReference({
				user: session?.user,
				session: session?.session,
			})
		: undefined;
	let schema = oauthToSchema({
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
 * Client values as stored on the database.
 * TODO: Easily removable when native `string[]` is used
 *
 * @internal
 */
export interface DatabaseClient
	extends Omit<
		SchemaClient<Scope[]>,
		| "scopes"
		| "contacts"
		| "redirectUris"
		| "postLogoutRedirectUris"
		| "grantTypes"
		| "responseTypes"
	> {
	scopes?: string;
	contacts?: string;
	redirectUris?: string;
	postLogoutRedirectUris?: string;
	grantTypes?: string;
	responseTypes?: string;
}

/**
 * Converts values stored on the database to a typed schema client.
 * TODO: Easily removable when native `string[]` is used
 *
 * @internal
 */
export function databaseToSchema(input: DatabaseClient): SchemaClient<Scope[]> {
	return {
		...input,
		scopes: input?.scopes?.split(" "),
		contacts: input?.contacts?.split(","),
		redirectUris: input?.redirectUris?.split(" "),
		postLogoutRedirectUris: input?.postLogoutRedirectUris?.split(" "),
		grantTypes: input?.grantTypes?.split(",") as SchemaClient<
			Scope[]
		>["grantTypes"],
		responseTypes: input?.responseTypes?.split(",") as SchemaClient<
			Scope[]
		>["responseTypes"],
	};
}

/**
 * Converts typed schema client to untyped database type.
 * TODO: Easily removable when native `string[]` is used
 *
 * @internal
 */
export function schemaToDatabase(input: SchemaClient<Scope[]>): DatabaseClient {
	return {
		...input,
		scopes: input.scopes?.join(" "),
		contacts: input.contacts?.join(","),
		redirectUris: input.redirectUris?.join(" "),
		postLogoutRedirectUris: input.postLogoutRedirectUris?.join(" "),
		grantTypes: input.grantTypes?.join(","),
		responseTypes: input.responseTypes?.join(","),
	};
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
		jwks,
		jwks_uri: jwksUri,
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
		reference_id: referenceId,
		// All other metadata
		...rest
	} = input;

	// Type conversions
	const expiresAt = _expiresAt ? new Date(_expiresAt * 1000) : undefined;
	const createdAt = _createdAt ? new Date(_createdAt * 1000) : undefined;
	const scopes = _scope?.split(" ");
	const metadata =
		rest && Object.keys(rest).length ? JSON.stringify(rest) : undefined;

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
		referenceId,
		metadata, // in JSON format
	} = input;

	// Type conversions
	const _expiresAt = expiresAt
		? Math.round(expiresAt.getTime() / 1000)
		: undefined;
	const _createdAt = createdAt
		? Math.round(createdAt.getTime() / 1000)
		: undefined;
	const _scopes = scopes?.join(" ");
	const _metadata = metadata ? JSON.parse(metadata) : undefined;

	return {
		// All other metadata
		..._metadata,
		// Important Fields
		client_id: clientId,
		client_secret: clientSecret,
		client_secret_expires_at: clientSecret ? (_expiresAt ?? 0) : undefined,
		scope: _scopes,
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
		reference_id: referenceId,
	};
}
