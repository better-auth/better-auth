import { APIError } from "better-call";
import type { GenericEndpointContext } from "@better-auth/core";
import { getSessionFromCtx } from "../../api";
import type {
	OAuthAuthorizationQuery,
	OAuthConsent,
	OAuthOptions,
	VerificationValue,
} from "./types";
import { generateRandomString } from "../../crypto";
import { getClient, storeToken } from "./utils";

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
		error_description: description,
	});
	state && searchParams.append("state", state);
	return `${url}${url.includes("?") ? "&" : "?"}${searchParams.toString()}`;
}

const handleRedirect = (ctx: GenericEndpointContext, uri: string) => {
	const acceptJson = ctx.request?.headers
		.get("accept")
		?.includes("application/json");
	if (acceptJson) {
		return ctx.json({
			redirect: true,
			url: uri.toString(),
		});
	} else {
		throw ctx.redirect(uri);
	}
};

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

export async function authorizeEndpoint(
	ctx: GenericEndpointContext,
	opts: OAuthOptions,
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

	// Check request
	const query: OAuthAuthorizationQuery = ctx.query;
	if (!query.client_id) {
		throw ctx.redirect(
			getErrorURL(ctx, "invalid_client", "client_id is required"),
		);
	}

	if (!query.response_type) {
		throw ctx.redirect(
			getErrorURL(ctx, "invalid_request", "response_type is required"),
		);
	}

	if (!(query.response_type === "code")) {
		throw ctx.redirect(
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
		throw ctx.redirect(
			getErrorURL(ctx, "invalid_client", "client_id is required"),
		);
	}
	if (client.disabled) {
		throw ctx.redirect(
			getErrorURL(ctx, "client_disabled", "client is disabled"),
		);
	}
	const redirectUri = client.redirectUris?.find(
		(url) => url === query.redirect_uri,
	);
	if (!redirectUri || !query.redirect_uri) {
		throw ctx.redirect(
			getErrorURL(ctx, "invalid_redirect", "invalid redirect uri"),
		);
	}

	const requestScope = query.scope?.split(" ").filter((s) => s) ?? [];
	const invalidScopes = requestScope.filter((scope) => {
		// invalid in scopes list
		return (
			!opts.scopes?.includes(scope) ||
			// offline access must be requested through PKCE
			(scope === "offline_access" &&
				(query.code_challenge_method !== "S256" || !query.code_challenge))
		);
	});
	if (invalidScopes.length) {
		throw ctx.redirect(
			formatErrorURL(
				query.redirect_uri,
				"invalid_scope",
				`The following scopes are invalid: ${invalidScopes.join(", ")}`,
				query.state,
			),
		);
	}

	if (!query.code_challenge || !query.code_challenge_method) {
		throw ctx.redirect(
			formatErrorURL(
				query.redirect_uri,
				"invalid_request",
				"pkce is required",
				query.state,
			),
		);
	}

	// Check code challenges
	const codeChallengesSupported = ["S256"];
	if (!codeChallengesSupported.includes(query.code_challenge_method)) {
		throw ctx.redirect(
			formatErrorURL(
				query.redirect_uri,
				"invalid_request",
				"invalid code_challenge method",
				query.state,
			),
		);
	}

	// Check for session
	const session = await getSessionFromCtx(ctx);
	if (!session || query.prompt === "login") {
		const { name: cookieName, attributes: cookieAttributes } =
			ctx.context.createAuthCookie("oauth_login_prompt");
		await ctx.setSignedCookie(
			cookieName,
			JSON.stringify(ctx.query),
			ctx.context.secret,
			cookieAttributes,
		);
		const reqestUrl = new URL(ctx.request.url);
		return handleRedirect(ctx, `${opts.loginPage}${reqestUrl.search}`);
	}

	// Force consent screen
	if (query.prompt === "consent") {
		return redirectWithConsentCode(ctx, opts, {
			query,
			clientId: client.clientId,
			userId: session.user.id,
			sessionId: session.session.id,
			scopes: requestScope.join(" "),
		});
	}

	// Can skip consent (unless forced by prompt above)
	if (client.skipConsent) {
		return redirectWithAuthorizationCode(ctx, opts, {
			query,
			clientId: client.clientId,
			userId: session.user.id,
			sessionId: session.session.id,
			scopes: requestScope.join(" "),
		});
	}
	const consent = await ctx.context.adapter
		.findOne<OAuthConsent>({
			model: opts.schema?.oauthConsent?.modelName ?? "oauthConsent",
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
			if (!res) return undefined;
			return {
				...res,
				scopes: (res.scopes as unknown as string)?.split(" "),
			} as OAuthConsent;
		});

	if (!consent || !requestScope.every((val) => consent.scopes.includes(val))) {
		return redirectWithConsentCode(ctx, opts, {
			query,
			clientId: client.clientId,
			userId: session.user.id,
			sessionId: session.session.id,
			scopes: requestScope.join(" "),
		});
	}

	return redirectWithAuthorizationCode(ctx, opts, {
		query,
		clientId: client.clientId,
		userId: session.user.id,
		sessionId: session.session.id,
		scopes: requestScope.join(" "),
	});
}

async function redirectWithAuthorizationCode(
	ctx: GenericEndpointContext,
	opts: OAuthOptions,
	verificationValue: {
		query: OAuthAuthorizationQuery;
		clientId: string;
		userId: string;
		sessionId: string;
		scopes: string;
	},
) {
	const code = generateRandomString(32, "a-z", "A-Z", "0-9");
	const now = Math.floor(Date.now() / 1000);
	const expiresAt = now + (opts.codeExpiresIn ?? 600);

	await ctx.context.internalAdapter.createVerificationValue(
		{
			identifier: await storeToken(
				opts.storeTokens,
				code,
				"authorization_code",
			),
			createdAt: new Date(now * 1000),
			expiresAt: new Date(expiresAt * 1000),
			value: JSON.stringify({
				type: "authorization_code",
				clientId: verificationValue.clientId,
				userId: verificationValue.userId,
				sessionId: verificationValue?.sessionId,
				redirectUri: verificationValue.query.redirect_uri,
				scopes: verificationValue.scopes,
				...(verificationValue.query.state !== undefined
					? { state: verificationValue.query.state }
					: {}),
				codeChallenge: verificationValue.query.code_challenge,
				codeChallengeMethod: verificationValue.query.code_challenge_method,
				nonce: verificationValue.query.nonce,
			} satisfies VerificationValue),
		},
		ctx,
	);

	const redirectUriWithCode = new URL(verificationValue.query.redirect_uri);
	redirectUriWithCode.searchParams.set("code", code);
	if (verificationValue.query.state) {
		redirectUriWithCode.searchParams.set(
			"state",
			verificationValue.query.state,
		);
	}
	return handleRedirect(ctx, redirectUriWithCode.toString());
}

async function redirectWithConsentCode(
	ctx: GenericEndpointContext,
	opts: OAuthOptions,
	verificationValue: {
		query: OAuthAuthorizationQuery;
		clientId: string;
		userId: string;
		sessionId: string;
		scopes: string;
	},
) {
	const code = generateRandomString(32, "a-z", "A-Z", "0-9");
	const iat = Math.floor(Date.now() / 1000);
	const exp = iat + (opts.codeExpiresIn ?? 600);

	await ctx.context.internalAdapter.createVerificationValue(
		{
			identifier: await storeToken(
				opts.storeTokens,
				code,
				"authorization_code",
			),
			createdAt: new Date(iat * 1000),
			expiresAt: new Date(exp * 1000),
			value: JSON.stringify({
				type: "consent",
				clientId: verificationValue.clientId,
				userId: verificationValue.userId,
				sessionId: verificationValue.sessionId,
				redirectUri: verificationValue.query.redirect_uri,
				scopes: verificationValue.scopes,
				state: verificationValue.query.state,
				codeChallenge: verificationValue.query.code_challenge,
				codeChallengeMethod: verificationValue.query.code_challenge_method,
				nonce: verificationValue.query.nonce,
			} satisfies VerificationValue),
		},
		ctx,
	);

	const { name: cookieName, attributes: cookieAttributes } =
		ctx.context.createAuthCookie("oauth_consent_prompt");
	await ctx.setSignedCookie(
		cookieName,
		code,
		ctx.context.secret,
		cookieAttributes,
	);

	const params = new URLSearchParams({
		client_id: verificationValue.clientId,
		scope: verificationValue.scopes,
		state: verificationValue.query.state,
	});
	const consentUri = `${opts.consentPage}?${params.toString()}`;

	return handleRedirect(ctx, consentUri);
}
