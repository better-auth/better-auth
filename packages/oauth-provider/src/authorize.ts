import type { GenericEndpointContext } from "@better-auth/core";
import { isBrowserFetchRequest } from "@better-auth/core/utils/fetch-metadata";
import { isLoopbackHost, isLoopbackIP } from "@better-auth/core/utils/host";
import { appendQueryParams } from "@better-auth/core/utils/url";
import { getSessionFromCtx } from "better-auth/api";
import { generateRandomString, makeSignature } from "better-auth/crypto";
import type { Verification } from "better-auth/db";
import { APIError } from "better-call";
import {
	getAcrValuesSupported,
	LEVEL_0_ACR,
	resolveAuthenticationContext,
} from "./authentication-context";
import {
	canSatisfyEssentialAcrRequest,
	getRequestedUserInfoClaims,
	isValidOidcClaimsRequest,
} from "./claims-request";
import { getExtensionInteractionRequest } from "./extensions";
import { oAuthState } from "./oauth";
import type { OAuthErrorCode, OAuthRedirectOnError } from "./oauth-endpoint";
import { mapIssuesToOAuthError } from "./oauth-endpoint";
import { resolveResourcePolicy } from "./resources";
import {
	canonicalizeOAuthQueryParams,
	postLoginClearedParam,
	setSignedOAuthQueryParameterNames,
	signedQueryIssuedAtParam,
} from "./signed-query";
import { getSupportedClaims } from "./standard-claims";
import type {
	OAuthAuthenticationContext,
	OAuthAuthorizationQuery,
	OAuthInteractionQuery,
	OAuthInteractionRequest,
	OAuthOptions,
	Scope,
	VerificationValue,
} from "./types";
import { authorizationQuerySchema, SafeUrlSchema } from "./types/zod";

import {
	clientAllowsGrant,
	consentCovers,
	findConsent,
	getClient,
	getConsentReferenceId,
	getJwtPlugin,
	isPKCERequired,
	parsePrompt,
	storeToken,
	toResourceList,
} from "./utils";

/**
 * Whether a past authentication is still fresh enough for an OIDC `max_age`
 * request: true when no more than `maxAge` seconds have elapsed since the user
 * last authenticated. The caller supplies `now`, keeping this pure.
 */
function isWithinMaxAge(
	sessionCreatedAt: Date,
	maxAgeSeconds: number,
	now: Date,
): boolean {
	if (maxAgeSeconds === 0) return false;
	return now.getTime() - sessionCreatedAt.getTime() <= maxAgeSeconds * 1000;
}

export type OAuthRedirectResult = {
	redirect: true;
	url: string;
};

function removeMaxAgeFromAuthorizationQuery<
	Query extends { max_age?: number | undefined },
>(query: Query): Omit<Query, "max_age"> {
	const { max_age: _maxAge, ...queryWithoutMaxAge } = query;
	return queryWithoutMaxAge;
}

/**
 * Formats an error url. Per OIDC Core 1.0 §5 / RFC 6749 §4.2.2.1, errors on
 * implicit and hybrid flows are delivered in the URL fragment, not the query.
 * Callers on the code flow (default) omit `mode` and get query delivery.
 */
export function formatErrorURL(
	url: string,
	error: OAuthErrorCode,
	description: string,
	state?: string,
	iss?: string,
	mode: "query" | "fragment" = "query",
) {
	const searchParams = new URLSearchParams({
		error,
		error_description: description,
	});
	state && searchParams.append("state", state);
	iss && searchParams.append("iss", iss);
	if (mode === "fragment") {
		return `${url}#${searchParams.toString()}`;
	}
	return appendQueryParams(url, searchParams);
}

/**
 * Selects the response mode for an error redirect to the RP. OIDC Core 1.0 §5
 * defines defaults based on response_type: `code` → query, types containing
 * `token` / `id_token` → fragment. An explicit `response_mode` overrides.
 *
 * When `response_type` is duplicated (array) or absent, we can't trust the
 * caller's intent, so we default to query — the safer channel for
 * unrecognized shapes.
 */
function deriveResponseMode(
	raw: Record<string, unknown>,
): "query" | "fragment" {
	const responseMode =
		typeof raw.response_mode === "string" ? raw.response_mode : undefined;
	if (responseMode === "fragment") return "fragment";
	if (responseMode === "query") return "query";
	const responseType =
		typeof raw.response_type === "string" ? raw.response_type : undefined;
	if (responseType && /\b(token|id_token)\b/.test(responseType)) {
		return "fragment";
	}
	return "query";
}

const authorizationQueryErrorCodesByField = {
	response_type: { invalid: "unsupported_response_type" },
	resource: { invalid: "invalid_target" },
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getStringParameter(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function getAuthorizationRequestParameters(
	ctx: GenericEndpointContext,
	settings: AuthorizeEndpointSettings | undefined,
): OAuthAuthorizationQuery {
	const source =
		ctx.method === "POST" && settings?.isAuthorize === true
			? ctx.body
			: ctx.query;
	const parameters = isRecord(source) ? source : {};
	return { ...parameters } as unknown as OAuthAuthorizationQuery;
}

export const handleRedirect = (
	ctx: GenericEndpointContext,
	uri: string,
): OAuthRedirectResult => {
	const fromFetch = isBrowserFetchRequest(ctx.request?.headers);
	const acceptJson = ctx.headers?.get("accept")?.includes("application/json");
	if (fromFetch || acceptJson) {
		return {
			redirect: true,
			url: uri.toString(),
		};
	} else {
		throw ctx.redirect(uri);
	}
};

/** Sends an OAuth error to the client's redirect URI, or to the error page without one. */
function redirectWithAuthorizationError(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	query: OAuthInteractionQuery,
	error: OAuthErrorCode,
	description: string,
) {
	return handleRedirect(
		ctx,
		query.redirect_uri
			? formatErrorURL(
					query.redirect_uri,
					error,
					description,
					query.state,
					getIssuer(ctx, opts),
				)
			: getErrorURL(ctx, error, description),
	);
}

/**
 * Returns the URL that reports an `APIError`: `errorPage` when given, otherwise
 * the provider error page. Rethrows anything else.
 */
export function getAPIErrorURL(
	ctx: GenericEndpointContext,
	error: unknown,
	errorPage?: string,
) {
	if (!(error instanceof APIError)) throw error;
	const body = error.body as
		| { error?: OAuthErrorCode; error_description?: string }
		| undefined;
	const code = body?.error ?? "invalid_request";
	const description = body?.error_description ?? "invalid request";
	return errorPage
		? formatErrorURL(errorPage, code, description)
		: getErrorURL(ctx, code, description);
}

/**
 * Validates that the issuer URL
 * - MUST use HTTPS scheme (HTTP allowed for localhost in dev)
 * - MUST NOT contain query components
 * - MUST NOT contain fragment components
 *
 * @returns The validated issuer URL, or a sanitized version if invalid
 */
export function validateIssuerUrl(issuer: string): string {
	try {
		const url = new URL(issuer);

		if (url.protocol !== "https:" && !isLoopbackHost(url.host)) {
			url.protocol = "https:";
		}

		url.search = "";
		url.hash = "";

		return url.toString().replace(/\/$/, "");
	} catch {
		// If URL parsing fails, return as-is
		return issuer;
	}
}

/**
 * Gets the issuer identifier
 */
export function getIssuer(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
): string {
	let issuer: string;

	if (opts.disableJwtPlugin) {
		issuer = ctx.context.baseURL;
	} else {
		try {
			const jwtPluginOptions = getJwtPlugin(ctx.context).options;
			issuer = jwtPluginOptions?.jwt?.issuer ?? ctx.context.baseURL;
		} catch {
			issuer = ctx.context.baseURL;
		}
	}

	return validateIssuerUrl(issuer);
}

/**
 * Error page url if redirect_uri has not been verified yet
 * Generates Url for custom error page
 */
function getErrorURL(
	ctx: GenericEndpointContext,
	error: OAuthErrorCode,
	description: string,
) {
	const baseURL =
		ctx.context.options.onAPIError?.errorURL || `${ctx.context.baseURL}/error`;
	const formattedURL = formatErrorURL(baseURL, error, description);
	return formattedURL;
}

/**
 * Based on the loopback port matching approach in node-oidc-provider.
 *
 * @see https://github.com/panva/node-oidc-provider/blob/ea1456f987de7750b6af8a89a1881e70c70827fe/lib/models/client.js#L36-L76
 */
function stripLoopbackRedirectPort(uri: string): string | undefined {
	let parsed: URL;
	try {
		parsed = new URL(uri);
	} catch {
		return undefined;
	}

	const isLoopback =
		isLoopbackIP(parsed.hostname) || parsed.hostname === "localhost";

	if (parsed.protocol !== "http:" || !isLoopback) {
		return undefined;
	}

	const schemeSeparatorIndex = uri.indexOf("://");
	if (schemeSeparatorIndex < 0) return undefined;

	const authorityStart = schemeSeparatorIndex + 3;
	const authorityEndOffset = uri.slice(authorityStart).search(/[/?#]/u);
	let authorityEnd = uri.length;
	if (authorityEndOffset >= 0) {
		authorityEnd = authorityStart + authorityEndOffset;
	}
	const authority = uri.slice(authorityStart, authorityEnd);

	let portStart: number;
	if (authority.startsWith("[")) {
		const closingBracket = authority.indexOf("]");
		if (closingBracket < 0) return undefined;
		if (authority[closingBracket + 1] !== ":") return uri;

		portStart = closingBracket + 1;
	} else {
		portStart = authority.lastIndexOf(":");
		if (portStart < 0) return uri;
	}

	const port = authority.slice(portStart + 1);
	if (!/^\d*$/u.test(port)) {
		return undefined;
	}

	const portStartInUri = authorityStart + portStart;
	return `${uri.slice(0, portStartInUri)}${uri.slice(authorityEnd)}`;
}

/**
 * Finds the matching entry in a client's registered redirect URIs.
 *
 * Registration limits loopback redirects to native-compatible HTTP forms.
 * Within that boundary, only the port may vary; every other character must
 * match the registered URI.
 *
 * @see https://www.rfc-editor.org/rfc/rfc9700.html#section-4.1.3
 * @see https://www.rfc-editor.org/rfc/rfc8252.html#section-8.3
 */
function findRegisteredRedirectUri(
	registered: readonly string[] | undefined,
	requested: string | undefined,
): string | undefined {
	if (!registered || !requested) return undefined;

	let requestedUrl: URL;
	try {
		requestedUrl = new URL(requested);
	} catch {
		return undefined;
	}

	/**
	 * A trailing `#` yields an empty `URL.hash` but still defines a fragment.
	 */
	const hasFragment = requested.includes("#");
	const hasUserinfo =
		requestedUrl.username.length > 0 || requestedUrl.password.length > 0;

	if (hasFragment || hasUserinfo) {
		return undefined;
	}
	const requestedWithoutPort = stripLoopbackRedirectPort(requested);

	return registered.find((url) => {
		if (url === requested) return true;
		if (!requestedWithoutPort) return false;
		return stripLoopbackRedirectPort(url) === requestedWithoutPort;
	});
}

/** Keep URI syntax and credential checks outside the custom trust decision. */
function isSafeCustomRedirectUri(uri: string): boolean {
	if (!SafeUrlSchema.safeParse(uri).success) return false;
	const parsed = new URL(uri);
	return parsed.username.length === 0 && parsed.password.length === 0;
}

/**
 * Loads the client, verifies it's enabled, and returns the requested
 * redirect_uri when it matches a registered entry (or is accepted by the
 * custom `validateRedirectUri` option, mirroring the authorize endpoint's
 * validation). Returns null whenever the RP cannot be safely reached, so
 * callers can fall back to the server error page (avoiding open-redirect
 * risk on validation failures).
 */
async function resolveTrustedRedirectUri(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	clientId: string | undefined,
	redirectUri: string | undefined,
): Promise<string | null> {
	if (!clientId || !redirectUri) return null;
	let client: Awaited<ReturnType<typeof getClient>> | undefined;
	try {
		client = await getClient(ctx, opts, clientId);
	} catch {
		return null;
	}
	if (!client || client.disabled) return null;
	const registeredUris = client.redirectUris ?? [];
	const matched = findRegisteredRedirectUri(registeredUris, redirectUri);
	if (opts.validateRedirectUri) {
		if (!isSafeCustomRedirectUri(redirectUri)) return null;
		try {
			const isValid = await opts.validateRedirectUri(
				redirectUri,
				registeredUris,
				Boolean(matched),
			);
			return isValid ? redirectUri : null;
		} catch {
			return null;
		}
	}
	return matched ? redirectUri : null;
}

/**
 * `redirectOnError` callback for `/oauth2/authorize`. Per RFC 6749 §4.1.2.1,
 * authorize errors MUST be delivered to the client's `redirect_uri` with
 * `error`, `error_description`, `state`, and (RFC 9207) `iss`. The clause
 * carves out one case: a missing/invalid `redirect_uri` or `client_id` MUST
 * NOT redirect to the requested URI. We implement the carve-out via
 * `resolveTrustedRedirectUri`, falling back to the server error page.
 *
 * Channel (query vs fragment) follows OIDC Core §5 via `deriveResponseMode`.
 */
export function authorizeRedirectOnError(
	opts: OAuthOptions<Scope[]>,
): OAuthRedirectOnError<GenericEndpointContext, OAuthRedirectResult> {
	return async ({ error, error_description, ctx }) => {
		const raw = (ctx.query ?? {}) as Record<string, unknown>;
		const clientId =
			typeof raw.client_id === "string" ? raw.client_id : undefined;
		const redirectUriRaw =
			typeof raw.redirect_uri === "string" ? raw.redirect_uri : undefined;
		const trusted = await resolveTrustedRedirectUri(
			ctx,
			opts,
			clientId,
			redirectUriRaw,
		);
		if (trusted) {
			return handleRedirect(
				ctx,
				formatErrorURL(
					trusted,
					error,
					error_description,
					typeof raw.state === "string" ? raw.state : undefined,
					getIssuer(ctx, opts),
					deriveResponseMode(raw),
				),
			);
		}
		return handleRedirect(ctx, getErrorURL(ctx, error, error_description));
	};
}

export type AuthorizeEndpointSettings = {
	isAuthorize?: boolean;
	postLogin?: boolean;
	isPostLoginContinuation?: boolean;
	/**
	 * Set only by the consent endpoint, in the request where the user accepts:
	 * the reference the consent was stored under.
	 */
	acceptedConsent?: { referenceId?: string };
};

export async function authorizeEndpoint(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	settings?: AuthorizeEndpointSettings,
): Promise<OAuthRedirectResult> {
	if (!ctx.request) {
		throw new APIError("UNAUTHORIZED", {
			error_description: "request not found",
			error: "invalid_request",
		});
	}
	const request = ctx.request;

	// Normalize GET query serialization and POST form serialization through one
	// authorization-request path (OIDC Core §3.1.2.1).
	let query: OAuthAuthorizationQuery = getAuthorizationRequestParameters(
		ctx,
		settings,
	);

	const interaction = getExtensionInteractionRequest(opts, query);
	if (interaction) {
		// A direct request learns nothing about the request until sign-in.
		if (settings?.isAuthorize === true && !(await getSessionFromCtx(ctx))) {
			ctx.query = { [interaction.parameter]: interaction.value };
			return redirectWithPromptCode(ctx, opts, "login");
		}
		const errorPage = interaction.handler.errorPage?.({
			ctx,
			value: interaction.value,
		});
		const toErrorURL = (error: unknown) =>
			getAPIErrorURL(ctx, error, errorPage);
		let interactionRequest: OAuthInteractionRequest;
		try {
			interactionRequest = await interaction.handler.load({
				ctx,
				opts,
				value: interaction.value,
				// Resumed queries were signed by this server; a direct request is not.
				signedQuery: settings?.isAuthorize === true ? undefined : query,
			});
			if (interactionRequest.client.disabled) {
				throw new APIError("BAD_REQUEST", {
					error: "client_disabled",
					error_description: "client is disabled",
				});
			}
		} catch (error) {
			return handleRedirect(ctx, toErrorURL(error));
		}
		return runAuthorizationInteraction(ctx, opts, request.headers, settings, {
			...interactionRequest,
			approve: (approval) =>
				interactionRequest.approve(approval).catch(toErrorURL),
			errorURL: toErrorURL,
		});
	}

	// Grant type must include authorization_code to use this endpoint
	if (opts.grantTypes && !opts.grantTypes.includes("authorization_code")) {
		throw new APIError("NOT_FOUND");
	}
	ctx.query = query;
	const requestObject = getStringParameter(query.request);
	const requestUri = getStringParameter(query.request_uri);
	if (requestObject !== undefined && requestUri !== undefined) {
		return authorizeRedirectOnError(opts)({
			error: "invalid_request",
			error_description: "request and request_uri cannot be used together",
			ctx,
		});
	}
	if (requestObject !== undefined) {
		return authorizeRedirectOnError(opts)({
			error: "request_not_supported",
			error_description: "request object not supported",
			ctx,
		});
	}

	// Resolve request_uri (PAR) before processing
	if (requestUri !== undefined) {
		const clientId = getStringParameter(query.client_id);
		if (!clientId) {
			return authorizeRedirectOnError(opts)({
				error: "invalid_request",
				error_description: "client_id is required",
				ctx,
			});
		}
		if (!opts.requestUriResolver) {
			return authorizeRedirectOnError(opts)({
				error: "request_uri_not_supported",
				error_description: "request_uri not supported",
				ctx,
			});
		}
		const resolvedParams = await opts.requestUriResolver({
			requestUri,
			clientId,
			ctx,
		});
		if (!resolvedParams) {
			return authorizeRedirectOnError(opts)({
				error: "invalid_request_uri",
				error_description: "request_uri is invalid or expired",
				ctx,
			});
		}
		// RFC 9126 §4: all params come from the stored request, not the URL.
		// Only client_id is carried from the authorization URL.
		const urlClientId = query.client_id;
		query = resolvedParams as unknown as OAuthAuthorizationQuery;
		if (urlClientId) {
			query.client_id = urlClientId;
		}
	}
	ctx.query = query;
	const parsedQuery = authorizationQuerySchema.safeParse(query);
	if (!parsedQuery.success) {
		const mappedError = mapIssuesToOAuthError(
			parsedQuery.error.issues,
			authorizationQueryErrorCodesByField,
		);
		return authorizeRedirectOnError(opts)({
			...mappedError,
			ctx,
		});
	}
	query = parsedQuery.data as OAuthAuthorizationQuery;
	ctx.query = query;
	await oAuthState.set({
		query: serializeAuthorizationQuery(query).toString(),
	});

	if (!query.response_type) {
		return authorizeRedirectOnError(opts)({
			error: "invalid_request",
			error_description: "response_type is required",
			ctx,
		});
	}

	const promptSet = ctx.query?.prompt
		? parsePrompt(ctx.query?.prompt)
		: undefined;
	if (promptSet?.has("select_account") && !opts.selectAccount?.page) {
		return handleRedirect(
			ctx,
			getErrorURL(
				ctx,
				`unsupported_prompt_select_account`,
				"unsupported prompt type",
			),
		);
	}

	if (!(query.response_type === "code")) {
		return handleRedirect(
			ctx,
			getErrorURL(
				ctx,
				"unsupported_response_type",
				"unsupported response type",
			),
		);
	}

	// Check client
	const client = await getClient(ctx, opts, query.client_id);
	if (!client) {
		return handleRedirect(
			ctx,
			getErrorURL(ctx, "invalid_client", "client not found"),
		);
	}
	if (client.disabled) {
		return handleRedirect(
			ctx,
			getErrorURL(ctx, "client_disabled", "client is disabled"),
		);
	}
	// The authorize endpoint only serves the authorization_code grant; reject
	// clients that are not registered for it.
	if (!clientAllowsGrant(client, "authorization_code")) {
		return handleRedirect(
			ctx,
			getErrorURL(
				ctx,
				"unauthorized_client",
				"client is not authorized to use the authorization_code grant",
			),
		);
	}

	const registeredUris = client.redirectUris ?? [];
	let isValidRedirectUri = false;
	if (query.redirect_uri) {
		// Default validation: exact match + native loopback port variance
		const defaultResult = Boolean(
			findRegisteredRedirectUri(registeredUris, query.redirect_uri),
		);
		if (
			opts.validateRedirectUri &&
			isSafeCustomRedirectUri(query.redirect_uri)
		) {
			try {
				// Custom validator receives defaultResult for composition
				isValidRedirectUri = await opts.validateRedirectUri(
					query.redirect_uri,
					registeredUris,
					defaultResult,
				);
			} catch {
				// Fail closed: a throwing validator rejects the request
				isValidRedirectUri = false;
			}
		} else if (!opts.validateRedirectUri) {
			isValidRedirectUri = defaultResult;
		}
	}
	if (!isValidRedirectUri) {
		return handleRedirect(
			ctx,
			getErrorURL(ctx, "invalid_redirect", "invalid redirect uri"),
		);
	}
	// Check for invalid scopes if requested from query
	let requestedScopes = query.scope?.split(" ").filter((s) => s);
	if (requestedScopes) {
		const validScopes = new Set(client.scopes ?? opts.scopes);
		const invalidScopes = requestedScopes.filter((scope) => {
			return !validScopes?.has(scope);
		});
		if (invalidScopes.length) {
			return handleRedirect(
				ctx,
				formatErrorURL(
					query.redirect_uri,
					"invalid_scope",
					`The following scopes are invalid: ${invalidScopes.join(", ")}`,
					query.state,
					getIssuer(ctx, opts),
				),
			);
		}
	}
	// Always set default scopes if not originally sent
	if (!requestedScopes) {
		requestedScopes = client.scopes ?? opts.scopes ?? [];
		query.scope = requestedScopes.join(" ");
	}
	const openidRequested = requestedScopes.includes("openid");
	if (query.claims !== undefined && !openidRequested) {
		return handleRedirect(
			ctx,
			formatErrorURL(
				query.redirect_uri,
				"invalid_request",
				"openid scope must be requested when using the claims parameter",
				query.state,
				getIssuer(ctx, opts),
			),
		);
	}
	if (openidRequested && !isValidOidcClaimsRequest(query.claims)) {
		return handleRedirect(
			ctx,
			formatErrorURL(
				query.redirect_uri,
				"invalid_request",
				"claims must be a valid Claims request object",
				query.state,
				getIssuer(ctx, opts),
			),
		);
	}
	// Fail before sign-in when no supported ACR can satisfy an essential request;
	// the session's resolved ACR is checked again at approval.
	if (
		openidRequested &&
		!getAcrValuesSupported(opts).some((acr) =>
			canSatisfyEssentialAcrRequest(query.claims, acr),
		)
	) {
		return handleRedirect(
			ctx,
			formatErrorURL(
				query.redirect_uri,
				"access_denied",
				"essential acr requirement cannot be met",
				query.state,
				getIssuer(ctx, opts),
			),
		);
	}

	// Validate `resource` (RFC 8707 §2) against the configured resource
	// entities — fail-fast at /authorize so clients see misconfigured
	// resources before consent UI. Re-validated at /oauth2/token because
	// clients typically re-supply the parameter there.
	if (query.resource !== undefined) {
		try {
			await resolveResourcePolicy(ctx, opts, {
				resource: query.resource,
				clientId: client.clientId,
				requestedScopes,
			});
		} catch (err) {
			if (err instanceof APIError) {
				const error =
					(err.body as { error?: string })?.error ?? "invalid_target";
				const description =
					(err.body as { error_description?: string })?.error_description ??
					"requested resource invalid";
				return handleRedirect(
					ctx,
					formatErrorURL(
						query.redirect_uri,
						error,
						description,
						query.state,
						getIssuer(ctx, opts),
					),
				);
			}
			throw err;
		}
	}

	// Check if PKCE is required for this client and authorization request
	const pkceRequired = isPKCERequired(client, {
		scopes: requestedScopes,
		nonce: query.nonce,
	});

	// Validate PKCE parameters if required
	if (pkceRequired) {
		if (!query.code_challenge || !query.code_challenge_method) {
			return handleRedirect(
				ctx,
				formatErrorURL(
					query.redirect_uri,
					"invalid_request",
					pkceRequired.valueOf(),
					query.state,
					getIssuer(ctx, opts),
				),
			);
		}
	}

	// If PKCE parameters are provided, validate them (even if not required)
	if (query.code_challenge || query.code_challenge_method) {
		// Both parameters must be provided together
		if (!query.code_challenge || !query.code_challenge_method) {
			return handleRedirect(
				ctx,
				formatErrorURL(
					query.redirect_uri,
					"invalid_request",
					"code_challenge and code_challenge_method must both be provided",
					query.state,
					getIssuer(ctx, opts),
				),
			);
		}

		// Check code challenge method is supported (only S256)
		const codeChallengesSupported = ["S256"];
		if (!codeChallengesSupported.includes(query.code_challenge_method)) {
			return handleRedirect(
				ctx,
				formatErrorURL(
					query.redirect_uri,
					"invalid_request",
					"invalid code_challenge method, only S256 is supported",
					query.state,
					getIssuer(ctx, opts),
				),
			);
		}
	}

	return runAuthorizationInteraction(ctx, opts, request.headers, settings, {
		query,
		client,
		approve: (approval) =>
			createAuthorizationCodeURL(ctx, opts, {
				...approval,
				// An authorization request always carries its validated redirect_uri.
				query: approval.query as OAuthAuthorizationQuery,
				clientId: client.clientId,
				resource: toResourceList(approval.query.resource) ?? [],
			}),
	});
}

/**
 * Sends the user to the next required interaction page, or approves the
 * request once none remain.
 */
async function runAuthorizationInteraction(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	headers: Headers,
	settings: AuthorizeEndpointSettings | undefined,
	request: OAuthInteractionRequest & {
		/** Where an extension interaction reports errors before approval. */
		errorURL?: (error: unknown) => string;
	},
): Promise<OAuthRedirectResult> {
	let { query } = request;
	const { client } = request;
	ctx.query = query;
	const scopes = query.scope?.split(" ").filter((scope) => scope) ?? [];
	const userInfoClaims = getRequestedUserInfoClaims(
		query.claims,
		getSupportedClaims(opts),
	);
	// `resource` was already validated against the configured resources.
	const resources = toResourceList(query.resource) ?? [];
	const promptSet = query.prompt ? parsePrompt(query.prompt) : undefined;
	const promptNone = promptSet?.has("none") ?? false;

	// Check for session
	const session = await getSessionFromCtx(ctx);
	// A stale session under `max_age` requires re-authentication, which the host
	// login page performs (minting a fresh session whose createdAt becomes the
	// new auth_time). Reuse the prompt=login redirect rather than deleting the
	// session, so other relying parties are not back-channel logged out.
	const maxAgeSeconds = query.max_age;
	const hasSatisfiedMaxAge =
		session != null &&
		maxAgeSeconds !== undefined &&
		isWithinMaxAge(
			new Date(session.session.createdAt),
			maxAgeSeconds,
			new Date(),
		);
	const staleForMaxAge =
		session != null && maxAgeSeconds !== undefined && !hasSatisfiedMaxAge;
	if (
		!session ||
		staleForMaxAge ||
		promptSet?.has("login") ||
		promptSet?.has("create")
	) {
		if (promptNone) {
			return redirectWithAuthorizationError(
				ctx,
				opts,
				query,
				"login_required",
				"authentication required",
			);
		}
		return redirectWithPromptCode(
			ctx,
			opts,
			promptSet?.has("create") ? "create" : "login",
		);
	}
	if (hasSatisfiedMaxAge) {
		query = removeMaxAgeFromAuthorizationQuery(query);
		ctx.query = query;
	}
	// Each hook gets its own copy of the query.
	const hookContext = () => ({
		user: session.user,
		session: session.session,
		scopes,
		query: serializeAuthorizationQuery(query),
	});

	// Force account selection (eg. multi-session)
	if (settings?.isAuthorize && promptSet?.has("select_account")) {
		return redirectWithPromptCode(ctx, opts, "select_account");
	}

	if (
		// Check if account needs selection (only for authorize endpoint)
		settings?.isAuthorize &&
		opts.selectAccount
	) {
		const selectedAccountRedirect = await opts.selectAccount.shouldRedirect({
			headers,
			...hookContext(),
		});
		if (selectedAccountRedirect) {
			if (promptNone) {
				return redirectWithAuthorizationError(
					ctx,
					opts,
					query,
					"account_selection_required",
					"End-User account selection is required",
				);
			}
			return redirectWithPromptCode(ctx, opts, "select_account");
		}
	}

	// Redirect to complete registration steps
	if (opts.signup?.shouldRedirect) {
		const signupRedirect = await opts.signup.shouldRedirect({
			headers,
			...hookContext(),
		});
		if (signupRedirect) {
			if (promptNone) {
				return redirectWithAuthorizationError(
					ctx,
					opts,
					query,
					"interaction_required",
					"End-User interaction is required",
				);
			}
			return redirectWithPromptCode(ctx, opts, "create", {
				page: typeof signupRedirect === "string" ? signupRedirect : undefined,
			});
		}
	}

	if (!settings?.postLogin && opts.postLogin) {
		const postLoginRedirect = await opts.postLogin.shouldRedirect({
			headers,
			...hookContext(),
			isContinuation: settings?.isPostLoginContinuation ?? false,
		});
		if (postLoginRedirect) {
			if (promptNone) {
				return redirectWithAuthorizationError(
					ctx,
					opts,
					query,
					"interaction_required",
					"End-User interaction is required",
				);
			}
			return redirectWithPromptCode(ctx, opts, "post_login");
		}
	}

	// Force consent screen. A request that requires consent is approved only in
	// the request where the user accepts it, never from a resumed signed query.
	if (
		promptSet?.has("consent") ||
		(request.requireConsent && !settings?.acceptedConsent)
	) {
		return redirectWithPromptCode(ctx, opts, "consent", {
			sessionId: session.session.id,
		});
	}

	const referenceId = settings?.acceptedConsent
		? settings.acceptedConsent.referenceId
		: await getConsentReferenceId(opts, hookContext());
	const approve = async () => {
		let authenticationContext: OAuthAuthenticationContext;
		try {
			authenticationContext = await resolveAuthenticationContext(opts, {
				user: session.user,
				session: session.session,
				client,
				scopes,
				headers,
				query,
			});
		} catch (error) {
			if (!(error instanceof APIError)) throw error;
			if (request.errorURL) return handleRedirect(ctx, request.errorURL(error));
			const body = error.body as
				| { error?: OAuthErrorCode; error_description?: string }
				| undefined;
			return redirectWithAuthorizationError(
				ctx,
				opts,
				query,
				body?.error ?? "server_error",
				body?.error_description ?? "authentication context unavailable",
			);
		}
		// OIDC Core §5.5.1.1: an unmet essential acr is a failed authentication.
		if (
			!canSatisfyEssentialAcrRequest(
				query.claims,
				authenticationContext.acr ?? LEVEL_0_ACR,
			)
		) {
			return redirectWithAuthorizationError(
				ctx,
				opts,
				query,
				"access_denied",
				"essential acr requirement cannot be met",
			);
		}
		return handleRedirect(
			ctx,
			await request.approve({
				query,
				userId: session.user.id,
				sessionId: session.session.id,
				authTime: new Date(session.session.createdAt).getTime(),
				...authenticationContext,
				referenceId,
			}),
		);
	};

	// Can skip consent (unless forced by prompt above)
	if (client.skipConsent) {
		return approve();
	}
	const consent = await findConsent(
		ctx,
		client.clientId,
		session.user.id,
		referenceId,
	);

	// Prompt again whenever a requested scope, claim, or resource is not covered.
	if (
		!consent ||
		!consentCovers(consent, scopes, resources) ||
		!userInfoClaims.every((claim) =>
			(consent.requestedUserInfoClaims ?? []).includes(claim),
		)
	) {
		if (promptNone) {
			return redirectWithAuthorizationError(
				ctx,
				opts,
				query,
				"consent_required",
				"End-User consent is required",
			);
		}
		return redirectWithPromptCode(ctx, opts, "consent", {
			sessionId: session.session.id,
		});
	}

	return approve();
}

function serializeAuthorizationQuery(query: OAuthInteractionQuery) {
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(query)) {
		if (value == null) continue;
		if (Array.isArray(value)) {
			for (const v of value) {
				params.append(key, String(v));
			}
		} else if (key === "claims" && typeof value === "object") {
			params.set(key, JSON.stringify(value));
		} else {
			params.set(key, String(value));
		}
	}
	return params;
}

/** Stores a single-use authorization code and returns the client redirect URL carrying it. */
async function createAuthorizationCodeURL(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	verificationValue: {
		query: OAuthAuthorizationQuery;
		clientId: string;
		userId: string;
		sessionId: string;
		authTime: number;
		acr?: string;
		amr?: string[];
		referenceId?: string;
		resource?: string[];
	},
) {
	const code = generateRandomString(32, "a-z", "A-Z", "0-9");
	const iat = Math.floor(Date.now() / 1000);
	const exp = iat + (opts.codeExpiresIn ?? 600);

	const data: Omit<Verification, "id" | "createdAt"> = {
		identifier: await storeToken(opts.storeTokens, code, "authorization_code"),
		updatedAt: new Date(iat * 1000),
		expiresAt: new Date(exp * 1000),
		value: JSON.stringify({
			type: "authorization_code",
			query: verificationValue.query,
			userId: verificationValue.userId,
			sessionId: verificationValue?.sessionId,
			referenceId: verificationValue.referenceId,
			authTime: verificationValue.authTime,
			acr: verificationValue.acr,
			amr: verificationValue.amr,
			resource: verificationValue.resource,
		} satisfies VerificationValue),
	};
	await ctx.context.internalAdapter.createVerificationValue({
		...data,
		createdAt: new Date(iat * 1000),
	});

	const redirectUriWithCode = new URL(verificationValue.query.redirect_uri);
	redirectUriWithCode.searchParams.set("code", code);
	if (verificationValue.query.state) {
		redirectUriWithCode.searchParams.set(
			"state",
			verificationValue.query.state,
		);
	}
	redirectUriWithCode.searchParams.set("iss", getIssuer(ctx, opts));

	return redirectUriWithCode.toString();
}

async function redirectWithPromptCode(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	type: "login" | "create" | "consent" | "select_account" | "post_login",
	options?: { page?: string; sessionId?: string },
) {
	// `consent` is the only type reachable past the postLogin gate in
	// authorize, so when `opts.postLogin` is configured its signed query
	// attests that postLogin is cleared for the specific session recorded
	// in the marker. Skip the marker otherwise: there is no postLogin gate
	// to clear, and an unused session id does not belong in the URL.
	const queryParams = await signParams(ctx, opts, {
		postLoginClearedForSession:
			type === "consent" && opts.postLogin ? options?.sessionId : undefined,
	});
	let path = opts.loginPage;
	if (type === "select_account") {
		path = opts.selectAccount?.page ?? opts.loginPage;
	} else if (type === "post_login") {
		if (!opts.postLogin?.page)
			throw new APIError("INTERNAL_SERVER_ERROR", {
				error_description: "postLogin should have been defined",
			});
		path = opts.postLogin?.page;
	} else if (type === "consent") {
		path = opts.consentPage;
	} else if (type === "create") {
		path = opts.signup?.page ?? opts.loginPage;
	}
	return handleRedirect(ctx, `${options?.page ?? path}?${queryParams}`);
}

async function signParams(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	flags?: { postLoginClearedForSession?: string },
) {
	// Add expiration to query parameters
	const issuedAt = Date.now();
	const iat = Math.floor(issuedAt / 1000);
	const exp = iat + (opts.codeExpiresIn ?? 600);
	const params = serializeAuthorizationQuery(
		ctx.query as OAuthAuthorizationQuery,
	);
	params.set("exp", String(exp));
	params.set(signedQueryIssuedAtParam, String(issuedAt));
	params.delete("sig");
	// Reserved marker: only server-issued consent redirects may sign this.
	params.delete(postLoginClearedParam);
	if (flags?.postLoginClearedForSession) {
		params.set(postLoginClearedParam, flags.postLoginClearedForSession);
	}
	setSignedOAuthQueryParameterNames(params);

	const signature = await makeSignature(
		canonicalizeOAuthQueryParams(params).toString(),
		ctx.context.secret,
	);
	params.set("sig", signature);
	return params.toString();
}
