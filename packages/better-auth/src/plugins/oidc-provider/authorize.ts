import type { GenericEndpointContext } from "@better-auth/core";
import { APIError } from "better-call";
import { getSessionFromCtx } from "../../api";
import { generateRandomString } from "../../crypto";
import { getClient } from "./index";
import type { AuthorizationQuery, OIDCOptions } from "./types";
import { parsePrompt } from "./utils/prompt";

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
		throw new APIError("UNAUTHORIZED", {
			error_description: "request not found",
			error: "invalid_request",
		});
	}
	const session = await getSessionFromCtx(ctx);
	if (!session) {
		// Handle prompt=none per OIDC spec - must return error instead of redirecting
		const query = ctx.query as AuthorizationQuery;
		const promptSet = parsePrompt(query.prompt ?? "");
		if (promptSet.has("none") && query.redirect_uri) {
			return handleRedirect(
				formatErrorURL(
					query.redirect_uri,
					"login_required",
					"Authentication required but prompt is none",
				),
			);
		}

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
		const queryFromURL = ctx.request.url?.split("?")[1]!;
		return handleRedirect(`${options.loginPage}?${queryFromURL}`);
	}

	const query = ctx.query as AuthorizationQuery;
	if (!query.client_id) {
		const errorURL = getErrorURL(
			ctx,
			"invalid_client",
			"client_id is required",
		);
		throw ctx.redirect(errorURL);
	}

	if (!query.response_type) {
		const errorURL = getErrorURL(
			ctx,
			"invalid_request",
			"response_type is required",
		);
		throw ctx.redirect(errorURL);
	}

	const client = await getClient(
		ctx.query.client_id,
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
	const redirectURI = client.redirectUrls.find(
		(url) => url === ctx.query.redirect_uri,
	);

	if (!redirectURI || !query.redirect_uri) {
		/**
		 * show UI error here warning the user that the redirect URI is invalid
		 */
		throw new APIError("BAD_REQUEST", {
			message: "Invalid redirect URI",
		});
	}
	if (client.disabled) {
		const errorURL = getErrorURL(ctx, "client_disabled", "client is disabled");
		throw ctx.redirect(errorURL);
	}

	if (query.response_type !== "code") {
		const errorURL = getErrorURL(
			ctx,
			"unsupported_response_type",
			"unsupported response type",
		);
		throw ctx.redirect(errorURL);
	}

	const requestScope =
		query.scope?.split(" ").filter((s) => s) ||
		opts.defaultScope?.split(" ") ||
		[];
	const invalidScopes = requestScope.filter((scope) => {
		return !opts.scopes.includes(scope);
	});
	if (invalidScopes.length) {
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
		return handleRedirect(
			formatErrorURL(
				query.redirect_uri,
				"invalid_request",
				"invalid code_challenge method",
			),
		);
	}

	const code = generateRandomString(32, "a-z", "A-Z", "0-9");
	const codeExpiresInMs = opts.codeExpiresIn! * 1000;
	const expiresAt = new Date(Date.now() + codeExpiresInMs);

	// Determine if consent is required
	// Consent is ALWAYS required unless:
	// 1. The client is trusted (skipConsent = true)
	// 2. The user has already consented and prompt is not "consent"
	const skipConsentForTrustedClient = client.skipConsent;
	const hasAlreadyConsented = await ctx.context.adapter
		.findOne<{
			consentGiven: boolean;
			scopes: string;
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
		.then((res) => {
			if (!res?.consentGiven) {
				return false;
			}
			const consentedScopes = res.scopes ? res.scopes.split(" ") : [];
			const hasConsented = requestScope.every((scope) =>
				consentedScopes.includes(scope),
			);
			return hasConsented;
		});

	const promptSet = parsePrompt(query.prompt ?? "");

	// Handle prompt=none per OIDC spec 3.1.2.1
	// The Authorization Server MUST NOT display any authentication or consent UI
	if (promptSet.has("none")) {
		// If consent is required, return consent_required error
		if (!skipConsentForTrustedClient && !hasAlreadyConsented) {
			return handleRedirect(
				formatErrorURL(
					query.redirect_uri,
					"consent_required",
					"Consent required but prompt is none",
				),
			);
		}
		// If we reach here, user is authenticated and consent is satisfied
		// Continue without any UI interaction
	}

	// Handle max_age parameter per OIDC spec 3.1.2.1
	// max_age=0 is equivalent to prompt=login
	let requireLogin = promptSet.has("login");
	if (query.max_age !== undefined) {
		const maxAge = Number(query.max_age);
		if (Number.isInteger(maxAge) && maxAge >= 0) {
			const sessionAge =
				(Date.now() - new Date(session.session.createdAt).getTime()) / 1000;
			if (sessionAge > maxAge) {
				// Session is older than max_age, force re-authentication
				requireLogin = true;
			}
		}
		// If max_age is invalid (not a non-negative integer), ignore it per OIDC spec
	}

	const requireConsent =
		!skipConsentForTrustedClient &&
		(!hasAlreadyConsented || promptSet.has("consent"));

	try {
		/**
		 * Save the code in the database
		 */
		await ctx.context.internalAdapter.createVerificationValue({
			value: JSON.stringify({
				clientId: client.clientId,
				redirectURI: query.redirect_uri,
				scope: requestScope,
				userId: session.user.id,
				authTime: new Date(session.session.createdAt).getTime(),
				/**
				 * Consent is required per OIDC spec unless:
				 * 1. Client is trusted (skipConsent = true)
				 * 2. User has already consented (and prompt is not "consent")
				 *
				 * When consent is required, the code needs to be treated as a
				 * consent request. Once the user consents, the code will be
				 * updated with the actual authorization code.
				 */
				requireConsent,
				state: requireConsent ? query.state : null,
				codeChallenge: query.code_challenge,
				codeChallengeMethod: query.code_challenge_method,
				nonce: query.nonce,
			}),
			identifier: code,
			expiresAt,
		});
	} catch (e) {
		return handleRedirect(
			formatErrorURL(
				query.redirect_uri,
				"server_error",
				"An error occurred while processing the request",
			),
		);
	}

	if (requireLogin) {
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
		await ctx.setSignedCookie("oidc_consent_prompt", code, ctx.context.secret, {
			maxAge: 600,
			path: "/",
			sameSite: "lax",
		});

		const loginURI = `${options.loginPage}?${new URLSearchParams({
			client_id: client.clientId,
			code,
			state: query.state,
		}).toString()}`;
		return handleRedirect(loginURI);
	}

	// If consent is not required, redirect with the code immediately
	if (!requireConsent) {
		const redirectURIWithCode = new URL(redirectURI);
		redirectURIWithCode.searchParams.set("code", code);
		redirectURIWithCode.searchParams.set("state", ctx.query.state);
		return handleRedirect(redirectURIWithCode.toString());
	}

	// Consent is required - redirect to consent page or show consent HTML

	if (options?.consentPage) {
		// Set cookie to support cookie-based consent flows
		await ctx.setSignedCookie("oidc_consent_prompt", code, ctx.context.secret, {
			maxAge: 600,
			path: "/",
			sameSite: "lax",
		});

		// Pass the consent code as a URL parameter to support URL-based consent flows
		const urlParams = new URLSearchParams();
		urlParams.set("consent_code", code);
		urlParams.set("client_id", client.clientId);
		urlParams.set("scope", requestScope.join(" "));
		const consentURI = `${options.consentPage}?${urlParams.toString()}`;

		return handleRedirect(consentURI);
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
