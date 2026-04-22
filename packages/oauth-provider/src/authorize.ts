import type { GenericEndpointContext } from "@better-auth/core";
import { isBrowserFetchRequest } from "@better-auth/core/utils/fetch-metadata";
import { getSessionFromCtx } from "better-auth/api";
import { generateRandomString, makeSignature } from "better-auth/crypto";
import type { Verification } from "better-auth/db";
import { APIError } from "better-call";
import { oAuthState } from "./oauth";
import type { OAuthErrorCode, OAuthRedirectOnError } from "./oauth-endpoint";
import type {
	OAuthAuthorizationQuery,
	OAuthConsent,
	OAuthOptions,
	Scope,
	VerificationValue,
} from "./types";

import {
	getClient,
	getJwtPlugin,
	isPKCERequired,
	parsePrompt,
	storeToken,
} from "./utils";

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
	return `${url}${url.includes("?") ? "&" : "?"}${searchParams.toString()}`;
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

export const handleRedirect = (ctx: GenericEndpointContext, uri: string) => {
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

function redirectWithPromptNoneError(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	query: OAuthAuthorizationQuery,
	error: OAuthErrorCode,
	description: string,
) {
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

		const isLocalhost =
			url.hostname === "localhost" || url.hostname === "127.0.0.1";
		if (url.protocol !== "https:" && !isLocalhost) {
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
 * Finds the matching entry in a client's registered redirect_uris for a
 * requested redirect_uri. Honors RFC 8252 §7.3 loopback port variance for
 * 127.0.0.1 and [::1], matching on scheme+host+path+query and ignoring
 * port. DNS names like "localhost" are excluded per §8.3.
 */
function findRegisteredRedirectUri(
	registered: readonly string[] | undefined,
	requested: string | undefined,
): string | undefined {
	if (!registered || !requested) return undefined;

	let req: URL | undefined;
	try {
		req = new URL(requested);
	} catch {
		// malformed requested — only exact-match branch can succeed below
	}

	// TODO(sync-from-main-9226): swap for isLoopbackIP(req.hostname) once the
	// helper lands here, to cover the full 127.0.0.0/8 range per RFC 8252 §7.3.
	const loopbackReq =
		req?.hostname === "127.0.0.1" || req?.hostname === "[::1]"
			? req
			: undefined;

	return registered.find((url) => {
		if (url === requested) return true;
		if (!loopbackReq) return false;
		try {
			const reg = new URL(url);
			return (
				reg.hostname === loopbackReq.hostname &&
				reg.pathname === loopbackReq.pathname &&
				reg.protocol === loopbackReq.protocol &&
				reg.search === loopbackReq.search
			);
		} catch {
			return false;
		}
	});
}

/**
 * Loads the client, verifies it's enabled, and returns the requested
 * redirect_uri when it matches a registered entry. Returns null whenever the
 * RP cannot be safely reached, so callers can fall back to the server error
 * page (avoiding open-redirect risk on validation failures).
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
	const matched = findRegisteredRedirectUri(client.redirectUris, redirectUri);
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
): OAuthRedirectOnError<GenericEndpointContext> {
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

export async function authorizeEndpoint(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	settings?: {
		isAuthorize?: boolean;
		postLogin?: boolean;
	},
) {
	// Grant type must include authorization_code to use this endpoint
	if (opts.grantTypes && !opts.grantTypes.includes("authorization_code")) {
		throw new APIError("NOT_FOUND");
	}

	if (!ctx.request) {
		throw new APIError("UNAUTHORIZED", {
			error_description: "request not found",
			error: "invalid_request",
		});
	}

	// Resolve request_uri (PAR) before processing
	let query: OAuthAuthorizationQuery = ctx.query;
	if (query.request_uri) {
		if (!opts.requestUriResolver) {
			return handleRedirect(
				ctx,
				getErrorURL(ctx, "invalid_request_uri", "request_uri not supported"),
			);
		}
		const resolvedParams = await opts.requestUriResolver({
			requestUri: query.request_uri,
			clientId: query.client_id ?? "",
			ctx,
		});
		if (!resolvedParams) {
			return handleRedirect(
				ctx,
				getErrorURL(
					ctx,
					"invalid_request_uri",
					"request_uri is invalid or expired",
				),
			);
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
	await oAuthState.set({
		query: serializeAuthorizationQuery(query).toString(),
	});

	if (!query.client_id) {
		return handleRedirect(
			ctx,
			getErrorURL(ctx, "invalid_client", "client_id is required"),
		);
	}

	if (!query.response_type) {
		return handleRedirect(
			ctx,
			getErrorURL(ctx, "invalid_request", "response_type is required"),
		);
	}

	const promptSet = ctx.query?.prompt
		? parsePrompt(ctx.query?.prompt)
		: undefined;
	const promptNone = promptSet?.has("none") ?? false;
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
			getErrorURL(ctx, "invalid_client", "client_id is required"),
		);
	}
	if (client.disabled) {
		return handleRedirect(
			ctx,
			getErrorURL(ctx, "client_disabled", "client is disabled"),
		);
	}

	const redirectUri = findRegisteredRedirectUri(
		client.redirectUris,
		query.redirect_uri,
	);
	if (!redirectUri || !query.redirect_uri) {
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

	// Check if PKCE is required for this client and scope
	const pkceRequired = isPKCERequired(client, requestedScopes);

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

	// Check for session
	const session = await getSessionFromCtx(ctx);
	if (!session || promptSet?.has("login") || promptSet?.has("create")) {
		if (promptNone) {
			return redirectWithPromptNoneError(
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
			headers: ctx.request.headers,
			user: session.user,
			session: session.session,
			scopes: requestedScopes,
		});
		if (selectedAccountRedirect) {
			if (promptNone) {
				return redirectWithPromptNoneError(
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
			headers: ctx.request.headers,
			user: session.user,
			session: session.session,
			scopes: requestedScopes,
		});
		if (signupRedirect) {
			if (promptNone) {
				return redirectWithPromptNoneError(
					ctx,
					opts,
					query,
					"interaction_required",
					"End-User interaction is required",
				);
			}
			return redirectWithPromptCode(
				ctx,
				opts,
				"create",
				typeof signupRedirect === "string" ? signupRedirect : undefined,
			);
		}
	}

	if (!settings?.postLogin && opts.postLogin) {
		const postLoginRedirect = await opts.postLogin.shouldRedirect({
			headers: ctx.request.headers,
			user: session.user,
			session: session.session,
			scopes: requestedScopes,
		});
		if (postLoginRedirect) {
			if (promptNone) {
				return redirectWithPromptNoneError(
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

	// Force consent screen
	if (promptSet?.has("consent")) {
		return redirectWithPromptCode(ctx, opts, "consent");
	}

	const referenceId = await opts.postLogin?.consentReferenceId?.({
		user: session.user,
		session: session.session,
		scopes: requestedScopes,
	});

	// Can skip consent (unless forced by prompt above)
	if (client.skipConsent) {
		return redirectWithAuthorizationCode(ctx, opts, {
			query,
			clientId: client.clientId,
			userId: session.user.id,
			sessionId: session.session.id,
			authTime: new Date(session.session.createdAt).getTime(),
			referenceId,
		});
	}
	const consent = await ctx.context.adapter.findOne<OAuthConsent<Scope[]>>({
		model: "oauthConsent",
		where: [
			{
				field: "clientId",
				value: client.clientId,
			},
			{
				field: "userId",
				value: session.user.id,
			},
			...(referenceId
				? [
						{
							field: "referenceId",
							value: referenceId,
						},
					]
				: []),
		],
	});

	if (
		!consent ||
		!requestedScopes.every((val) => consent.scopes.includes(val))
	) {
		if (promptNone) {
			return redirectWithPromptNoneError(
				ctx,
				opts,
				query,
				"consent_required",
				"End-User consent is required",
			);
		}
		return redirectWithPromptCode(ctx, opts, "consent");
	}

	return redirectWithAuthorizationCode(ctx, opts, {
		query,
		clientId: client.clientId,
		userId: session.user.id,
		sessionId: session.session.id,
		authTime: new Date(session.session.createdAt).getTime(),
		referenceId,
	});
}

function serializeAuthorizationQuery(query: OAuthAuthorizationQuery) {
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(query)) {
		if (value == null) continue;
		if (Array.isArray(value)) {
			for (const v of value) {
				params.append(key, String(v));
			}
		} else {
			params.set(key, String(value));
		}
	}
	return params;
}

async function redirectWithAuthorizationCode(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	verificationValue: {
		query: OAuthAuthorizationQuery;
		clientId: string;
		userId: string;
		sessionId: string;
		authTime: number;
		referenceId?: string;
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

	return handleRedirect(ctx, redirectUriWithCode.toString());
}

async function redirectWithPromptCode(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	type: "login" | "create" | "consent" | "select_account" | "post_login",
	page?: string,
) {
	const queryParams = await signParams(ctx, opts);
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
	return handleRedirect(ctx, `${page ?? path}?${queryParams}`);
}

async function signParams(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
) {
	// Add expiration to query parameters
	const iat = Math.floor(Date.now() / 1000);
	const exp = iat + (opts.codeExpiresIn ?? 600);
	const params = serializeAuthorizationQuery(
		ctx.query as OAuthAuthorizationQuery,
	);
	params.set("exp", String(exp));

	const signature = await makeSignature(params.toString(), ctx.context.secret);
	params.append("sig", signature);
	return params.toString();
}
