import type { GenericEndpointContext } from "@better-auth/core";
import { runWithTransaction } from "@better-auth/core/context";
import { isLoopbackHost } from "@better-auth/core/utils/host";
import { APIError, getSessionFromCtx, NO_STORE_HEADERS } from "better-auth/api";
import { generateRandomString } from "better-auth/crypto";
import { toExpJWT } from "better-auth/plugins";
import {
	getSupportedAuthMethods,
	getSupportedGrantTypes,
	isExtensionTokenEndpointAuthMethod,
} from "./extensions";
import { assertClientPrivileges } from "./oauthClient/privileges";
import { buildClientResourceLinkId, getResource } from "./resources";
import type {
	ClientRegistrationRequest,
	OAuthOptions,
	SchemaClient,
	Scope,
} from "./types";
import type { GrantType, OAuthClient } from "./types/oauth";
import { parseClientMetadata, storeClientSecret } from "./utils";
import { isPrivateHostname } from "./utils/client-assertion";
import { authorizeInitialAccessToken } from "./utils/initial-access-token";

const DEFAULT_REGISTRATION_GRANT_TYPES = [
	"authorization_code",
] as const satisfies GrantType[];

const PRIVATE_JWK_MEMBER_NAMES = [
	"d",
	"p",
	"q",
	"dp",
	"dq",
	"qi",
	"oth",
] as const;

function hasStringJwkMember(key: Record<string, unknown>, memberName: string) {
	return typeof key[memberName] === "string" && key[memberName].length > 0;
}

function isSupportedPublicJwk(key: Record<string, unknown>) {
	switch (key.kty) {
		case "RSA":
			return hasStringJwkMember(key, "n") && hasStringJwkMember(key, "e");
		case "EC":
			return (
				hasStringJwkMember(key, "crv") &&
				hasStringJwkMember(key, "x") &&
				hasStringJwkMember(key, "y")
			);
		case "OKP":
			return hasStringJwkMember(key, "crv") && hasStringJwkMember(key, "x");
		default:
			return false;
	}
}

function resolveRegistrationGrantTypes(client: OAuthClient): GrantType[] {
	const grantTypes = client.grant_types ?? [
		...DEFAULT_REGISTRATION_GRANT_TYPES,
	];
	if (grantTypes.length > 0) return grantTypes;
	throw new APIError("BAD_REQUEST", {
		error: "invalid_client_metadata",
		error_description: "grant_types must contain at least one grant type",
	});
}

function resolveRegistrationResponseTypes(
	client: OAuthClient,
	grantTypes: GrantType[],
): OAuthClient["response_types"] {
	if (client.response_types) return client.response_types;
	return grantTypes.includes("authorization_code") ? ["code"] : undefined;
}

function applyOAuthClientRegistrationDefaults(
	client: OAuthClient,
): OAuthClient {
	const grantTypes = resolveRegistrationGrantTypes(client);
	return {
		...client,
		token_endpoint_auth_method:
			client.token_endpoint_auth_method ?? "client_secret_basic",
		grant_types: grantTypes,
		response_types: resolveRegistrationResponseTypes(client, grantTypes),
	};
}

function validatePublicJwks(jwks: NonNullable<OAuthClient["jwks"]>) {
	const keys = Array.isArray(jwks) ? jwks : jwks.keys;
	if (!Array.isArray(keys) || keys.length === 0) {
		throw new APIError("BAD_REQUEST", {
			error: "invalid_client_metadata",
			error_description:
				"jwks must be a non-empty array of JWK objects or a JWKS document {keys:[...]}",
		});
	}
	for (const key of keys) {
		if (
			key.kty === "oct" ||
			"k" in key ||
			PRIVATE_JWK_MEMBER_NAMES.some((name) => name in key)
		) {
			throw new APIError("BAD_REQUEST", {
				error: "invalid_client_metadata",
				error_description: "jwks must contain only public asymmetric keys",
			});
		}
		if (!isSupportedPublicJwk(key)) {
			throw new APIError("BAD_REQUEST", {
				error: "invalid_client_metadata",
				error_description:
					"jwks keys must be supported public JWKs with required key parameters",
			});
		}
	}
}

export async function registerEndpoint(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
) {
	const body = ctx.body as OAuthClient & { resources?: string[] };

	if (!opts.allowDynamicClientRegistration) {
		throw new APIError("FORBIDDEN", {
			error: "access_denied",
			error_description: "Client registration is disabled",
		});
	}

	// Resolve a session first. With the bearer plugin enabled it consumes the
	// Authorization header (a valid bearer becomes the session); only when no
	// session is resolved do we treat an Authorization: Bearer value as an
	// RFC 7591 initial access token.
	const session = await getSessionFromCtx(ctx);
	const tokenAuthorization = session
		? undefined
		: await authorizeInitialAccessToken(
				ctx,
				opts,
				body as ClientRegistrationRequest,
			);
	const isTokenAuthorized = Boolean(tokenAuthorization);

	if (
		!(
			session ||
			isTokenAuthorized ||
			opts.allowUnauthenticatedClientRegistration
		)
	) {
		// No session, no token, and open registration disabled. A presented but
		// invalid token already threw above, so this is the no-credentials case:
		// answer with a bare RFC 6750 §3.1 Bearer challenge and no error code.
		throw new APIError(
			"UNAUTHORIZED",
			{
				error_description: "Authentication required for client registration",
			},
			{
				"WWW-Authenticate": "Bearer",
				...NO_STORE_HEADERS,
			},
		);
	}

	if (!session && !isTokenAuthorized) {
		if (body.grant_types?.includes("client_credentials")) {
			throw new APIError("BAD_REQUEST", {
				error: "invalid_client_metadata",
				error_description:
					"client_credentials grant requires authenticated registration",
			});
		}
	}

	if (!body.scope) {
		body.scope = (opts.clientRegistrationDefaultScopes ?? opts.scopes)?.join(
			" ",
		);
	}

	// RFC 7591 §2 extension: clients may declare which resources they need.
	// Validate up front so the registration fails before we issue a clientId.
	// Linking happens inside createOAuthClientEndpoint so the response shape
	// stays type-stable for existing DCR consumers (the resources are echoed
	// as an added field, not via a separate Response wrapper).
	const requestedResources = Array.isArray(body.resources)
		? [
				...new Set(
					body.resources.filter(
						(resource): resource is string =>
							typeof resource === "string" && resource.length > 0,
					),
				),
			]
		: [];
	if (requestedResources.length > 0) {
		for (const identifier of requestedResources) {
			const row = await getResource(ctx, opts, identifier);
			if (!row) {
				throw new APIError("BAD_REQUEST", {
					error: "invalid_target",
					error_description: `requested resource ${identifier} does not exist`,
				});
			}
			if (row.disabled) {
				throw new APIError("BAD_REQUEST", {
					error: "invalid_target",
					error_description: `requested resource ${identifier} is disabled`,
				});
			}
		}
	}

	return createOAuthClientEndpoint(ctx, opts, {
		isRegister: true,
		session,
		referenceId: tokenAuthorization?.referenceId,
		resources: requestedResources.length > 0 ? requestedResources : undefined,
	});
}

export async function checkOAuthClient(
	client: OAuthClient,
	opts: OAuthOptions<Scope[]>,
	settings?: {
		isRegister?: boolean;
		ctx?: GenericEndpointContext;
	},
) {
	const clientWithDefaults = applyOAuthClientRegistrationDefaults(client);
	// Determine whether registration request for public client
	// https://datatracker.ietf.org/doc/html/rfc7591#section-2
	const isPublic = clientWithDefaults.token_endpoint_auth_method === "none";
	const tokenEndpointAuthMethod =
		clientWithDefaults.token_endpoint_auth_method ?? "client_secret_basic";
	const supportedTokenEndpointAuthMethods = new Set(
		getSupportedAuthMethods(opts, { includeNone: true }),
	);
	if (!supportedTokenEndpointAuthMethods.has(tokenEndpointAuthMethod)) {
		throw new APIError("BAD_REQUEST", {
			error: "invalid_client_metadata",
			error_description: `unsupported token_endpoint_auth_method ${tokenEndpointAuthMethod}`,
		});
	}
	if (
		clientWithDefaults.dpop_bound_access_tokens !== undefined &&
		typeof clientWithDefaults.dpop_bound_access_tokens !== "boolean"
	) {
		throw new APIError("BAD_REQUEST", {
			error: "invalid_client_metadata",
			error_description: "dpop_bound_access_tokens must be a boolean",
		});
	}

	// Check value of type, if sent, matches isPublic
	if (clientWithDefaults.type) {
		if (
			isPublic &&
			!(
				clientWithDefaults.type === "native" ||
				clientWithDefaults.type === "user-agent-based"
			)
		) {
			throw new APIError("BAD_REQUEST", {
				error: "invalid_client_metadata",
				error_description: `Type must be 'native' or 'user-agent-based' for public applications`,
			});
		} else if (!isPublic && !(clientWithDefaults.type === "web")) {
			throw new APIError("BAD_REQUEST", {
				error: "invalid_client_metadata",
				error_description: `Type must be 'web' for confidential applications`,
			});
		}
	}

	const grantTypes = clientWithDefaults.grant_types ?? [];
	const responseTypes = clientWithDefaults.response_types;

	// Validate redirect URIs for redirect-based flows
	if (
		grantTypes.includes("authorization_code") &&
		(!clientWithDefaults.redirect_uris ||
			clientWithDefaults.redirect_uris.length === 0)
	) {
		throw new APIError("BAD_REQUEST", {
			error: "invalid_redirect_uri",
			error_description:
				"Redirect URIs are required for authorization_code and implicit grant types",
		});
	}

	// Validate correlation between grant_types and response_types
	const supportedGrantTypes = new Set(getSupportedGrantTypes(opts));
	for (const grantType of grantTypes) {
		if (!supportedGrantTypes.has(grantType)) {
			throw new APIError("BAD_REQUEST", {
				error: "invalid_client_metadata",
				error_description: `unsupported grant_type ${grantType}`,
			});
		}
	}
	if (
		grantTypes.includes("authorization_code") &&
		!responseTypes?.includes("code")
	) {
		throw new APIError("BAD_REQUEST", {
			error: "invalid_client_metadata",
			error_description:
				"When 'authorization_code' grant type is used, 'code' response type must be included",
		});
	}
	if (
		!grantTypes.includes("authorization_code") &&
		responseTypes?.includes("code")
	) {
		throw new APIError("BAD_REQUEST", {
			error: "invalid_client_metadata",
			error_description:
				"When 'code' response type is used, 'authorization_code' grant type must be included",
		});
	}

	// Validate subject_type
	if (clientWithDefaults.subject_type !== undefined) {
		if (
			clientWithDefaults.subject_type !== "public" &&
			clientWithDefaults.subject_type !== "pairwise"
		) {
			throw new APIError("BAD_REQUEST", {
				error: "invalid_client_metadata",
				error_description: `subject_type must be "public" or "pairwise"`,
			});
		}
		if (
			clientWithDefaults.subject_type === "pairwise" &&
			!opts.pairwiseSecret
		) {
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
			clientWithDefaults.subject_type === "pairwise" &&
			clientWithDefaults.redirect_uris &&
			clientWithDefaults.redirect_uris.length > 1
		) {
			const hosts = new Set(
				clientWithDefaults.redirect_uris.map(
					(uri: string) => new URL(uri).host,
				),
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
	const requestedScopes = (clientWithDefaults?.scope as string | undefined)
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

	if (settings?.isRegister && clientWithDefaults.require_pkce === false) {
		throw new APIError("BAD_REQUEST", {
			error: "invalid_client_metadata",
			error_description: `pkce is required for registered clients.`,
		});
	}

	// Validate client key metadata (jwks / jwks_uri). OIDC Dynamic Client
	// Registration treats these as general client metadata, not only
	// private_key_jwt key material. private_key_jwt still requires one below.
	if (clientWithDefaults.jwks || clientWithDefaults.jwks_uri) {
		// OIDC Registration: jwks and jwks_uri must not both be present.
		if (clientWithDefaults.jwks && clientWithDefaults.jwks_uri) {
			throw new APIError("BAD_REQUEST", {
				error: "invalid_client_metadata",
				error_description: "jwks and jwks_uri are mutually exclusive",
			});
		}
		if (clientWithDefaults.jwks_uri) {
			try {
				const uri = new URL(clientWithDefaults.jwks_uri);
				if (uri.protocol !== "https:") {
					throw new APIError("BAD_REQUEST", {
						error: "invalid_client_metadata",
						error_description: "jwks_uri must use HTTPS",
					});
				}
				if (isPrivateHostname(uri.hostname)) {
					throw new APIError("BAD_REQUEST", {
						error: "invalid_client_metadata",
						error_description:
							"jwks_uri must not point to a private or reserved address",
					});
				}
				if (settings?.ctx && !settings.ctx.context.isTrustedOrigin(uri.href)) {
					throw new APIError("BAD_REQUEST", {
						error: "invalid_client_metadata",
						error_description: "jwks_uri must belong to a trusted origin",
					});
				}
			} catch (e) {
				if (e instanceof APIError) throw e;
				throw new APIError("BAD_REQUEST", {
					error: "invalid_client_metadata",
					error_description: "jwks_uri must be a valid URL",
				});
			}
		}
		if (clientWithDefaults.jwks) {
			validatePublicJwks(clientWithDefaults.jwks);
		}
	}
	// private_key_jwt requires key material; other methods may still register
	// client keys for OIDC features such as request objects or encrypted responses.
	if (
		tokenEndpointAuthMethod === "private_key_jwt" &&
		!clientWithDefaults.jwks &&
		!clientWithDefaults.jwks_uri
	) {
		throw new APIError("BAD_REQUEST", {
			error: "invalid_client_metadata",
			error_description: "private_key_jwt requires either jwks or jwks_uri",
		});
	}

	if (clientWithDefaults.backchannel_logout_uri !== undefined) {
		if (opts.disableJwtPlugin) {
			throw new APIError("BAD_REQUEST", {
				error: "invalid_client_metadata",
				error_description:
					"backchannel_logout_uri requires the jwt plugin (disableJwtPlugin must be false)",
			});
		}
		let url: URL;
		try {
			url = new URL(clientWithDefaults.backchannel_logout_uri);
		} catch {
			throw new APIError("BAD_REQUEST", {
				error: "invalid_client_metadata",
				error_description: "backchannel_logout_uri must be an absolute URL",
			});
		}
		// Only http/https make sense for a POST target and the server will
		// refuse anything else at fetch time; reject up front to avoid storing
		// unreachable URIs.
		if (url.protocol !== "https:" && url.protocol !== "http:") {
			throw new APIError("BAD_REQUEST", {
				error: "invalid_client_metadata",
				error_description: "backchannel_logout_uri must use http or https",
			});
		}
		// Spec §2.2: "The backchannel_logout_uri MUST NOT include a fragment
		// component." Check the raw value rather than `url.hash`, which is empty
		// for a bare trailing `#` and would let that fragment delimiter through.
		if (clientWithDefaults.backchannel_logout_uri.includes("#")) {
			throw new APIError("BAD_REQUEST", {
				error: "invalid_client_metadata",
				error_description:
					"backchannel_logout_uri must not include a fragment component",
			});
		}
		const loopback = isLoopbackHost(url.hostname);
		// Spec §2.2: SHOULD be https for confidential clients. Enforce on
		// confidential clients, with a loopback carve-out (RFC 8252 §7.3) so
		// local development against http://127.0.0.1:<port> works.
		if (!isPublic && url.protocol !== "https:" && !loopback) {
			throw new APIError("BAD_REQUEST", {
				error: "invalid_client_metadata",
				error_description:
					"backchannel_logout_uri must use https for confidential clients",
			});
		}
		// SSRF guard: the OP issues an outbound POST to this URI on every
		// session end, so reject any host that is not publicly routable.
		// Loopback is exempt for local development (e.g.
		// http://127.0.0.1:<port> or https://localhost); non-loopback private,
		// link-local, tunneled, and cloud-metadata targets are always rejected.
		if (isPrivateHostname(url.hostname) && !loopback) {
			throw new APIError("BAD_REQUEST", {
				error: "invalid_client_metadata",
				error_description:
					"backchannel_logout_uri must not point to a private or reserved address",
			});
		}
	}
}

export async function createOAuthClientEndpoint(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	settings: {
		isRegister: boolean;
		/**
		 * Owner reference resolved by the caller (e.g. from an initial access
		 * token) to attach to the new client. Takes precedence over
		 * `clientReference`.
		 */
		referenceId?: string;
		/**
		 * Session already resolved by the caller, threaded to avoid resolving it
		 * twice. The DCR path provides it (possibly `null`); admin callers omit it
		 * and it is resolved here (cached by `sessionMiddleware`).
		 */
		session?: Awaited<ReturnType<typeof getSessionFromCtx>>;
		/**
		 * Pre-validated resource identifiers to link the new client to. Used
		 * by the DCR registration path (RFC 7591 §2 extension). Validation
		 * (existence, disabled) is the caller's responsibility — this branch
		 * only writes the link rows and echoes the field in the response.
		 */
		resources?: string[] | undefined;
	},
) {
	const body = applyOAuthClientRegistrationDefaults(ctx.body as OAuthClient);
	const session =
		settings.session !== undefined
			? settings.session
			: await getSessionFromCtx(ctx);

	// Single authorization chokepoint for OAuth client creation. Admin creation
	// always requires create privileges. DCR re-checks them only for
	// session-backed requests; non-session DCR was already authorized in
	// registerEndpoint (a valid initial access token, or open registration).
	if (!settings.isRegister || session) {
		await assertClientPrivileges(ctx, session, opts, "create");
	}

	// Determine whether registration request for public client
	// https://datatracker.ietf.org/doc/html/rfc7591#section-2
	const isPublic = body.token_endpoint_auth_method === "none";
	const isPrivateKeyJwt = body.token_endpoint_auth_method === "private_key_jwt";
	const isExtensionAuthMethod = isExtensionTokenEndpointAuthMethod(
		opts,
		body.token_endpoint_auth_method,
	);

	// Check if client parameters are valid combination
	await checkOAuthClient(body, opts, {
		...settings,
		ctx,
	});

	// Generate clientId and clientSecret based on its type
	const clientId =
		opts.generateClientId?.() || generateRandomString(32, "a-z", "A-Z");
	const clientSecret =
		isPublic || isPrivateKeyJwt || isExtensionAuthMethod
			? undefined
			: opts.generateClientSecret?.() || generateRandomString(32, "a-z", "A-Z");
	const storedClientSecret = clientSecret
		? await storeClientSecret(ctx, opts, clientSecret)
		: undefined;

	// Create the client with the existing schema
	const iat = Math.floor(Date.now() / 1000);
	// Ownership has one source per path: a caller-supplied referenceId (e.g. from
	// the initial access token) wins; otherwise a session-backed creation may
	// resolve one via clientReference. clientReference is never called without a
	// session, so it cannot misattribute a token-registered client.
	const referenceId =
		settings.referenceId ??
		(session && opts.clientReference
			? await opts.clientReference({
					user: session.user,
					session: session.session,
				})
			: undefined);
	const schema = oauthToSchema({
		...body,
		redirect_uris: body.redirect_uris ?? [],
		// Dynamic registration should not have disabled defined
		disabled: undefined,
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
	const resources = settings.resources ?? [];
	const client = await runWithTransaction(ctx.context.adapter, async () => {
		const createdClient = await ctx.context.adapter.create<
			SchemaClient<Scope[]>
		>({
			model: "oauthClient",
			data: {
				...schema,
				createdAt: new Date(iat * 1000),
				updatedAt: new Date(iat * 1000),
			},
		});

		// DCR resource linkage (RFC 7591 §2 extension). The caller pre-validated
		// each identifier; here we write the join rows in the same transaction as
		// the client so a failed link cannot leave a half-registered client.
		if (resources.length > 0) {
			const linkModel =
				opts.schema?.oauthClientResource?.modelName ?? "oauthClientResource";
			const now = new Date();
			for (const resourceId of resources) {
				// Deterministic id mirrors the admin link endpoint so the PK UNIQUE
				// constraint enforces composite (clientId, resourceId) uniqueness.
				await ctx.context.adapter.create({
					model: linkModel,
					forceAllowId: true,
					data: {
						id: buildClientResourceLinkId(clientId, resourceId),
						clientId,
						resourceId,
						createdAt: now,
					} as never,
				});
			}
		}
		return createdClient;
	});

	// Format the response according to RFC7591. When resources were linked
	// during registration, echo them back per RFC 7591 §3 server response
	// conventions — clients can verify the registration succeeded.
	const responseBody = schemaToOAuth({
		...client,
		clientSecret: clientSecret
			? (opts.prefix?.clientSecret ?? "") + clientSecret
			: undefined,
	});
	if (resources.length > 0) {
		(responseBody as OAuthClient & { resources?: string[] }).resources =
			resources;
	}
	// A newly created client is a 201 on every path (DCR and admin alike). The
	// response carries a client_secret; every endpoint that reaches here declares
	// `metadata: { noStore: true }`, so the no-store headers are applied at the
	// boundary (RFC 7591 §3.2.1). Only the created status is set here.
	ctx.setStatus(201);
	return ctx.json(responseBody);
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
		// Client key metadata (only one can be used)
		jwks: inputJwks,
		jwks_uri: jwksUri,
		// User Software Identifiers
		software_id: softwareId,
		software_version: softwareVersion,
		software_statement: softwareStatement,
		// Authentication Metadata
		redirect_uris: redirectUris,
		post_logout_redirect_uris: postLogoutRedirectUris,
		backchannel_logout_uri: backchannelLogoutUri,
		backchannel_logout_session_required: backchannelLogoutSessionRequired,
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
		dpop_bound_access_tokens: dpopBoundAccessTokens,
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
		backchannelLogoutUri,
		backchannelLogoutSessionRequired,
		tokenEndpointAuthMethod,
		grantTypes,
		responseTypes,
		// Client key metadata
		jwks: inputJwks
			? JSON.stringify({
					keys: Array.isArray(inputJwks)
						? inputJwks
						: (inputJwks as { keys: unknown[] }).keys,
				})
			: undefined,
		jwksUri: jwksUri,
		// RFC6749 Spec
		public: _public,
		type,
		// All other metadata
		skipConsent,
		enableEndSession,
		requirePKCE,
		dpopBoundAccessTokens,
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
		backchannelLogoutUri,
		backchannelLogoutSessionRequired,
		tokenEndpointAuthMethod,
		grantTypes,
		responseTypes,
		// RFC6749 Spec
		public: _public,
		type,
		// Jwks
		jwks,
		jwksUri,
		// All other metadata
		skipConsent,
		enableEndSession,
		requirePKCE,
		dpopBoundAccessTokens,
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
		// Client key metadata (only one can be used)
		jwks: jwks
			? (JSON.parse(jwks) as { keys: Record<string, unknown>[] })
			: undefined,
		jwks_uri: jwksUri ?? undefined,
		// User Software Identifiers
		software_id: softwareId ?? undefined,
		software_version: softwareVersion ?? undefined,
		software_statement: softwareStatement ?? undefined,
		// Authentication Metadata
		redirect_uris: redirectUris ?? [],
		post_logout_redirect_uris: postLogoutRedirectUris ?? undefined,
		backchannel_logout_uri: backchannelLogoutUri ?? undefined,
		backchannel_logout_session_required:
			backchannelLogoutSessionRequired ?? undefined,
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
		dpop_bound_access_tokens: dpopBoundAccessTokens ?? undefined,
		subject_type: subjectType ?? undefined,
		reference_id: referenceId ?? undefined,
	};
}
