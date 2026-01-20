import type { GenericEndpointContext } from "@better-auth/core";
import { getSessionFromCtx } from "better-auth/api";
import { generateRandomString, makeSignature } from "better-auth/crypto";
import type { Verification } from "better-auth/db";
import { APIError } from "better-call";
import type {
	OAuthAuthorizationQuery,
	OAuthConsent,
	OAuthOptions,
	Scope,
	VerificationValue,
} from "./types";
import {
	getClient,
	isPublicClient,
	parsePrompt,
	requiresPKCEForClient,
	storeToken,
} from "./utils";

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
		return {
			redirect: true,
			url: uri.toString(),
		};
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

	const promptSet = ctx.query?.prompt
		? parsePrompt(ctx.query?.prompt)
		: undefined;
	if (promptSet?.has("select_account") && !opts.selectAccount?.page) {
		throw ctx.redirect(
			getErrorURL(
				ctx,
				`unsupported_prompt_select_account`,
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

	const redirectUri = client.redirectUris?.find(
		(url) => url === query.redirect_uri,
	);
	if (!redirectUri || !query.redirect_uri) {
		throw ctx.redirect(
			getErrorURL(ctx, "invalid_redirect", "invalid redirect uri"),
		);
	}

	// Check for invalid scopes if requested from query
	let requestedScopes = query.scope?.split(" ").filter((s) => s);
	if (requestedScopes) {
		const validScopes = new Set(client.scopes ?? opts.scopes);
		const invalidScopes = requestedScopes.filter((scope) => {
			return (
				!validScopes?.has(scope) ||
				// offline access ALWAYS requires PKCE (OAuth 2.1)
				(scope === "offline_access" &&
					(!query.code_challenge ||
						!query.code_challenge_method ||
						(query.code_challenge_method !== "S256" &&
							query.code_challenge_method !== "plain")))
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
	}
	// Always set default scopes if not originally sent
	if (!requestedScopes) {
		requestedScopes = client.scopes ?? opts.scopes ?? [];
		query.scope = requestedScopes.join(" ");
	}

	// Determine if PKCE is required for this client
	const pkceProvided = !!(query.code_challenge && query.code_challenge_method);
	const pkceRequired = requiresPKCEForClient(client, opts);

	if (pkceRequired && !pkceProvided) {
		const isPublic = isPublicClient(client);
		const reason = isPublic
			? "pkce is required for public clients (OAuth 2.1)"
			: "pkce is required";
		throw ctx.redirect(
			formatErrorURL(
				query.redirect_uri,
				"invalid_request",
				reason,
				query.state,
			),
		);
	}

	// If PKCE is provided, validate the code challenge method
	if (pkceProvided) {
		const allowedMethods = opts.allowPlainCodeChallengeMethod
			? ["S256", "plain"]
			: ["S256"];
		if (!allowedMethods.includes(query.code_challenge_method!)) {
			throw ctx.redirect(
				formatErrorURL(
					query.redirect_uri,
					"invalid_request",
					"invalid code_challenge method",
					query.state,
				),
			);
		}
	}

	// Check for session
	const session = await getSessionFromCtx(ctx);
	if (!session || promptSet?.has("login") || promptSet?.has("create")) {
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
		return redirectWithPromptCode(ctx, opts, "consent");
	}

	return redirectWithAuthorizationCode(ctx, opts, {
		query,
		clientId: client.clientId,
		userId: session.user.id,
		sessionId: session.session.id,
		referenceId,
	});
}

async function redirectWithAuthorizationCode(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	verificationValue: {
		query: OAuthAuthorizationQuery;
		clientId: string;
		userId: string;
		sessionId: string;
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
			query: ctx.query,
			userId: verificationValue.userId,
			sessionId: verificationValue?.sessionId,
			referenceId: verificationValue.referenceId,
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
	const params = new URLSearchParams(ctx.query);
	params.set("exp", String(exp));

	const signature = await makeSignature(params.toString(), ctx.context.secret);
	params.append("sig", signature);
	return params.toString();
}
