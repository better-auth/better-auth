import type { AuthContext } from "@better-auth/core";
import { isAPIError } from "better-auth/api";
import type { User } from "better-auth/types";
import type { JWTPayload } from "jose";
import { extendOAuthProvider } from "./extensions";
import { resolveResourcePolicy } from "./resources";
import type {
	OAuthExtensionGrantHandlerInput,
	OAuthTokenResponse,
	SchemaClient,
	Scope,
} from "./types";
import type { Awaitable } from "./types/helpers";
import {
	consentCovers,
	findConsent,
	parseScopes,
	tokenError,
	validateClientScopes,
} from "./utils";

/** RFC 8693 §2.1 token exchange grant type. */
export const TOKEN_EXCHANGE_GRANT_TYPE =
	"urn:ietf:params:oauth:grant-type:token-exchange";

/** RFC 8693 §3 token type identifier for an OAuth 2.0 access token. */
export const ACCESS_TOKEN_TYPE =
	"urn:ietf:params:oauth:token-type:access_token";

// Exchanged tokens are access tokens for another service, never a login.
const NON_EXCHANGEABLE_SCOPES = new Set(["openid", "offline_access"]);

export interface OAuthTokenExchangeRequest {
	/** The authenticated client requesting the exchange. */
	client: SchemaClient<Scope[]>;
	/** The user the subject token represents, and the issued token's `sub`. */
	user: User;
	/** The validated subject token, in RFC 7662 introspection form. */
	subjectToken: JWTPayload;
	/** Resource identifiers the issued token is requested for. */
	resources: string[];
	/** Scopes the issued token is requested with. */
	scopes: string[];
	/**
	 * Consent reference (`postLogin.consentReferenceId`) the subject token was
	 * issued under, such as an organization. The issued token keeps it.
	 */
	referenceId?: string;
}

export interface OAuthTokenExchangeOptions {
	/**
	 * Final policy check, run after every built-in check passes. Return `false`
	 * to deny the exchange with `invalid_request`, or throw an `APIError` for a
	 * different OAuth error.
	 */
	allowExchange?: (request: OAuthTokenExchangeRequest) => Awaitable<boolean>;
}

function deny(description: string): never {
	tokenError("BAD_REQUEST", "invalid_request", description);
}

async function exchangeToken(
	{ ctx, opts, provider }: OAuthExtensionGrantHandlerInput,
	options: OAuthTokenExchangeOptions,
): Promise<OAuthTokenResponse> {
	const body = (ctx.body ?? {}) as Record<string, unknown>;
	const subjectToken = body.subject_token;
	if (typeof subjectToken !== "string" || !subjectToken) {
		deny("subject_token is required");
	}
	if (body.subject_token_type !== ACCESS_TOKEN_TYPE) {
		deny(`subject_token_type must be ${ACCESS_TOKEN_TYPE}`);
	}
	// shortcut: impersonation only; delegation (actor_token, `act`) needs an
	// AS-owned actor claim first.
	if (body.actor_token !== undefined || body.actor_token_type !== undefined) {
		deny("actor_token is not supported");
	}
	if (
		body.requested_token_type !== undefined &&
		body.requested_token_type !== ACCESS_TOKEN_TYPE
	) {
		deny("requested_token_type is not supported");
	}
	// RFC 8693 §2.1 names targets by `resource` or by logical `audience`; both
	// must be registered resource identifiers here. The token route already
	// collects repeated values of each.
	const targets: unknown[] = [body.resource, body.audience]
		.flat()
		.filter((target) => target != null);
	if (targets.length === 0) deny("resource or audience is required");

	// Confidential clients only, and only when registered for this grant.
	const { client, confirmation } = await provider.authenticateClient();

	// Userinfo is only an implicit audience of OpenID tokens, and exchanged
	// tokens never carry `openid`.
	const userInfo = `${ctx.context.baseURL}/oauth2/userinfo`;
	if (
		targets.some(
			(target) => typeof target !== "string" || !target || target === userInfo,
		)
	) {
		tokenError(
			"BAD_REQUEST",
			"invalid_target",
			"each resource or audience must be a registered resource",
		);
	}
	const resources = [...new Set(targets as string[])];

	// The caller must be the token's client or a resource server in its
	// audience, so a client cannot exchange a token that was never sent to it.
	// An unknown, malformed, tampered, or foreign token is an invalid subject;
	// anything else, such as a database or key-set failure, is a server fault.
	const subject = await Promise.resolve(
		provider.validateAccessToken(subjectToken, client.clientId),
	).catch((error: unknown) => {
		if (isAPIError(error)) {
			return undefined;
		}
		throw error;
	});
	if (!subject?.active || !subject.sub || !subject.exp) {
		deny("subject_token is invalid");
	}
	const user = await ctx.context.internalAdapter.findUserById(subject.sub);
	if (!user) deny("subject_token does not represent a user");

	const exchangeable = parseScopes(subject.scope as string | undefined).filter(
		(scope) => !NON_EXCHANGEABLE_SCOPES.has(scope),
	);
	const scopes =
		typeof body.scope === "string" && body.scope.trim()
			? [...new Set(parseScopes(body.scope))]
			: // By default, every exchangeable scope the client may hold.
				exchangeable.filter(
					(scope) => !client.scopes || client.scopes.includes(scope),
				);
	const widened = scopes.find((scope) => !exchangeable.includes(scope));
	if (widened) {
		tokenError(
			"BAD_REQUEST",
			"invalid_scope",
			`scope ${widened} is not available through token exchange`,
		);
	}
	validateClientScopes(client, scopes);
	// Resolve the targets now, so consent and allowExchange only ever see valid
	// targets and the scopes their allowlists leave.
	const { effectiveScopes } = await resolveResourcePolicy(ctx, opts, {
		resource: resources,
		clientId: client.clientId,
		requestedScopes: scopes,
	});
	// Keep the reference the user approved, not their current one (RFC 9068 §2.2.1).
	const referenceId =
		(typeof subject.reference_id === "string" && subject.reference_id) ||
		undefined;

	// Like authorization: a client that does not skip consent needs the user's
	// consent for these scopes and resources.
	if (!client.skipConsent) {
		const consent = await findConsent(
			ctx,
			client.clientId,
			user.id,
			referenceId,
		);
		if (!consent || !consentCovers(consent, effectiveScopes, resources)) {
			deny("the user has not consented to this client for this exchange");
		}
	}
	if (
		options.allowExchange &&
		!(await options.allowExchange({
			client,
			user,
			subjectToken: subject,
			resources,
			scopes: effectiveScopes,
			referenceId,
		}))
	) {
		deny("token exchange denied by policy");
	}

	return provider.issueTokens({
		client,
		user,
		scopes: effectiveScopes,
		resources,
		referenceId,
		// Introspection reports the exchanged token inactive once the session ends.
		sessionId: typeof subject.sid === "string" ? subject.sid : undefined,
		maxExpiresAt: new Date(subject.exp * 1000),
		confirmation,
		tokenResponse: { issued_token_type: ACCESS_TOKEN_TYPE },
	});
}

/**
 * RFC 8693 token exchange for the OAuth Provider. A confidential client
 * registered for the token-exchange grant trades a user's access token, issued
 * by this server to it or for a resource it serves, for an access token to
 * another registered resource. The issued token represents the same user
 * (impersonation), carries the requesting client as `client_id`, and expires
 * no later than the subject token.
 *
 * @example
 * ```ts
 * const auth = betterAuth({
 *   plugins: [jwt(), oauthProvider({ ... }), oauthTokenExchange()],
 * });
 * ```
 */
export function oauthTokenExchange(options: OAuthTokenExchangeOptions = {}) {
	const extension = {
		grants: {
			[TOKEN_EXCHANGE_GRANT_TYPE]: (input: OAuthExtensionGrantHandlerInput) =>
				exchangeToken(input, options),
		},
	};
	return {
		id: "oauth-token-exchange",
		init(ctx: AuthContext) {
			extendOAuthProvider(ctx, extension);
		},
	};
}
