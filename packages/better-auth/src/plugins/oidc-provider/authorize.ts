import { APIError } from "better-call";
import type { GenericEndpointContext } from "../../types";
import { getSessionFromCtx } from "../../api";
import type { AuthorizationQuery, OIDCOptions } from "./types";
import { generateRandomString } from "../../crypto";
import { getClient } from "./index";

function formatErrorURL(url: string, error: string, description: string) {
	return `${
		url.includes("?") ? "&" : "?"
	}error=${error}&error_description=${description}`;
}

function getErrorURL(
	ctx: GenericEndpointContext,
	error: string,
	description: string,
) {
	const baseURL =
		ctx.context.options.onAPIError?.errorURL || `${ctx.context.baseURL}/error`;
	const formattedURL = formatErrorURL(baseURL, error, description);
	return formattedURL;
}

export async function authorize(
	ctx: GenericEndpointContext,
	options: OIDCOptions,
) {
	ctx.context.logger.debug("[OIDC Authorize] Request received", {
		query: ctx.query,
		url: ctx.request?.url,
	});

	const handleRedirect = (url: string) => {
		const fromFetch = ctx.request?.headers.get("sec-fetch-mode") === "cors";
		if (fromFetch) {
			return ctx.json({
				redirect: true,
				url,
			});
		} else {
			throw ctx.redirect(url);
		}
	};

	const opts = {
		codeExpiresIn: 600,
		defaultScope: "openid",
		...options,
		scopes: [
			"openid",
			"profile",
			"email",
			"offline_access",
			...(options?.scopes || []),
		],
	};
	if (!ctx.request) {
		ctx.context.logger.error(
			"[OIDC Authorize] Critical error: Request object not found in context.",
		);
		throw new APIError("UNAUTHORIZED", {
			error_description: "request not found",
			error: "invalid_request",
		});
	}
	const session = await getSessionFromCtx(ctx);
	if (!session) {
		ctx.context.logger.debug(
			"[OIDC Authorize] No active session. Redirecting to login.",
			{ loginPage: options.loginPage },
		);
		/**
		 * If the user is not logged in, we need to redirect them to the
		 * login page.
		 */
		await ctx.setSignedCookie(
			"oidc_login_prompt",
			JSON.stringify(ctx.query),
			ctx.context.secret,
			{
				maxAge: 600,
				path: "/",
				sameSite: "lax",
			},
		);
		const queryFromURL = ctx.request.url?.split("?")[1];
		return handleRedirect(`${options.loginPage}?${queryFromURL}`);
	}

	ctx.context.logger.debug("[OIDC Authorize] Active session found for user:", {
		userId: session.user.id,
	});

	const query = ctx.query as AuthorizationQuery;
	if (!query.client_id) {
		ctx.context.logger.warn(
			"[OIDC Authorize] client_id missing. Redirecting to error.",
		);
		const errorURL = getErrorURL(
			ctx,
			"invalid_client",
			"client_id is required",
		);
		throw ctx.redirect(errorURL);
	}
	ctx.context.logger.debug("[OIDC Authorize] Processing client_id:", {
		clientId: query.client_id,
	});

	if (!query.response_type) {
		ctx.context.logger.warn(
			"[OIDC Authorize] response_type missing. Redirecting to error.",
		throw ctx.redirect(
			getErrorURL(ctx, "invalid_request", "response_type is required"),
		);
	}

	const client = await getClient(
		ctx.query.client_id,
		ctx.context.adapter,
		options.trustedClients || [],
	);
	if (!client) {
		const errorURL = getErrorURL(
			ctx,
			"invalid_client",
			"client_id is required",
		);
		throw ctx.redirect(errorURL);
	}
	const redirectURI = client.redirectURLs.find(
		(url) => url === ctx.query.redirect_uri,
	);

	if (!redirectURI || !query.redirect_uri) {
		ctx.context.logger.warn(
			"[OIDC Authorize] Invalid or missing redirect_uri.",
			{ provided: query.redirect_uri, expected: client.redirectURLs },
		);
		/**
		 * show UI error here warning the user that the redirect URI is invalid
		 */
		throw new APIError("BAD_REQUEST", {
			message: "Invalid redirect URI",
		});
	}
	if (client.disabled) {
		ctx.context.logger.warn(
			"[OIDC Authorize] Client is disabled. Redirecting to error.",
			{ clientId: client.clientId },
		);
		throw ctx.redirect(`${ctx.context.baseURL}/error?error=client_disabled`);
	}

	if (query.response_type !== "code") {
		ctx.context.logger.warn(
			"[OIDC Authorize] Unsupported response_type. Redirecting to error.",
			{ responseType: query.response_type },
		);
		const errorURL = getErrorURL(ctx, "client_disabled", "client is disabled");
		throw ctx.redirect(errorURL);
	}

	if (query.response_type !== "code") {
		const errorURL = getErrorURL(
			ctx,
			"unsupported_response_type"
		);
		throw ctx.redirect(errorURL);
	}

	const requestScope =
		query.scope?.split(" ").filter((s) => s) || opts.defaultScope.split(" ");
	const invalidScopes = requestScope.filter((scope) => {
		const isInvalid =
			!opts.scopes.includes(scope) ||
			(scope === "offline_access" && query.prompt !== "consent");
		return isInvalid;
	});
	if (invalidScopes.length) {
		ctx.context.logger.warn(
			"[OIDC Authorize] Invalid scopes requested. Redirecting.",
			{ invalidScopes, redirect_uri: query.redirect_uri },
		);
		return handleRedirect(
			formatErrorURL(
				query.redirect_uri,
				"invalid_scope",
				`The following scopes are invalid: ${invalidScopes.join(", ")}`,
			),
		);
	}

	if (
		(!query.code_challenge || !query.code_challenge_method) &&
		options.requirePKCE
	) {
		ctx.context.logger.warn(
			"[OIDC Authorize] PKCE required but missing params. Redirecting.",
			{ redirect_uri: query.redirect_uri },
		);
		return handleRedirect(
			formatErrorURL(query.redirect_uri, "invalid_request", "pkce is required"),
		);
	}

	if (!query.code_challenge_method) {
		query.code_challenge_method = "plain";
	}

	if (
		![
			"s256",
			options.allowPlainCodeChallengeMethod ? "plain" : "s256",
		].includes(query.code_challenge_method?.toLowerCase() || "")
	) {
		ctx.context.logger.warn(
			"[OIDC Authorize] Invalid code_challenge_method. Redirecting.",
			{ method: query.code_challenge_method, redirect_uri: query.redirect_uri },
		);
		return handleRedirect(
			formatErrorURL(
				query.redirect_uri,
				"invalid_request",
				"invalid code_challenge method",
			),
		);
	}

	const code = generateRandomString(32, "a-z", "A-Z", "0-9");
	const codeExpiresInMs = opts.codeExpiresIn * 1000;
	const expiresAt = new Date(Date.now() + codeExpiresInMs);
	ctx.context.logger.debug("[OIDC Authorize] Generated auth code.", {
		codeId: code.substring(0, 6) + "...",
		requireConsent: query.prompt === "consent",
	});
	try {
		/**
		 * Save the code in the database
		 */
		await ctx.context.internalAdapter.createVerificationValue(
			{
				value: JSON.stringify({
					clientId: client.clientId,
					redirectURI: query.redirect_uri,
					scope: requestScope,
					userId: session.user.id,
					authTime: session.session.createdAt.getTime(),
					/**
					 * If the prompt is set to `consent`, then we need
					 * to require the user to consent to the scopes.
					 *
					 * This means the code now needs to be treated as a
					 * consent request.
					 *
					 * once the user consents, the code will be updated
					 * with the actual code. This is to prevent the
					 * client from using the code before the user
					 * consents.
					 */
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
	} catch (e) {
		ctx.context.logger.error(
			"[OIDC Authorize] Error saving auth code to DB. Redirecting.",
			{ error: e, redirect_uri: query.redirect_uri },
		);
		return handleRedirect(
			formatErrorURL(
				query.redirect_uri,
				"server_error",
				"An error occurred while processing the request",
			),
		);
	}

	const redirectURIWithCode = new URL(redirectURI);
	redirectURIWithCode.searchParams.set("code", code);
	redirectURIWithCode.searchParams.set("state", ctx.query.state);

	if (query.prompt !== "consent") {
		ctx.context.logger.debug(
			"[OIDC Authorize] Prompt is not 'consent'. Redirecting client with code.",
			{ redirectTo: redirectURIWithCode.toString().substring(0, 50) + "..." },
		);
		return handleRedirect(redirectURIWithCode.toString());
	}

	// Check if this is a trusted client that should skip consent
	if (client.skipConsent) {
		return handleRedirect(redirectURIWithCode.toString());
	}

	ctx.context.logger.debug(
		"[OIDC Authorize] Consent flow: evaluating consent status.",
	);
	const hasAlreadyConsented = await ctx.context.adapter
		.findOne<{
			consentGiven: boolean;
		}>({
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
			],
		})
		.then((res) => !!res?.consentGiven);

	if (hasAlreadyConsented) {
		ctx.context.logger.debug(
			"[OIDC Authorize] Consent flow: User has already consented. Redirecting client with code.",
			{ redirectTo: redirectURIWithCode.toString().substring(0, 50) + "..." },
		);
		return handleRedirect(redirectURIWithCode.toString());
	}

	ctx.context.logger.debug("[OIDC Authorize] Consent flow: Consent needed.");
	if (options?.consentPage) {
		await ctx.setSignedCookie("oidc_consent_prompt", code, ctx.context.secret, {
			maxAge: 600,
			path: "/",
			sameSite: "lax",
		});
		const consentURI = `${options.consentPage}?client_id=${
			client.clientId
		}&scope=${requestScope.join(" ")}`;
		ctx.context.logger.debug(
			"[OIDC Authorize] Consent flow: Redirecting to custom consent page.",
			{ consentPage: options.consentPage },
		);
		return handleRedirect(consentURI);
	}
	const htmlFn = options?.getConsentHTML;

	if (!htmlFn) {
		ctx.context.logger.error(
			"[OIDC Authorize] Consent flow: No consent page or HTML function provided.",
		);
		throw new APIError("INTERNAL_SERVER_ERROR", {
			message: "No consent page provided",
		});
	}

	ctx.context.logger.debug(
		"[OIDC Authorize] Consent flow: Returning consent HTML.",
	);
	return new Response(
		htmlFn({
			scopes: requestScope,
			clientMetadata: client.metadata,
			clientIcon: client?.icon,
			clientId: client.clientId,
			clientName: client.name,
			code,
		}),
		{
			headers: {
				"content-type": "text/html",
			},
		},
	);
}
