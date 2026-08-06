import type { GenericEndpointContext } from "@better-auth/core";
import {
	getCurrentAdapter,
	runWithTransaction,
} from "@better-auth/core/context";
import { isLoopbackIP } from "@better-auth/core/utils/host";
import { isReverseDomainPrivateUseRedirectUri } from "@better-auth/core/utils/redirect-uri";
import { APIError, getSessionFromCtx, NO_STORE_HEADERS } from "better-auth/api";
import { generateRandomString } from "better-auth/crypto";
import { toExpJWT } from "better-auth/plugins";
import { validatePublicClientJwks } from "./client-jwks";
import { stripReservedOAuthClientMetadataExtensions } from "./client-metadata";
import {
	getSupportedAuthMethods,
	getSupportedGrantTypes,
	isExtensionTokenEndpointAuthMethod,
} from "./extensions";
import {
	normalizeClientCredentialsScopes,
	validateClientCredentialsScopes,
} from "./oauthClient/client-credentials";
import { assertClientPrivileges } from "./oauthClient/privileges";
import { getResource } from "./resources";
import type {
	ClientRegistrationRequest,
	OAuthClientAdministrativeResponse,
	OAuthClientRegistrationResponse,
	OAuthClientResource,
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

export type OAuthClientRegistrationMetadata = Omit<
	OAuthClient,
	"client_id" | "redirect_uris" | "client_secret_expires_at"
> & {
	client_id?: string;
	redirect_uris?: string[];
	client_secret_expires_at?: number | string;
	metadata?: Record<string, unknown>;
	resources?: string[];
};

function resolveClientRegistrationScopes(opts: OAuthOptions<Scope[]>): Scope[] {
	return [
		...new Set([
			...(opts.clientRegistrationDefaultScopes ?? opts.scopes ?? []),
			...(opts.clientRegistrationAllowedScopes ?? []),
		]),
	];
}

function resolveRegistrationGrantTypes(
	client: OAuthClientRegistrationMetadata,
): GrantType[] {
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
	client: OAuthClientRegistrationMetadata,
	grantTypes: GrantType[],
): OAuthClient["response_types"] {
	if (client.response_types) return client.response_types;
	return grantTypes.includes("authorization_code") ? ["code"] : undefined;
}

function applyOAuthClientRegistrationDefaults(
	client: OAuthClientRegistrationMetadata,
	defaultApplicationType: "web" | null = "web",
): OAuthClientRegistrationMetadata {
	const grantTypes = resolveRegistrationGrantTypes(client);
	return {
		...client,
		token_endpoint_auth_method:
			client.token_endpoint_auth_method ?? "client_secret_basic",
		application_type:
			client.application_type ??
			(defaultApplicationType === null ? undefined : defaultApplicationType),
		grant_types: grantTypes,
		response_types: resolveRegistrationResponseTypes(client, grantTypes),
	};
}

const FORBIDDEN_NATIVE_REDIRECT_SCHEMES = new Set([
	"file:",
	"ftp:",
	"mailto:",
	"javascript:",
	"data:",
	"vbscript:",
]);

function invalidRedirectUri(description: string): never {
	throw new APIError("BAD_REQUEST", {
		error: "invalid_redirect_uri",
		error_description: description,
	});
}

function getRawHttpHostname(redirectUri: string): string | null {
	const authority = /^http:\/\/([^/?#]*)/i.exec(redirectUri)?.[1];
	if (!authority) return null;
	const hostAndPort = authority.slice(authority.lastIndexOf("@") + 1);
	if (hostAndPort.startsWith("[")) {
		const bracketEnd = hostAndPort.indexOf("]");
		return bracketEnd < 0
			? null
			: hostAndPort.slice(0, bracketEnd + 1).toLowerCase();
	}
	return (hostAndPort.split(":")[0] ?? "").toLowerCase();
}

async function resolveClientRegistrationResources(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	requestedResources: readonly string[],
): Promise<string[]> {
	const defaultResources = opts.clientRegistrationDefaultResources ?? [];
	const allowedResources = new Set([
		...defaultResources,
		...(opts.clientRegistrationAllowedResources ?? []),
	]);
	for (const identifier of requestedResources) {
		if (!allowedResources.has(identifier)) {
			throw new APIError("BAD_REQUEST", {
				error: "invalid_target",
				error_description: `requested resource ${identifier} is not allowed for client registration`,
			});
		}
	}

	const resources = [...new Set([...defaultResources, ...requestedResources])];
	for (const identifier of resources) {
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
	return resources;
}

function validateClientRedirectUri(
	redirectUri: string,
	applicationType: "web" | "native",
) {
	let url: URL;
	try {
		url = new URL(redirectUri);
	} catch {
		invalidRedirectUri(`redirect URI must be an absolute URI: ${redirectUri}`);
	}
	if (
		redirectUri.includes("#") ||
		url.username.length > 0 ||
		url.password.length > 0
	) {
		invalidRedirectUri(
			`redirect URI must not include credentials or a fragment: ${redirectUri}`,
		);
	}

	const isHttp = url.protocol === "http:";
	const isHttps = url.protocol === "https:";
	if (/^localhost\.+$/i.test(url.hostname)) {
		invalidRedirectUri(
			`redirect URI localhost must not include trailing dots: ${redirectUri}`,
		);
	}
	const isRedirectLoopback =
		isLoopbackIP(url.hostname) || url.hostname === "localhost";
	const rawHttpHostname = getRawHttpHostname(redirectUri);
	const isAllowedNativeHttpLoopback =
		rawHttpHostname === "localhost" ||
		rawHttpHostname === "127.0.0.1" ||
		rawHttpHostname === "[::1]";

	if (applicationType === "web") {
		if (!isHttps || isRedirectLoopback) {
			invalidRedirectUri(
				`web clients require https redirect URIs on non-loopback hosts: ${redirectUri}`,
			);
		}
		return;
	}

	if (isHttps) {
		if (isRedirectLoopback) {
			invalidRedirectUri(
				`native clients must not use https loopback redirect URIs: ${redirectUri}`,
			);
		}
		return;
	}
	if (isHttp) {
		if (!isAllowedNativeHttpLoopback) {
			invalidRedirectUri(
				`native clients may use http only on the exact loopback hosts localhost, 127.0.0.1, or [::1]: ${redirectUri}`,
			);
		}
		return;
	}

	if (
		FORBIDDEN_NATIVE_REDIRECT_SCHEMES.has(url.protocol) ||
		!isReverseDomainPrivateUseRedirectUri(url)
	) {
		invalidRedirectUri(
			`native private-use redirect URI schemes must be well-formed reverse-domain names, omit the naming authority, and must not use a reserved scheme: ${redirectUri}`,
		);
	}
}

function assertValidRegistrationJwks(jwks: NonNullable<OAuthClient["jwks"]>) {
	const result = validatePublicClientJwks(jwks);
	if (!result.valid) {
		throw new APIError("BAD_REQUEST", {
			error: "invalid_client_metadata",
			error_description: result.error,
		});
	}
}

export async function registerEndpoint(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
): Promise<OAuthClientRegistrationResponse> {
	const body = ctx.body as ClientRegistrationRequest;

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

	const requestedResources = Array.isArray(body.resources)
		? body.resources.filter(
				(resource): resource is string =>
					typeof resource === "string" && resource.length > 0,
			)
		: [];

	if (session) {
		await assertClientPrivileges(ctx, session, opts, "create");
	}
	const referenceId =
		tokenAuthorization?.referenceId ??
		(session && opts.clientReference
			? await opts.clientReference({
					user: session.user,
					session: session.session,
				})
			: undefined);
	const response = await createOAuthClientRegistration(ctx, opts, {
		metadata: body,
		registrationSource: "dynamic",
		userId: referenceId ? undefined : session?.session.userId,
		referenceId,
		requestedResources,
	});
	ctx.setStatus(201);
	return ctx.json(response);
}

export async function checkOAuthClient(
	client: OAuthClientRegistrationMetadata,
	opts: OAuthOptions<Scope[]>,
	settings?: {
		registrationSource?: "dynamic" | "managed" | "clientMetadataDocument";
		ctx?: GenericEndpointContext;
	},
) {
	const isClientMetadataDocument =
		settings?.registrationSource === "clientMetadataDocument";
	const clientWithDefaults = applyOAuthClientRegistrationDefaults(
		client,
		isClientMetadataDocument ? null : "web",
	);
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

	const grantTypes = clientWithDefaults.grant_types ?? [];
	const responseTypes = clientWithDefaults.response_types;
	const applicationType = clientWithDefaults.application_type as unknown;
	if (
		applicationType !== undefined &&
		applicationType !== "web" &&
		applicationType !== "native"
	) {
		throw new APIError("BAD_REQUEST", {
			error: "invalid_client_metadata",
			error_description: "application_type must be web or native",
		});
	}

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

	for (const uri of clientWithDefaults.redirect_uris ?? []) {
		// A CIMD document may omit application_type. Preserve that absence in
		// storage while validating against the safe union of web and native
		// redirect forms. The native validator is that union: non-loopback HTTPS,
		// exact loopback HTTP, or an authority-free private-use scheme.
		validateClientRedirectUri(
			uri,
			(applicationType as "web" | "native" | undefined) ??
				(isClientMetadataDocument ? "native" : "web"),
		);
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
	const validatesRegistrationMetadata =
		settings?.registrationSource === "dynamic" ||
		settings?.registrationSource === "clientMetadataDocument";
	const allowedScopes = validatesRegistrationMetadata
		? resolveClientRegistrationScopes(opts)
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

	if (
		validatesRegistrationMetadata &&
		clientWithDefaults.require_pkce === false
	) {
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
				if (uri.username || uri.password) {
					throw new APIError("BAD_REQUEST", {
						error: "invalid_client_metadata",
						error_description: "jwks_uri must not contain credentials",
					});
				}
				// URL.hash is empty for a bare trailing `#`, so inspect the source value.
				if (clientWithDefaults.jwks_uri.includes("#")) {
					throw new APIError("BAD_REQUEST", {
						error: "invalid_client_metadata",
						error_description: "jwks_uri must not include a fragment component",
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
					const clientId =
						typeof clientWithDefaults.client_id === "string"
							? clientWithDefaults.client_id
							: undefined;
					const isSameOriginClientMetadataDocumentKey =
						isClientMetadataDocument &&
						clientId !== undefined &&
						URL.canParse(clientId) &&
						new URL(clientId).origin === uri.origin;
					if (!isSameOriginClientMetadataDocumentKey) {
						throw new APIError("BAD_REQUEST", {
							error: "invalid_client_metadata",
							error_description:
								"jwks_uri must belong to a trusted origin or the Client ID Metadata Document origin",
						});
					}
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
			assertValidRegistrationJwks(clientWithDefaults.jwks);
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
		if (url.protocol !== "https:") {
			throw new APIError("BAD_REQUEST", {
				error: "invalid_client_metadata",
				error_description: "backchannel_logout_uri must use https",
			});
		}
		if (url.username || url.password) {
			throw new APIError("BAD_REQUEST", {
				error: "invalid_client_metadata",
				error_description:
					"backchannel_logout_uri must not contain credentials",
			});
		}
		// SSRF guard: the OP issues an outbound POST to this URI on every
		// session end, so every target must be publicly routable.
		if (isPrivateHostname(url.hostname)) {
			throw new APIError("BAD_REQUEST", {
				error: "invalid_client_metadata",
				error_description:
					"backchannel_logout_uri must not point to a private or reserved address",
			});
		}
	}
}

interface CreateOAuthClientRegistrationBaseInput {
	/** Validated endpoint metadata or trusted internal metadata. */
	metadata: OAuthClientRegistrationMetadata;
	/** Already-authorized owner inputs resolved by the endpoint adapter. */
	userId?: string;
	referenceId?: string;
	/** Internal fixed identifier seam for verified client discovery. */
	clientId?: string;
}

export type CreateOAuthClientRegistrationInput =
	| (CreateOAuthClientRegistrationBaseInput & {
			registrationSource: "dynamic";
			/** Client-requested DCR resources resolved and linked by the operation. */
			requestedResources?: string[];
	  })
	| (CreateOAuthClientRegistrationBaseInput & {
			registrationSource: "managed";
			requestedResources?: never;
			/** Server-owned scope ceiling configured by an administrator. */
			clientCredentialsScopes?: Scope[];
	  });

export interface OAuthClientRegistrationResult {
	client: SchemaClient<Scope[]>;
	clientSecret?: string;
	resources: string[];
	created: boolean;
}

export interface RegisterClientMetadataDocumentInput {
	metadata: OAuthClient;
	clientId: string;
	clientDiscoveryId: string;
	existingClient?: SchemaClient<Scope[]>;
}

const CLIENT_REGISTRATION_COLLISION = Symbol("client-registration-collision");

type ClientRegistrationCollision =
	| {
			[CLIENT_REGISTRATION_COLLISION]: true;
			kind: "oauth-client-row-unique";
			clientId: string;
			cause: unknown;
	  }
	| {
			[CLIENT_REGISTRATION_COLLISION]: true;
			kind: "oauth-client-resource-link-unique";
			clientId: string;
			resourceId: string;
			cause: unknown;
	  };

function isClientRegistrationCollision(
	error: unknown,
): error is ClientRegistrationCollision {
	if (!error || typeof error !== "object") return false;
	const candidate = error as {
		[CLIENT_REGISTRATION_COLLISION]?: unknown;
		kind?: unknown;
		cause?: unknown;
	};
	return (
		candidate[CLIENT_REGISTRATION_COLLISION] === true &&
		(candidate.kind === "oauth-client-row-unique" ||
			candidate.kind === "oauth-client-resource-link-unique") &&
		"cause" in candidate
	);
}

/**
 * Creates and persists one canonical OAuth client registration.
 *
 * Authorization and ownership resolution belong to endpoint adapters. This
 * operation owns metadata normalization, validation, credentials, persistence,
 * and resource links so canonical creation paths share one transactional
 * boundary.
 */
async function persistOAuthClientRegistration(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	input:
		| CreateOAuthClientRegistrationInput
		| (RegisterClientMetadataDocumentInput & {
				registrationSource: "clientMetadataDocument";
		  }),
): Promise<OAuthClientRegistrationResult> {
	const registrationMetadata =
		input.registrationSource === "dynamic" && !input.metadata.scope
			? {
					...input.metadata,
					scope: (opts.clientRegistrationDefaultScopes ?? opts.scopes)?.join(
						" ",
					),
				}
			: input.metadata;
	const body = applyOAuthClientRegistrationDefaults(
		registrationMetadata,
		input.registrationSource === "clientMetadataDocument" ? null : "web",
	);

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
		registrationSource: input.registrationSource,
		ctx,
	});

	// Generate clientId and clientSecret based on its type
	const clientId =
		input.clientId ??
		opts.generateClientId?.() ??
		generateRandomString(32, "a-z", "A-Z");
	const clientSecret =
		isPublic || isPrivateKeyJwt || isExtensionAuthMethod
			? undefined
			: opts.generateClientSecret?.() || generateRandomString(32, "a-z", "A-Z");
	const storedClientSecret = clientSecret
		? await storeClientSecret(ctx, opts, clientSecret)
		: undefined;
	const isPKCEOptionalForRegisteredClient =
		input.registrationSource === "dynamic" &&
		!isPublic &&
		opts.clientRegistrationRequirePKCE === false;
	const requirePKCE =
		body.require_pkce ??
		(isPKCEOptionalForRegisteredClient ? false : undefined);

	// Create the client with the existing schema
	const iat = Math.floor(Date.now() / 1000);
	const effectiveBody =
		input.registrationSource === "dynamic" ||
		input.registrationSource === "clientMetadataDocument"
			? {
					...body,
					scope: resolveClientRegistrationScopes(opts).join(" "),
				}
			: body;
	const { resources: _requestedResources, ...persistableBody } = effectiveBody;
	const owner =
		input.registrationSource === "clientMetadataDocument"
			? undefined
			: {
					userId: input.userId,
					referenceId: input.referenceId,
				};
	const schema = oauthToSchema({
		...persistableBody,
		redirect_uris: body.redirect_uris ?? [],
		// Dynamic registration should not have disabled defined
		disabled: undefined,
		// Required if client secret is issued
		client_secret_expires_at: storedClientSecret
			? input.registrationSource === "dynamic" &&
				opts.clientRegistrationClientSecretExpiration
				? toExpJWT(opts.clientRegistrationClientSecretExpiration, iat)
				: 0
			: undefined,
		// Override
		client_id: clientId,
		client_secret: storedClientSecret,
		client_id_issued_at: iat,
		require_pkce: requirePKCE,
		user_id: owner?.referenceId ? undefined : owner?.userId,
		reference_id: owner?.referenceId,
	});
	schema.clientCredentialsScopes =
		input.registrationSource === "clientMetadataDocument"
			? (input.existingClient?.clientCredentialsScopes ?? [])
			: input.registrationSource === "managed"
				? (input.clientCredentialsScopes ?? [])
				: [];
	schema.clientDiscoveryId =
		input.registrationSource === "clientMetadataDocument"
			? input.clientDiscoveryId
			: null;
	if (
		input.registrationSource === "clientMetadataDocument" &&
		body.application_type === undefined
	) {
		schema.applicationType = null;
	}
	const resources = await resolveClientRegistrationResources(
		ctx,
		opts,
		input.registrationSource === "dynamic"
			? (input.requestedResources ?? [])
			: [],
	);
	const clientModel = opts.schema?.oauthClient?.modelName ?? "oauthClient";
	const clientResourceModel =
		opts.schema?.oauthClientResource?.modelName ?? "oauthClientResource";
	const existingClient =
		input.registrationSource === "clientMetadataDocument"
			? input.existingClient
			: undefined;
	const clientDiscoveryId =
		input.registrationSource === "clientMetadataDocument"
			? input.clientDiscoveryId
			: null;
	const persistenceResult = await runWithTransaction(
		ctx.context.adapter,
		async () => {
			const adapter = await getCurrentAdapter(ctx.context.adapter);
			let storedClient: SchemaClient<Scope[]>;
			let created = false;
			if (existingClient) {
				const updatedClient = await adapter.update<SchemaClient<Scope[]>>({
					model: clientModel,
					where: [
						{ field: "clientId", value: clientId },
						{
							field: "clientDiscoveryId",
							value: clientDiscoveryId,
						},
					],
					update: {
						...schema,
						disabled: existingClient.disabled,
						skipConsent: existingClient.skipConsent,
						enableEndSession: existingClient.enableEndSession,
						createdAt: existingClient.createdAt,
						updatedAt: new Date(iat * 1000),
					},
				});
				if (!updatedClient) {
					throw new APIError("BAD_REQUEST", {
						error: "invalid_client",
						error_description: "client no longer exists",
					});
				}
				storedClient = updatedClient;
			} else {
				try {
					storedClient = await adapter.create<SchemaClient<Scope[]>>({
						model: clientModel,
						data: {
							...schema,
							createdAt: new Date(iat * 1000),
							updatedAt: new Date(iat * 1000),
						},
					});
				} catch (error) {
					if (
						input.registrationSource === "clientMetadataDocument" &&
						isUniqueConstraintError(error)
					) {
						throw {
							[CLIENT_REGISTRATION_COLLISION]: true,
							kind: "oauth-client-row-unique",
							clientId,
							cause: error,
						} satisfies ClientRegistrationCollision;
					}
					throw error;
				}
				created = true;
			}

			const linkedResources =
				resources.length === 0
					? []
					: await adapter.findMany<OAuthClientResource>({
							model: clientResourceModel,
							where: [{ field: "clientId", value: clientId }],
						});
			const linkedResourceIds = new Set(
				linkedResources.map((link) => link.resourceId),
			);
			const now = new Date();
			for (const resourceId of resources) {
				if (linkedResourceIds.has(resourceId)) continue;
				try {
					await adapter.create<OAuthClientResource>({
						model: clientResourceModel,
						data: {
							clientId,
							resourceId,
							createdAt: now,
						},
					});
				} catch (error) {
					if (
						input.registrationSource === "clientMetadataDocument" &&
						isUniqueConstraintError(error)
					) {
						throw {
							[CLIENT_REGISTRATION_COLLISION]: true,
							kind: "oauth-client-resource-link-unique",
							clientId,
							resourceId,
							cause: error,
						} satisfies ClientRegistrationCollision;
					}
					throw error;
				}
			}
			return { client: storedClient, created };
		},
	);

	return {
		client: persistenceResult.client,
		clientSecret,
		resources,
		created: persistenceResult.created,
	};
}

function createOAuthClientRegistrationResponse(
	result: OAuthClientRegistrationResult,
	opts: OAuthOptions<Scope[]>,
): OAuthClientRegistrationResponse {
	const responseBody: OAuthClientRegistrationResponse = schemaToOAuth({
		...result.client,
		clientSecret: result.clientSecret
			? (opts.prefix?.clientSecret ?? "") + result.clientSecret
			: undefined,
	});
	if (result.resources.length > 0) responseBody.resources = result.resources;
	return responseBody;
}

function createOAuthClientAdministrativeResponse(
	result: OAuthClientRegistrationResult,
	opts: OAuthOptions<Scope[]>,
): OAuthClientAdministrativeResponse {
	return {
		...createOAuthClientRegistrationResponse(result, opts),
		client_credentials_scopes: [
			...(result.client.clientCredentialsScopes ?? []),
		],
	};
}

/**
 * Creates and persists one canonical OAuth client registration.
 */
async function createOAuthClientRegistration(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	input: CreateOAuthClientRegistrationInput,
): Promise<OAuthClientRegistrationResponse> {
	const result = await persistOAuthClientRegistration(ctx, opts, input);
	return createOAuthClientRegistrationResponse(result, opts);
}

async function createOAuthClientAdministrativeRegistration(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	input: CreateOAuthClientRegistrationInput,
): Promise<OAuthClientAdministrativeResponse> {
	const result = await persistOAuthClientRegistration(ctx, opts, input);
	return createOAuthClientAdministrativeResponse(result, opts);
}

function assertClientDiscoveryOwnership(
	client: SchemaClient<Scope[]> | undefined,
	clientDiscoveryId: string,
): void {
	if (!client || client.clientDiscoveryId === clientDiscoveryId) return;
	throw new APIError("BAD_REQUEST", {
		error: "invalid_client",
		error_description:
			"client_id is already owned by a different registration source",
	});
}

/**
 * First-party persistence seam for a validated Client ID Metadata Document.
 *
 * This operation owns both initial creation and atomic replacement. It never
 * generates a client secret, preserves operator-controlled flags on
 * replacement, and ensures server-default resource links in the same
 * transaction.
 *
 * @internal
 */
export async function registerClientMetadataDocument(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	input: RegisterClientMetadataDocumentInput,
): Promise<OAuthClientRegistrationResult> {
	assertClientDiscoveryOwnership(input.existingClient, input.clientDiscoveryId);
	if (
		input.metadata.backchannel_logout_uri !== undefined ||
		input.metadata.backchannel_logout_session_required !== undefined
	) {
		throw new APIError("BAD_REQUEST", {
			error: "invalid_client_metadata",
			error_description:
				"Client ID Metadata Documents cannot register a back-channel logout target",
		});
	}
	if (
		(input.metadata.token_endpoint_auth_method ?? "none") !== "none" &&
		input.metadata.token_endpoint_auth_method !== "private_key_jwt"
	) {
		throw new APIError("BAD_REQUEST", {
			error: "invalid_client_metadata",
			error_description:
				"Client ID Metadata Document clients cannot use a shared secret",
		});
	}
	const registrationInput = {
		...input,
		metadata: {
			...input.metadata,
			token_endpoint_auth_method:
				input.metadata.token_endpoint_auth_method ?? "none",
			client_secret: undefined,
			client_secret_expires_at: undefined,
		},
		registrationSource: "clientMetadataDocument" as const,
	};
	try {
		return await persistOAuthClientRegistration(ctx, opts, registrationInput);
	} catch (error) {
		if (!isClientRegistrationCollision(error)) throw error;
		const clientModel = opts.schema?.oauthClient?.modelName ?? "oauthClient";
		const clientResourceModel =
			opts.schema?.oauthClientResource?.modelName ?? "oauthClientResource";
		const currentClient = await ctx.context.adapter.findOne<
			SchemaClient<Scope[]>
		>({
			model: clientModel,
			where: [{ field: "clientId", value: input.clientId }],
		});
		if (
			error.clientId !== input.clientId ||
			!currentClient ||
			currentClient.clientDiscoveryId !== input.clientDiscoveryId
		) {
			throw error.cause;
		}
		if (error.kind === "oauth-client-resource-link-unique") {
			const exactLink = await ctx.context.adapter.findOne<OAuthClientResource>({
				model: clientResourceModel,
				where: [
					{ field: "clientId", value: error.clientId },
					{ field: "resourceId", value: error.resourceId },
				],
			});
			if (!exactLink) throw error.cause;
		}
		try {
			return await persistOAuthClientRegistration(ctx, opts, {
				...registrationInput,
				existingClient: currentClient,
			});
		} catch (retryError) {
			if (isClientRegistrationCollision(retryError)) {
				throw retryError.cause;
			}
			throw retryError;
		}
	}
}

function isUniqueConstraintError(error: unknown): boolean {
	if (!error || typeof error !== "object") return false;
	const candidate = error as {
		code?: unknown;
		errno?: unknown;
		name?: unknown;
		message?: unknown;
	};
	const code = String(candidate.code ?? candidate.errno ?? "");
	if (
		[
			"1062",
			"11000",
			"23505",
			"ER_DUP_ENTRY",
			"P2002",
			"SQLITE_CONSTRAINT_UNIQUE",
		].includes(code)
	) {
		return true;
	}
	if (candidate.name === "MongoServerError" && candidate.code === 11000) {
		return true;
	}
	return (
		typeof candidate.message === "string" &&
		/(?:duplicate|unique constraint|unique key)/i.test(candidate.message)
	);
}

export function createOAuthClientEndpoint(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	settings: { admin: true },
): Promise<OAuthClientAdministrativeResponse>;
export function createOAuthClientEndpoint(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	settings?: { admin?: false },
): Promise<OAuthClientRegistrationResponse>;
export async function createOAuthClientEndpoint(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	settings?: { admin?: boolean },
): Promise<
	OAuthClientAdministrativeResponse | OAuthClientRegistrationResponse
> {
	const session = await getSessionFromCtx(ctx);
	await assertClientPrivileges(ctx, session, opts, "create");
	if (!session) throw new APIError("UNAUTHORIZED");
	const referenceId = opts.clientReference
		? await opts.clientReference({
				user: session.user,
				session: session.session,
			})
		: undefined;
	const { client_credentials_scopes: rawClientCredentialsScopes, ...metadata } =
		ctx.body as OAuthClientRegistrationMetadata & {
			client_credentials_scopes?: string[];
		};
	const clientCredentialsScopes = settings?.admin
		? normalizeClientCredentialsScopes(rawClientCredentialsScopes ?? [])
		: [];
	const grantTypes = resolveRegistrationGrantTypes(metadata);
	validateClientCredentialsScopes(
		clientCredentialsScopes,
		grantTypes,
		metadata.token_endpoint_auth_method,
		opts,
	);
	if (clientCredentialsScopes.length > 0) {
		await assertClientPrivileges(
			ctx,
			session,
			opts,
			"configure-client-credentials-scopes",
		);
	}
	const registrationInput: CreateOAuthClientRegistrationInput = {
		metadata,
		registrationSource: "managed",
		userId: referenceId ? undefined : session.session.userId,
		referenceId,
		clientCredentialsScopes,
	};
	const responseBody = settings?.admin
		? await createOAuthClientAdministrativeRegistration(
				ctx,
				opts,
				registrationInput,
			)
		: await createOAuthClientRegistration(ctx, opts, registrationInput);
	ctx.setStatus(201);
	return ctx.json(responseBody);
}

/**
 * Converts an OAuth 2.0 Dynamic Client Schema to a Database Schema
 *
 * @param input
 * @returns
 */
export function oauthToSchema(
	input: OAuthClientRegistrationMetadata & {
		client_id: string;
		client_secret_expires_at?: number;
	},
): SchemaClient<Scope[]>;
export function oauthToSchema(
	input: OAuthClientRegistrationMetadata,
): Partial<SchemaClient<Scope[]>>;
export function oauthToSchema(
	input: OAuthClientRegistrationMetadata,
): Partial<SchemaClient<Scope[]>> {
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
		application_type: applicationType,
		// Not Part of RFC7591 Spec
		disabled,
		skip_consent: skipConsent,
		enable_end_session: enableEndSession,
		require_pkce: requirePKCE,
		dpop_bound_access_tokens: dpopBoundAccessTokens,
		subject_type: subjectType,
		reference_id: referenceId,
		metadata: inputMetadata,
	} = input;

	// Type conversions
	const expiresAt = _expiresAt
		? new Date(Number(_expiresAt) * 1000)
		: undefined;
	const createdAt = _createdAt ? new Date(_createdAt * 1000) : undefined;
	const scopes = _scope?.split(" ");
	const metadataObj = stripReservedOAuthClientMetadataExtensions(
		inputMetadata ?? {},
	);
	const metadata =
		metadataObj && Object.keys(metadataObj).length
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
		jwks: inputJwks ? JSON.stringify(inputJwks) : undefined,
		jwksUri: jwksUri,
		applicationType,
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
		applicationType,
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
	const _metadata = stripReservedOAuthClientMetadataExtensions(
		parseClientMetadata(metadata),
	);

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
		application_type: applicationType ?? undefined,
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
