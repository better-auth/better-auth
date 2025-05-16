import { APIError } from "better-call";
import type { GenericEndpointContext } from "../../types";
import { getSessionFromCtx } from "../../api";
import type {
	AuthorizationQuery,
	Client,
	OIDCOptions,
} from "../oidc-provider/types";
import { generateRandomString } from "../../crypto";

function redirectErrorURL(url: string, error: string, description: string) {
	return `${
		url.includes("?") ? "&" : "?"
	}error=${error}&error_description=${description}`;
}

export async function authorizeMCPOAuth(
	ctx: GenericEndpointContext,
	options: OIDCOptions,
) {
	ctx.setHeader("Access-Control-Allow-Origin", "*");
	ctx.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
	ctx.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
	ctx.setHeader("Access-Control-Max-Age", "86400");
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
		throw ctx.redirect(`${options.loginPage}?${queryFromURL}`);
	}

	const query = ctx.query as AuthorizationQuery;
	console.log(query);
	if (!query.client_id) {
		throw ctx.redirect(`${ctx.context.baseURL}/error?error=invalid_client`);
	}

	if (!query.response_type) {
		throw ctx.redirect(
			redirectErrorURL(
				`${ctx.context.baseURL}/error`,
				"invalid_request",
				"response_type is required",
			),
		);
	}

	const client = await ctx.context.adapter
		.findOne<Record<string, any>>({
			model: "oauthApplication",
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
				redirectURLs: res.redirectURLs.split(","),
				metadata: res.metadata ? JSON.parse(res.metadata) : {},
			} as Client;
		});
	console.log(client);
	if (!client) {
		throw ctx.redirect(`${ctx.context.baseURL}/error?error=invalid_client`);
	}
	const redirectURI = client.redirectURLs.find(
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
		throw ctx.redirect(`${ctx.context.baseURL}/error?error=client_disabled`);
	}

	if (query.response_type !== "code") {
		throw ctx.redirect(
			`${ctx.context.baseURL}/error?error=unsupported_response_type`,
		);
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
		throw ctx.redirect(
			redirectErrorURL(
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
		throw ctx.redirect(
			redirectErrorURL(
				query.redirect_uri,
				"invalid_request",
				"pkce is required",
			),
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
		throw ctx.redirect(
			redirectErrorURL(
				query.redirect_uri,
				"invalid_request",
				"invalid code_challenge method",
			),
		);
	}

	const code = generateRandomString(32, "a-z", "A-Z", "0-9");
	const codeExpiresInMs = opts.codeExpiresIn * 1000;
	const expiresAt = new Date(Date.now() + codeExpiresInMs);
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
					 * once the user consents, teh code will be updated
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
		throw ctx.redirect(
			redirectErrorURL(
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
		throw ctx.redirect(redirectURIWithCode.toString());
	}

	throw ctx.redirect(redirectURIWithCode.toString());
}
