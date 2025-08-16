import type { GenericEndpointContext } from "../../types";
import type { AuthorizationQuery, OIDCOptions } from "./types";

import { getClient } from "./index";
import { generateRandomString } from "../../crypto";
import { APIError, getSessionFromCtx } from "../../api";

function formatErrorURL(url: string, error: string, description: string) {
	return `${url.includes("?") ? "&" : "?"}error=${error}&error_description=${description}`;
}

function getErrorURL(
	ctx: GenericEndpointContext,
	error: string,
	description: string,
) {
	const baseURL =
		ctx.context.options.onAPIError?.errorURL || `${ctx.context.baseURL}/error`;
	return formatErrorURL(baseURL, error, description);
}

function makeRedirectHandler(ctx: GenericEndpointContext) {
	return (url: string) => {
		const fromFetch = ctx.request?.headers.get("sec-fetch-mode") === "cors";
		if (fromFetch) {
			return ctx.json({ redirect: true, url });
		}
		throw ctx.redirect(url);
	};
}

function setCORSHeaders(ctx: GenericEndpointContext) {
	ctx.setHeader("Access-Control-Allow-Origin", "*");
	ctx.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
	ctx.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
	ctx.setHeader("Access-Control-Max-Age", "86400");
}

async function validateInputs(
	ctx: GenericEndpointContext,
	options: OIDCOptions,
) {
	const handleRedirect = makeRedirectHandler(ctx);
	const query = ctx.query as AuthorizationQuery;

	// Ensure request exists
	if (!ctx.request) {
		throw new APIError("UNAUTHORIZED", {
			error_description: "request not found",
			error: "invalid_request",
		});
	}

	// Ensure session
	const session = await getSessionFromCtx(ctx);
	if (!session) {
		await ctx.setSignedCookie(
			"oidc_login_prompt",
			JSON.stringify(query),
			ctx.context.secret,
			{ maxAge: 600, path: "/", sameSite: "lax" },
		);
		const queryFromURL = ctx.request?.url?.split("?")[1];
		throw handleRedirect(`${options.loginPage}?${queryFromURL}`);
	}

	// Ensure client exists
	if (!query.client_id) {
		throw handleRedirect(
			getErrorURL(ctx, "invalid_client", "client_id is required"),
		);
	}

	const client = await getClient(
		query.client_id,
		ctx.context.adapter,
		options.trustedClients || [],
	);
	if (!client) {
		throw handleRedirect(
			getErrorURL(ctx, "invalid_client", "client not found"),
		);
	}
	if (client.disabled) {
		throw handleRedirect(
			getErrorURL(ctx, "client_disabled", "client is disabled"),
		);
	}

	// Redirect URI validation
	if (
		!query.redirect_uri ||
		!client.redirectURLs.includes(query.redirect_uri)
	) {
		throw new APIError("BAD_REQUEST", { message: "Invalid redirect URI" });
	}

	// Response type validation
	if (!query.response_type) {
		throw handleRedirect(
			getErrorURL(ctx, "invalid_request", "response_type is required"),
		);
	}
	if (query.response_type !== "code") {
		throw handleRedirect(
			getErrorURL(
				ctx,
				"unsupported_response_type",
				"unsupported response type",
			),
		);
	}

	// Scopes validation
	const opts = {
		codeExpiresIn: 600,
		defaultScope: "openid",
		scopes: [
			"openid",
			"profile",
			"email",
			"offline_access",
			...(options?.scopes || []),
		],
		...options,
	};

	const queryScope = query.scope?.split(" ").filter(Boolean);
	const defaultScope = opts.defaultScope.split(" ");
	const requestScope = queryScope || defaultScope;

	const invalidScopes = requestScope.filter((s) => !opts.scopes.includes(s));
	if (invalidScopes.length) {
		throw handleRedirect(
			formatErrorURL(
				query.redirect_uri,
				"invalid_scope",
				`The following scopes are invalid: ${invalidScopes.join(", ")}`,
			),
		);
	}

	// PKCE validation
	if (
		(!query.code_challenge || !query.code_challenge_method) &&
		options.requirePKCE
	) {
		throw handleRedirect(
			formatErrorURL(query.redirect_uri, "invalid_request", "pkce is required"),
		);
	}
	if (!query.code_challenge_method) {
		query.code_challenge_method = "plain";
	}

	const allowedMethods = [
		"s256",
		options.allowPlainCodeChallengeMethod ? "plain" : "s256",
	];
	if (!allowedMethods.includes(query.code_challenge_method.toLowerCase())) {
		throw handleRedirect(
			formatErrorURL(
				query.redirect_uri,
				"invalid_request",
				"invalid code_challenge method",
			),
		);
	}

	return {
		session,
		client,
		query,
		opts,
		requestScope,
		redirectUri: query.redirect_uri,
	};
}

async function handleConsentFlow(
	ctx: GenericEndpointContext,
	options: OIDCOptions,
	session: any,
	client: any,
	query: AuthorizationQuery,
	requestScope: string[],
	code: string,
	redirectURI: URL,
) {
	const handleRedirect = makeRedirectHandler(ctx);

	if (options.alwaysSkipConsent) {
		throw handleRedirect(redirectURI.toString());
	}

	// If consent not required or client is trusted, skip consent
	if (query.prompt !== "consent" || client.skipConsent) {
		throw handleRedirect(redirectURI.toString());
	}

	// Check if user already consented
	const hasAlreadyConsented = await ctx.context.adapter
		.findOne<{ consentGiven: boolean }>({
			model: "oauthConsent",
			where: [
				{ field: "clientId", value: client.clientId },
				{ field: "userId", value: session.user.id },
			],
		})
		.then((res) => !!res?.consentGiven);

	if (hasAlreadyConsented) {
		throw handleRedirect(redirectURI.toString());
	}

	// Show consent page
	if (options?.consentPage) {
		await ctx.setSignedCookie("oidc_consent_prompt", code, ctx.context.secret, {
			maxAge: 600,
			path: "/",
			sameSite: "lax",
		});

		const params = new URLSearchParams({
			consent_code: code,
			client_id: client.clientId,
			scope: requestScope.join(" "),
		});
		const consentURI = `${options.consentPage}?${params.toString()}`;

		throw handleRedirect(consentURI);
	}

	const htmlFn = options?.getConsentHTML;
	if (!htmlFn) {
		throw new APIError("INTERNAL_SERVER_ERROR", {
			message: "No consent page provided",
		});
	}

	return new Response(
		htmlFn({
			scopes: requestScope,
			clientMetadata: client.metadata,
			clientIcon: client.icon,
			clientId: client.clientId,
			clientName: client.name,
			code,
		}),
		{ headers: { "content-type": "text/html" } },
	);
}

export async function authorize(
	ctx: GenericEndpointContext,
	options: OIDCOptions,
) {
	if (options.disableCorsInAuthorize) {
		setCORSHeaders(ctx);
	}

	const handleRedirect = makeRedirectHandler(ctx);

	// Validate everything upfront
	const { session, client, query, opts, requestScope, redirectUri } =
		await validateInputs(ctx, options);

	// Issue authorization code
	const code = generateRandomString(32, "a-z", "A-Z", "0-9");
	const expiresAt = new Date(Date.now() + opts.codeExpiresIn * 1000);

	try {
		await ctx.context.internalAdapter.createVerificationValue(
			{
				value: JSON.stringify({
					clientId: client.clientId,
					redirectURI: query.redirect_uri,
					scope: requestScope,
					userId: session.user.id,
					authTime: new Date(session.session.createdAt).getTime(),
					requireConsent: query.prompt === "consent",
					state: query.prompt === "consent" ? query.state : null,
					codeChallenge: query.code_challenge,
					codeChallengeMethod: query.code_challenge_method,
					nonce: query.nonce,
				}),
				identifier: code,
				expiresAt,
			},
			ctx,
		);
	} catch {
		return handleRedirect(
			formatErrorURL(redirectUri, "server_error", "Error processing request"),
		);
	}

	// Build redirect URI with code
	const redirectURI = new URL(redirectUri);
	redirectURI.searchParams.set("code", code);
	if (query.state) redirectURI.searchParams.set("state", query.state);

	return handleConsentFlow(
		ctx,
		options,
		session,
		client,
		query,
		requestScope,
		code,
		redirectURI,
	);
}
