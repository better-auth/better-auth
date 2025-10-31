import type { GenericEndpointContext } from "@better-auth/core";
import { APIError } from "better-call";
import { getSessionFromCtx } from "../../api";
import { generateRandomString } from "../../crypto";
import type { Verification } from "../../db";
import type {
	OAuthAuthorizationQuery,
	OAuthConsent,
	OAuthOptions,
	VerificationValue,
} from "./types";
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

export const handleRedirect = (ctx: GenericEndpointContext, uri: string) => {
	const acceptJson = ctx.headers?.get("accept")?.includes("application/json");
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

	if (query?.prompt === "select_account" && !opts.selectAccountPage) {
		throw ctx.redirect(
			getErrorURL(
				ctx,
				`unsupported_prompt_${query.prompt}`,
				"unsupported prompt type",
			),
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
	client.clientSecret = undefined;

	const redirectUri = client.redirectUris?.find(
		(url) => url === query.redirect_uri,
	);
	if (!redirectUri || !query.redirect_uri) {
		throw ctx.redirect(
			getErrorURL(ctx, "invalid_redirect", "invalid redirect uri"),
		);
	}

	// Check for invalid scopes if requested from query
	let requestScopes = query.scope?.split(" ").filter((s) => s) ?? [];
	const invalidScopes = requestScopes.filter((scope) => {
		return (
			!(client.scopes ?? opts.scopes)?.includes(scope) ||
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
	// Always set default scopes if not originally sent
	if (!query.scope) {
		requestScopes = client.scopes ?? opts.scopes ?? [];
		query.scope = requestScopes.join(" ");
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
			{
				path: ctx.context.options.basePath,
				sameSite: "lax",
				...cookieAttributes,
			},
		);
		const requestUrl = new URL(ctx.request.url);
		return handleRedirect(ctx, `${opts.loginPage}${requestUrl.search}`);
	}

	// Force account selection (eg. multi-session)
	if (ctx.context.authorize_only && query.prompt === "select_account") {
		return redirectWithPromptCode(ctx, opts, "select_account", {
			query,
			userId: session.user.id,
			sessionId: session.session.id,
		});
	}

	if (
		// Check if account needs selection (only for authorize endpoint)
		ctx.context.authorize_only &&
		opts.selectedAccount
	) {
		const selectedAccount = await opts.selectedAccount({
			headers: ctx.request.headers,
			user: session.user,
			session: session.session,
			scopes: requestScopes,
		});
		if (!selectedAccount) {
			return redirectWithPromptCode(ctx, opts, "select_account", {
				query,
				userId: session.user.id,
				sessionId: session.session.id,
			});
		}
	}

	if (!ctx.context.post_login && opts.postLogin) {
		const postLogin = await opts.postLogin({
			user: session.user,
			session: session.session,
			scopes: requestScopes,
		});
		if (!postLogin) {
			return redirectWithPromptCode(ctx, opts, "post_login", {
				query,
				userId: session.user.id,
				sessionId: session.session.id,
			});
		}
	}

	// Force consent screen
	if (query.prompt === "consent") {
		return redirectWithPromptCode(ctx, opts, "consent", {
			query,
			userId: session.user.id,
			sessionId: session.session.id,
		});
	}

	// Can skip consent (unless forced by prompt above)
	if (client.skipConsent) {
		return redirectWithAuthorizationCode(ctx, opts, {
			query,
			clientId: client.clientId,
			userId: session.user.id,
			sessionId: session.session.id,
		});
	}
	const referenceId = await opts.postLoginConsentReferenceId?.({
		user: session.user,
		session: session.session,
		scopes: requestScopes,
	});
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
				...(referenceId
					? [
							{
								field: "referenceId",
								value: referenceId,
							},
						]
					: []),
			],
		})
		.then((res) => {
			if (!res) return undefined;
			return {
				...res,
				scopes: (res.scopes as unknown as string)?.split(" "),
			} as OAuthConsent;
		});

	if (!consent || !requestScopes.every((val) => consent.scopes.includes(val))) {
		return redirectWithPromptCode(ctx, opts, "consent", {
			query,
			userId: session.user.id,
			sessionId: session.session.id,
		});
	}

	return redirectWithAuthorizationCode(ctx, opts, {
		query,
		clientId: client.clientId,
		userId: session.user.id,
		sessionId: session.session.id,
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
			query: ctx.query,
			userId: verificationValue.userId,
			sessionId: verificationValue?.sessionId,
		} satisfies VerificationValue),
	};
	ctx.context.verification_id
		? await ctx.context.internalAdapter.updateVerificationValue(
				ctx.context.verification_id,
				data,
			)
		: await ctx.context.internalAdapter.createVerificationValue({
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
	return handleRedirect(ctx, redirectUriWithCode.toString());
}

async function redirectWithPromptCode(
	ctx: GenericEndpointContext,
	opts: OAuthOptions,
	type: "consent" | "select_account" | "post_login",
	verificationValue: {
		query: OAuthAuthorizationQuery;
		userId: string;
		sessionId: string;
	},
) {
	const code = generateRandomString(32, "a-z", "A-Z", "0-9");
	const iat = Math.floor(Date.now() / 1000);
	const exp = iat + (opts.codeExpiresIn ?? 600);

	if (type === "select_account") {
		const { name: cookieName, attributes: cookieAttributes } =
			ctx.context.createAuthCookie("oauth_login_prompt");
		await ctx.setSignedCookie(
			cookieName,
			JSON.stringify(ctx.query),
			ctx.context.secret,
			{
				path: ctx.context.options.basePath,
				sameSite: "lax",
				...cookieAttributes,
			},
		);
		const params = new URLSearchParams(ctx.query);
		return handleRedirect(
			ctx,
			`${opts.selectAccountPage ?? opts.loginPage}?${params.toString()}`,
		);
	}

	if (!ctx.query.scope) {
		ctx.query.scope = opts.scopes?.join(" ");
	}
	const data: Omit<Verification, "id" | "createdAt"> = {
		identifier: await storeToken(opts.storeTokens, code, "authorization_code"),
		updatedAt: new Date(iat * 1000),
		expiresAt: new Date(exp * 1000),
		value: JSON.stringify({
			type,
			query: ctx.query,
			userId: verificationValue.userId,
			sessionId: verificationValue?.sessionId,
		} satisfies VerificationValue),
	};
	ctx.context.verification_id
		? await ctx.context.internalAdapter.updateVerificationValue(
				ctx.context.verification_id,
				data,
			)
		: await ctx.context.internalAdapter.createVerificationValue({
				...data,
				createdAt: new Date(iat * 1000),
			});

	const { name: cookieName, attributes: cookieAttributes } =
		ctx.context.createAuthCookie(`oauth_${type}`);
	await ctx.setSignedCookie(cookieName, code, ctx.context.secret, {
		path: ctx.context.options.basePath,
		sameSite: "lax",
		...cookieAttributes,
	});

	const params = new URLSearchParams(ctx.query);
	const consentUri = `${
		type === "post_login" ? opts.postLoginPage : opts.consentPage
	}?${params.toString()}`;

	return handleRedirect(ctx, consentUri);
}
