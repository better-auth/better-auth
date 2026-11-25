import type { GenericEndpointContext } from "@better-auth/core";
import { decodeBasicCredentials } from "@better-auth/core/oauth2";
import { APIError } from "better-call";
import {
	getExtensionClientAuthenticationStrategy,
	isExtensionTokenEndpointAuthMethod,
} from "./extensions";
import type {
	Confirmation,
	GrantType,
	OAuthOptions,
	SchemaClient,
	Scope,
	TokenEndpointAuthMethod,
} from "./types";
import {
	assertConfirmation,
	BASIC_CHALLENGE,
	challengeHeaders,
	getClient,
	isPublicClient,
	validateClientScopes,
	verifyStoredClientSecret,
} from "./utils";

/**
 * Converts a BASIC authorization header
 * into its client_id and client_secret representation
 *
 * @internal
 */
// RFC 7235 §2.1: the auth scheme is case-insensitive and is followed by
// one or more SP. Match liberally so requests using `basic` or extra
// spaces aren't rejected before reaching the spec-correct decoder.
const BASIC_SCHEME_PREFIX = /^Basic +/i;
const AUTH_SCHEME_TOKEN = /^([!#$%&'*+\-.^_`|~0-9A-Za-z]+)(?=\s|$)/;

function parseAuthorizationScheme(authorization: string) {
	return authorization.match(AUTH_SCHEME_TOKEN)?.[1];
}

const CLIENT_AUTHENTICATION_FIELDS = [
	"client_secret",
	"client_assertion",
	"client_assertion_type",
] as const;

export type ClientAuthenticationField =
	(typeof CLIENT_AUTHENTICATION_FIELDS)[number];

function throwInvalidAuthenticationRequest(errorDescription: string): never {
	throw new APIError("BAD_REQUEST", {
		error: "invalid_request",
		error_description: errorDescription,
	});
}

/**
 * Normalizes client identification and authentication parameters while
 * enforcing RFC 6749 §2.3 and RFC 8628 §3.1 cardinality. Empty values are
 * omitted. Client identification remains separate from authentication-method
 * detection so a public `client_id` does not count as an authentication attempt.
 * Repeated `resource` parameters are intentionally outside this parser because
 * RFC 8707 §2 explicitly permits them.
 *
 * Credential and assertion verification remain the responsibility of
 * `extractClientCredentials`.
 *
 * @internal
 */
export async function normalizeClientAuthenticationParameters(
	request: Request | undefined,
	body: Record<string, unknown> = {},
) {
	let clientId: string | undefined;
	if (body.client_id !== undefined && body.client_id !== "") {
		if (typeof body.client_id !== "string") {
			throwInvalidAuthenticationRequest("client_id must be a string");
		}
		clientId = body.client_id;
	}
	const fields: Partial<Record<ClientAuthenticationField, string>> = {};
	const setEffectiveField = (
		field: ClientAuthenticationField,
		value: unknown,
	) => {
		if (value === undefined || value === "") return;
		if (typeof value !== "string") {
			throwInvalidAuthenticationRequest(`${field} must be a string`);
		}
		fields[field] = value;
	};
	for (const field of CLIENT_AUTHENTICATION_FIELDS) {
		if (Object.hasOwn(body, field)) {
			setEffectiveField(field, body[field]);
		}
	}

	const authorization = request?.headers.get("authorization");
	const hasAuthorizationHeader = Boolean(authorization);

	if (request) {
		const contentType =
			request.headers.get("content-type")?.toLowerCase() ?? "";
		if (contentType.includes("application/x-www-form-urlencoded")) {
			const params = new URLSearchParams(await request.clone().text());
			const clientIds = params
				.getAll("client_id")
				.filter((value) => value.length > 0);
			if (clientIds.length > 1) {
				throwInvalidAuthenticationRequest("client_id must not be repeated");
			}
			clientId = clientIds[0];

			for (const field of CLIENT_AUTHENTICATION_FIELDS) {
				const values = params.getAll(field).filter((value) => value.length > 0);
				if (values.length > 1) {
					throwInvalidAuthenticationRequest(`${field} must not be repeated`);
				}
				if (values.length === 1) setEffectiveField(field, values[0]);
			}
		}
	}

	const hasClientSecret = fields.client_secret !== undefined;
	const hasClientAssertion =
		fields.client_assertion !== undefined ||
		fields.client_assertion_type !== undefined;
	if (
		(hasAuthorizationHeader && (hasClientSecret || hasClientAssertion)) ||
		(hasClientSecret && hasClientAssertion)
	) {
		throwInvalidAuthenticationRequest(
			"A request must use only one client authentication method",
		);
	}
	body.client_id = clientId;
	for (const field of CLIENT_AUTHENTICATION_FIELDS) {
		body[field] = fields[field];
	}

	return {
		detected: hasAuthorizationHeader || Object.keys(fields).length > 0,
	};
}

function basicToClientCredentials(authorization: string) {
	if (!BASIC_SCHEME_PREFIX.test(authorization)) {
		return undefined;
	}
	try {
		const { clientId, clientSecret } = decodeBasicCredentials(authorization);
		return { client_id: clientId, client_secret: clientSecret };
	} catch {
		throw new APIError(
			"UNAUTHORIZED",
			{
				error_description: "invalid authorization header format",
				error: "invalid_client",
			},
			challengeHeaders(BASIC_CHALLENGE),
		);
	}
}

/**
 * Whether a client is allowed to use a given grant type.
 *
 * A client's registered `grantTypes` defaults to the documented default
 * `["authorization_code"]` when unset (see client registration). Refresh tokens
 * are only ever issued through the authorization_code flow, so a client allowed
 * to use `authorization_code` is implicitly allowed to use `refresh_token`.
 *
 * @internal
 */
export function clientAllowsGrant(
	client: Pick<SchemaClient<Scope[]>, "grantTypes">,
	grantType: GrantType,
) {
	const allowedGrants =
		client.grantTypes && client.grantTypes.length > 0
			? client.grantTypes
			: (["authorization_code"] as GrantType[]);
	if (
		grantType === "refresh_token" &&
		allowedGrants.includes("authorization_code")
	) {
		return true;
	}
	return allowedGrants.includes(grantType);
}

export function throwInvalidClient(
	errorDescription: string,
	authentication?: {
		method?: TokenEndpointAuthMethod;
		scheme?: string;
	},
): never {
	const scheme = authentication?.scheme;
	const attemptedBasicAuthentication =
		scheme?.toLowerCase() === "basic" ||
		authentication?.method === "client_secret_basic";
	const challengeScheme = attemptedBasicAuthentication
		? BASIC_CHALLENGE
		: scheme;
	throw new APIError(
		challengeScheme ? "UNAUTHORIZED" : "BAD_REQUEST",
		{
			error_description: errorDescription,
			error: "invalid_client",
		},
		challengeScheme ? challengeHeaders(challengeScheme) : undefined,
	);
}

/**
 * Resolves the registered client by id and authorizes it: existence, disabled
 * state, registered auth method, requested scopes, and grant type. The record is
 * always resolved here via `getClient`, so a client-auth strategy proves the
 * caller controls `clientId` but never supplies the record. `preVerified` marks
 * that an assertion already proved control, so the client-secret check is skipped.
 *
 * @internal
 */
export async function validateClientCredentials(
	ctx: GenericEndpointContext,
	options: OAuthOptions<Scope[]>,
	clientId: string,
	clientSecret?: string, // optional because required if client is confidential or this value is defined
	scopes?: string[], // checks requested scopes against allowed scopes
	preVerified?: boolean, // an assertion already proved control of clientId; skip the secret check
	grantType?: GrantType, // if set, enforces the client is registered for this grant type
	authMethod?: TokenEndpointAuthMethod,
) {
	const client = await getClient(ctx, options, clientId);
	if (!client) {
		throwInvalidClient("client not found", { method: authMethod });
	}
	if (client.disabled) {
		throwInvalidClient("client is disabled", { method: authMethod });
	}

	const registeredAuthMethod =
		client.tokenEndpointAuthMethod ?? "client_secret_basic";
	if (authMethod && registeredAuthMethod !== authMethod) {
		throwInvalidClient(
			`client registered for ${registeredAuthMethod} cannot use ${authMethod}`,
			{ method: authMethod },
		);
	}
	if (
		(client.tokenEndpointAuthMethod === "private_key_jwt" ||
			isExtensionTokenEndpointAuthMethod(
				options,
				client.tokenEndpointAuthMethod,
			)) &&
		!preVerified
	) {
		throw new APIError("BAD_REQUEST", {
			error_description: `client registered for ${client.tokenEndpointAuthMethod} must use client_assertion`,
			error: "invalid_client",
		});
	}

	// Skip secret checks for pre-verified clients (already authenticated via assertion)
	if (!preVerified) {
		if (!isPublicClient(client) && !clientSecret) {
			throwInvalidClient("client secret must be provided", {
				method: authMethod,
			});
		}

		// Secret should not be received
		if (clientSecret && !client.clientSecret) {
			throwInvalidClient(
				"public client, client secret should not be received",
				{ method: authMethod },
			);
		}

		// Compare Secrets when secret is provided
		if (
			clientSecret &&
			!(await verifyStoredClientSecret(
				ctx,
				options,
				client.clientSecret!,
				clientSecret,
			))
		) {
			throwInvalidClient("invalid client_secret", { method: authMethod });
		}

		if (
			clientSecret &&
			client.expiresAt &&
			new Date(client.expiresAt) <= new Date()
		) {
			throwInvalidClient("client secret has expired", { method: authMethod });
		}
	}

	validateClientScopes(client, scopes);

	// Enforce the client is registered for the requested grant type
	if (grantType && !clientAllowsGrant(client, grantType)) {
		throw new APIError("BAD_REQUEST", {
			error_description: `client is not authorized to use grant type ${grantType}`,
			error: "unauthorized_client",
		});
	}

	return client;
}

export type ExtractedCredentials =
	| {
			kind: "client_secret";
			method: "client_secret_basic" | "client_secret_post";
			clientId: string;
			clientSecret: string;
	  }
	| {
			kind: "pre_verified";
			method: TokenEndpointAuthMethod;
			clientId: string;
			/** Sender-constraint the auth strategy proved, forwarded to issuance. */
			confirmation?: Confirmation;
	  }
	| {
			kind: "public";
			method: "none";
			clientId: string;
	  };

/** Unwraps ExtractedCredentials into the fields each grant handler needs. */
export function destructureCredentials(
	credentials: ExtractedCredentials | null,
) {
	return {
		clientId: credentials?.clientId,
		clientSecret:
			credentials?.kind === "client_secret"
				? credentials.clientSecret
				: undefined,
		preVerified: credentials?.kind === "pre_verified",
		authMethod: credentials?.method,
		confirmation:
			credentials?.kind === "pre_verified"
				? credentials.confirmation
				: undefined,
	};
}

/**
 * Extracts and resolves client credentials from the request.
 * Supports: client_secret_basic, client_secret_post, private_key_jwt, and none (public).
 *
 * `endpoint` is the URL of the endpoint serving the request. It sets the
 * accepted client assertion audiences through `getClientAssertionAudiences`.
 *
 * With `expectedClientId`, a request that names no client is read as naming
 * that one, and a request that names another client fails with
 * `invalid_client`.
 */
export async function extractClientCredentials(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	endpoint: string,
	expectedClientId?: string,
): Promise<ExtractedCredentials | null> {
	const body = { ...((ctx.body ?? {}) as Record<string, unknown>) };
	await normalizeClientAuthenticationParameters(ctx.request, body);
	if (expectedClientId === undefined) {
		return readClientCredentials(ctx, opts, body, endpoint);
	}
	// Rejected before the credentials are read, so a request for another
	// client fetches no JWKS and consumes no assertion `jti`.
	if (body.client_id !== undefined && body.client_id !== expectedClientId) {
		const authorization = ctx.request?.headers.get("authorization");
		throwInvalidClient("client_id does not match the expected client", {
			method:
				authorization && BASIC_SCHEME_PREFIX.test(authorization)
					? "client_secret_basic"
					: undefined,
		});
	}
	body.client_id = expectedClientId;
	const credentials = await readClientCredentials(ctx, opts, body, endpoint);
	// Basic credentials name their client apart from `client_id`, and an
	// extension strategy returns the client its assertion proved.
	if (credentials?.clientId !== expectedClientId) {
		throwInvalidClient("client_id does not match the expected client", {
			method: credentials?.method,
		});
	}
	return credentials;
}

async function readClientCredentials(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	body: Record<string, unknown>,
	endpoint: string,
): Promise<ExtractedCredentials | null> {
	const authorization = ctx.request?.headers.get("authorization") ?? undefined;

	// 1. Check for assertion-based client authentication.
	if (body.client_assertion_type || body.client_assertion) {
		if (!body.client_assertion || !body.client_assertion_type) {
			throw new APIError("BAD_REQUEST", {
				error_description:
					"client_assertion and client_assertion_type must both be provided",
				error: "invalid_client",
			});
		}
		const assertion = body.client_assertion as string;
		const assertionType = body.client_assertion_type as string;
		const { getClientAssertionAudiences, verifyClientAssertion } = await import(
			"./utils/client-assertion"
		);
		const extensionStrategy = getExtensionClientAuthenticationStrategy(
			opts,
			assertionType,
		);
		if (extensionStrategy) {
			const result = await extensionStrategy.strategy.authenticate({
				ctx,
				opts,
				assertion,
				assertionType,
				clientId: body.client_id as string | undefined,
				acceptedAudiences: getClientAssertionAudiences(ctx, opts, endpoint),
				expectedAudience: endpoint,
			});
			assertConfirmation(
				result.confirmation,
				`clientAuthentication.${extensionStrategy.method}`,
			);
			return {
				kind: "pre_verified",
				method: extensionStrategy.method,
				clientId: result.clientId,
				confirmation: result.confirmation,
			};
		}
		const result = await verifyClientAssertion(
			ctx,
			opts,
			assertion,
			assertionType,
			body.client_id as string | undefined,
			endpoint,
		);
		return {
			kind: "pre_verified",
			method: "private_key_jwt",
			clientId: result.clientId,
		};
	}

	if (authorization && !BASIC_SCHEME_PREFIX.test(authorization)) {
		const authorizationScheme = parseAuthorizationScheme(authorization);
		if (!authorizationScheme) {
			throw new APIError("BAD_REQUEST", {
				error: "invalid_request",
				error_description: "Invalid authorization header format",
			});
		}
		throwInvalidClient("unsupported authorization scheme", {
			scheme: authorizationScheme,
		});
	}

	// 2. Check for Basic auth header
	if (authorization && BASIC_SCHEME_PREFIX.test(authorization)) {
		const res = basicToClientCredentials(authorization);
		if (res) {
			return {
				kind: "client_secret",
				method: "client_secret_basic",
				clientId: res.client_id,
				clientSecret: res.client_secret,
			};
		}
	}

	// 3. Check body params
	if (body.client_id && body.client_secret) {
		return {
			kind: "client_secret",
			method: "client_secret_post",
			clientId: body.client_id as string,
			clientSecret: body.client_secret as string,
		};
	}

	// 4. client_id only (public client)
	if (body.client_id) {
		return {
			kind: "public",
			method: "none",
			clientId: body.client_id as string,
		};
	}

	return null;
}
