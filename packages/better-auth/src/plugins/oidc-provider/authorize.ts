import { APIError } from "better-call";
import type { GenericEndpointContext } from "../../types";
import { getSessionFromCtx } from "../../api";
import type { AuthorizationQuery, SchemaClient, OIDCOptions, VerificationValue } from "./types";
import { generateRandomString } from "../../crypto";

/**
 * Formats an error url
 */
export function formatErrorURL(
	url: string,
	error: string,
	description: string,
	state?: string,
) {
	const searchParams = new URLSearchParams({
		error,
		error_description: description
	})
	state && searchParams.append('state', state)
	return `${url.includes("?") ? "&" : "?"}${searchParams.toString()}`;
}

/**
 * Error page url if redirect_uri has not been verified yet
 * Generates Url for custom error page
 */
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

	if (!ctx.request) {
		throw new APIError("UNAUTHORIZED", {
			error_description: "request not found",
			error: "invalid_request",
		});
	}
	const session = await getSessionFromCtx(ctx);
	if (!session) {
		/**
		 * If the user is not logged in, we need to redirect them to the
		 * login page.
		 */
		await ctx.setSignedCookie(
			"oidc_login_prompt",
			JSON.stringify(ctx.query),
			ctx.context.secret,
			{
				httpOnly: true,
				maxAge: 600,
				path: "/oauth2",
				sameSite: "strict",
			},
		);
		const queryFromURL = ctx.request.url?.split("?")[1];
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

	if (!(query.response_type === "code")) {
		const errorURL = getErrorURL(
			ctx,
			"unsupported_response_type",
			"unsupported response type",
		);
		throw ctx.redirect(errorURL);
	}

	/** Check client */
	const client = await ctx.context.adapter
		.findOne<Record<string,string|null>>({
			model: options.schema?.oauthClient?.modelName ?? "oauthClient",
			where: [
				{
					field: "clientId",
					value: ctx.query.client_id,
				},
			],
		})
		.then((res) => {
			if (!res) {
				return null;
			}
			return {
				...res,
				contacts: res.contacts?.split(",") ?? undefined,
				grantTypes: res.grantTypes?.split(",") ?? undefined,
				responseTypes: res.responseTypes?.split(",") ?? undefined,
				redirectUris: res?.redirectUris?.split(",") ?? undefined,
				metadata: res.metadata ? JSON.parse(res.metadata) : {},
			} as SchemaClient;
		});
	if (!client) {
		const errorURL = getErrorURL(
			ctx,
			"invalid_client",
			"client_id is required",
		);
		throw ctx.redirect(errorURL);
	}
	if (client.disabled) {
		const errorURL = getErrorURL(
			ctx,
			"client_disabled",
			"client is disabled"
		);
		throw ctx.redirect(errorURL);
	}
	const redirectURI = client.redirectUris?.find(
		(url) => url === ctx.query.redirect_uri,
	);
	if (!redirectURI || !query.redirect_uri) {
		const errorURL = getErrorURL(
			ctx,
			"invalid_redirect",
			"invalid redirect uri"
		);
		throw ctx.redirect(errorURL);
	}

	const requestScope =
		query.scope?.split(" ").filter((s) => s) ?? [];
	const invalidScopes = requestScope.filter((scope) => {
		// invalid in scopes list
		return !options.scopes?.includes(scope) ||
			// offline access must be requested through PKCE
			(scope === "offline_access" && (query.code_challenge_method?.toLowerCase() !== "s256" || !query.code_challenge));
	});
	if (invalidScopes.length) {
		return handleRedirect(
			formatErrorURL(
				query.redirect_uri,
				"invalid_scope",
				`The following scopes are invalid: ${invalidScopes.join(", ")}`,
				query.state,
			)
		);
	}

	if ((!query.code_challenge || !query.code_challenge_method)) {
		return handleRedirect(
			formatErrorURL(
				query.redirect_uri,
				"invalid_request",
				"pkce is required",
				query.state,
			)
		);
	}

	// Check code challenges
	const codeChallengesSupported = ["s256"]
	if (!codeChallengesSupported.includes(query.code_challenge_method?.toLowerCase())) {
		return handleRedirect(
			formatErrorURL(
				query.redirect_uri,
				"invalid_request",
				"invalid code_challenge method",
				query.state,
			),
		);
	}

	const code = generateRandomString(32, "a-z", "A-Z", "0-9");
	const codeExpiresInMs = (options.codeExpiresIn ?? 0) * 1000;
	const expiresAt = new Date(Date.now() + codeExpiresInMs);
	try {
		/**
		 * Save the code in the database
		 */
		await ctx.context.internalAdapter.createVerificationValue(
			{
				identifier: code,
				expiresAt,
				value: JSON.stringify({
					clientId: client.clientId,
					userId: session.user.id,
					requireConsent: query.prompt === "consent",
					redirectUri: query.redirect_uri,
					scopes: requestScope.join(" "),
					state: query.state,
					codeChallenge: query.code_challenge,
					codeChallengeMethod: query.code_challenge_method,
					nonce: query.nonce,
				} as VerificationValue)
			},
			ctx,
		);
	} catch (e) {
		return handleRedirect(
			formatErrorURL(
				query.redirect_uri,
				"server_error",
				"An error occurred while processing the request",
				query.state,
			),
		);
	}

	const redirectURIWithCode = new URL(redirectURI);
	redirectURIWithCode.searchParams.set("code", code);
	redirectURIWithCode.searchParams.set("state", ctx.query.state);

	if (query.prompt !== "consent") {
		return handleRedirect(redirectURIWithCode.toString());
	}

	const hasAlreadyConsented = await ctx.context.adapter
		.findOne<{
			consentGiven: boolean;
		}>({
			model: options.schema?.oauthConsent?.modelName ?? "oauthConsent",
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
		return handleRedirect(redirectURIWithCode.toString());
	}

	if (!options.consentPage) {
		throw new APIError("INTERNAL_SERVER_ERROR", {
			message: "No consent page provided",
		});
	}

	await ctx.setSignedCookie("oidc_consent_prompt", code, ctx.context.secret, {
		httpOnly: true,
		maxAge: 600,
		path: "/",
		sameSite: "strict",
	});
	const params = new URLSearchParams({
		client_id: client.clientId,
		scope: requestScope.join(" "),
	})
	const consentURI = `${options.consentPage}?${params.toString()}`;

	return handleRedirect(consentURI);
}
