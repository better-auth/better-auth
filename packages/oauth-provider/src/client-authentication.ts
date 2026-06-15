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
import { getClient, verifyStoredClientSecret } from "./utils";

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

function basicToClientCredentials(authorization: string) {
	if (!BASIC_SCHEME_PREFIX.test(authorization)) {
		return undefined;
	}
	try {
		const { clientId, clientSecret } = decodeBasicCredentials(authorization);
		return { client_id: clientId, client_secret: clientSecret };
	} catch {
		throw new APIError("BAD_REQUEST", {
			error_description: "invalid authorization header format",
			error: "invalid_client",
		});
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
		throw new APIError("BAD_REQUEST", {
			error_description: "missing client",
			error: "invalid_client",
		});
	}
	if (client.disabled) {
		throw new APIError("BAD_REQUEST", {
			error_description: "client is disabled",
			error: "invalid_client",
		});
	}

	// Enforce registered auth method for assertion/pre-verified methods.
	if (preVerified && authMethod) {
		const registeredAuthMethod =
			client.tokenEndpointAuthMethod ?? "client_secret_basic";
		if (registeredAuthMethod !== authMethod) {
			throw new APIError("BAD_REQUEST", {
				error_description: `client registered for ${registeredAuthMethod} cannot use ${authMethod}`,
				error: "invalid_client",
			});
		}
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
		// Require secret for confidential clients
		if (!client.public && !clientSecret) {
			throw new APIError("BAD_REQUEST", {
				error_description: "client secret must be provided",
				error: "invalid_client",
			});
		}

		// Secret should not be received
		if (clientSecret && !client.clientSecret) {
			throw new APIError("BAD_REQUEST", {
				error_description:
					"public client, client secret should not be received",
				error: "invalid_client",
			});
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
			throw new APIError("UNAUTHORIZED", {
				error_description: "invalid client_secret",
				error: "invalid_client",
			});
		}
	}

	// If scopes set, check against client allowed scopes
	if (scopes && client.scopes) {
		const validScopes = new Set(client.scopes);
		for (const sc of scopes) {
			if (!validScopes.has(sc)) {
				throw new APIError("BAD_REQUEST", {
					error_description: `client does not allow scope ${sc}`,
					error: "invalid_scope",
				});
			}
		}
	}

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
 */
export async function extractClientCredentials(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	expectedAudience?: string,
): Promise<ExtractedCredentials | null> {
	const body = (ctx.body ?? {}) as Record<string, unknown>;
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
		if (
			body.client_secret ||
			(authorization && BASIC_SCHEME_PREFIX.test(authorization))
		) {
			throw new APIError("BAD_REQUEST", {
				error_description:
					"client_assertion cannot be combined with client_secret or Basic auth",
				error: "invalid_client",
			});
		}
		const assertion = body.client_assertion as string;
		const assertionType = body.client_assertion_type as string;
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
				expectedAudience,
			});
			return {
				kind: "pre_verified",
				method: extensionStrategy.method,
				clientId: result.clientId,
				confirmation: result.confirmation,
			};
		}
		const { verifyClientAssertion: verify } = await import(
			"./utils/client-assertion"
		);
		const result = await verify(
			ctx,
			opts,
			assertion,
			assertionType,
			body.client_id as string | undefined,
			expectedAudience,
		);
		return {
			kind: "pre_verified",
			method: "private_key_jwt",
			clientId: result.clientId,
		};
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
