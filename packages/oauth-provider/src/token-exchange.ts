import type { AuthContext } from "@better-auth/core";
import { BetterAuthError } from "@better-auth/core/error";
import { isAPIError } from "better-auth/api";
import { getConfirmationJkt } from "better-auth/oauth2";
import type { User } from "better-auth/types";
import type { JWTPayload } from "jose";
import { getDpopProofJwt } from "./dpop";
import { extendOAuthProvider } from "./extensions";
import { resolveResourcePolicy } from "./resources";
import { resolveIssuanceConfirmation, sameConfirmation } from "./token";
import type {
	OAuthActorClaim,
	OAuthExtensionGrantHandlerInput,
	OAuthTokenResponse,
	SchemaClient,
	Scope,
} from "./types";
import type { Awaitable } from "./types/helpers";
import {
	consentCovers,
	findConsent,
	isConfirmation,
	isRecord,
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
	/** The validated actor, when the request sends an `actor_token`. */
	actor?: OAuthTokenExchangeActor;
	/**
	 * The RFC 8693 `act` chain the issued token will carry, before fields from
	 * `delegation.actorClaims` are added. Absent for an impersonation exchange
	 * of a subject token without `act`.
	 */
	act?: OAuthActorClaim;
}

/** The party acting for the user in a delegation exchange (RFC 8693 §1.1). */
export interface OAuthTokenExchangeActor {
	/**
	 * The actor's identifier, written as `act.sub`: a user id, or a client id
	 * for a `client_credentials` actor token.
	 */
	sub: string;
	/** The user the actor token represents. Absent for a client actor. */
	user?: User;
	/** The validated actor token, in RFC 7662 introspection form. */
	token: JWTPayload;
}

export interface OAuthTokenExchangeDelegationOptions {
	/**
	 * Maximum number of actors in the issued token's `act` chain. An exchange
	 * that would exceed it fails with `invalid_request`. `0` rejects every
	 * `actor_token` and every subject token that carries `act`.
	 *
	 * @default 1
	 */
	maxDepth?: number;
	/**
	 * Fields to add to the current actor's entry in `act`. Runs after every
	 * built-in check and after `allowExchange`, only for a request with an
	 * `actor_token`. The names `sub`, `iss`, and `act` are ignored, so the
	 * result cannot change who acted or the earlier actors.
	 */
	actorClaims?: (
		request: OAuthTokenExchangeRequest & { actor: OAuthTokenExchangeActor },
	) => Awaitable<Record<string, unknown> | undefined>;
}

export interface OAuthTokenExchangeOptions {
	/**
	 * Final policy check, run after every built-in check passes. Return `false`
	 * to deny the exchange with `invalid_request`, or throw an `APIError` for a
	 * different OAuth error.
	 */
	allowExchange?: (request: OAuthTokenExchangeRequest) => Awaitable<boolean>;
	/** Delegation (`actor_token` and `act`) settings. */
	delegation?: OAuthTokenExchangeDelegationOptions;
	/**
	 * Whether public clients (`token_endpoint_auth_method: "none"`) registered
	 * for the grant may exchange tokens. With `"dpop-bound"`, a public client
	 * may exchange only a DPoP-bound access token issued to itself, must prove
	 * that token's key, and receives a token bound to the same key. It cannot
	 * send an `actor_token`.
	 *
	 * @default false
	 */
	publicClients?: false | "dpop-bound";
}

// Names the authorization server owns inside the current actor's `act` entry.
const RESERVED_ACTOR_CLAIMS = new Set(["sub", "iss", "act"]);

function deny(description: string): never {
	tokenError("BAD_REQUEST", "invalid_request", description);
}

/**
 * Validates an access token presented to this grant. An unknown, malformed,
 * tampered, or foreign token is `undefined`, so the caller rejects it as
 * invalid; anything else, such as a database or key-set failure, is a server
 * fault and propagates.
 */
function validateExchangedToken(
	provider: OAuthExtensionGrantHandlerInput["provider"],
	token: string,
	clientId: string,
) {
	return Promise.resolve(provider.validateAccessToken(token, clientId)).catch(
		(error: unknown) => {
			if (isAPIError(error)) return undefined;
			throw error;
		},
	);
}

/**
 * Reads `actor_token` from the request. RFC 8693 §2.1: `actor_token_type` is
 * required with it and must not be sent without it.
 */
function readActorToken(body: Record<string, unknown>): string | undefined {
	const actorToken = body.actor_token;
	if ((actorToken === undefined) !== (body.actor_token_type === undefined)) {
		deny("actor_token and actor_token_type must be sent together");
	}
	if (actorToken === undefined) return undefined;
	if (typeof actorToken !== "string" || !actorToken) {
		deny("actor_token is invalid");
	}
	if (body.actor_token_type !== ACCESS_TOKEN_TYPE) {
		deny(`actor_token_type must be ${ACCESS_TOKEN_TYPE}`);
	}
	return actorToken;
}

/**
 * Reads a subject token's `act` chain. Returns its depth, or `null` when an
 * entry is not an object with a string `sub`.
 */
function actorChainDepth(act: unknown): number | null {
	let depth = 0;
	let entry = act;
	while (entry !== undefined) {
		if (!isRecord(entry) || typeof entry.sub !== "string" || !entry.sub) {
			return null;
		}
		depth++;
		entry = entry.act;
	}
	return depth;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whether `id` has the shape of a user id under the configured id mode. A
 * lookup with any other value cannot match, and some databases reject it: a
 * serial id column receives `NaN`, and a Postgres `uuid` column rejects
 * non-UUID text.
 */
function couldBeUserId(
	ctx: OAuthExtensionGrantHandlerInput["ctx"],
	id: string,
): boolean {
	const mode = ctx.context.options.advanced?.database?.generateId;
	if (mode === "serial") return /^\d+$/.test(id);
	if (mode === "uuid") return UUID.test(id);
	return true;
}

/**
 * Validates and resolves the `actor_token`. Like the subject token, it must be
 * an active access token this server issued, but to the requesting client
 * itself: a client may only name an actor whose token it holds as its own.
 */
async function resolveActor(
	{ ctx, provider }: OAuthExtensionGrantHandlerInput,
	actorToken: string,
	clientId: string,
): Promise<OAuthTokenExchangeActor> {
	const token = await validateExchangedToken(provider, actorToken, clientId);
	if (!token?.active || !token.exp || token.client_id !== clientId) {
		deny("actor_token is invalid");
	}
	// A delegated token names someone else's actors. As an actor token, its
	// chain would either be lost or let the client claim it acts as them.
	if (token.act !== undefined) {
		deny("actor_token must not be a delegated token");
	}
	// A client_credentials token has no user: its JWT carries the client as
	// `sub`, and its opaque form has no `sub` at introspection.
	const sub = typeof token.sub === "string" && token.sub ? token.sub : clientId;
	if (sub === clientId) {
		// The payload cannot tell a client token from a user token whose user id
		// equals the client id (`generateClientId` is configurable), so that
		// collision is rejected rather than guessed.
		if (
			couldBeUserId(ctx, clientId) &&
			(await ctx.context.internalAdapter.findUserById(clientId))
		) {
			deny("actor_token is invalid");
		}
		return { sub, token };
	}
	const user = await ctx.context.internalAdapter.findUserById(sub);
	if (!user) deny("actor_token is invalid");
	return { sub, user, token };
}

// The value each `may_act` member this server can evaluate must equal.
const MAY_ACT_MATCHERS: Record<
	string,
	(actor: OAuthTokenExchangeActor, issuer: string) => unknown
> = {
	sub: (actor) => actor.sub,
	client_id: (actor) => actor.token.client_id,
	iss: (_, issuer) => issuer,
};

/**
 * RFC 8693 §4.4: every `may_act` member must match the actor. A member this
 * server cannot evaluate fails closed.
 */
function mayActAllows(
	mayAct: unknown,
	actor: OAuthTokenExchangeActor | undefined,
	issuer: string,
): boolean {
	if (!actor || !isRecord(mayAct)) return false;
	const members = Object.entries(mayAct);
	// An empty `may_act`, for example from a member whose value was undefined
	// when the JWT was signed, names no one.
	if (members.length === 0) return false;
	return members.every(
		([member, value]) =>
			Object.hasOwn(MAY_ACT_MATCHERS, member) &&
			MAY_ACT_MATCHERS[member]!(actor, issuer) === value,
	);
}

/**
 * Adds `actorClaims` fields to the current actor's entry. Reserved names are
 * dropped with a warning, like reserved access-token claims.
 */
function withActorClaims(
	ctx: OAuthExtensionGrantHandlerInput["ctx"],
	act: OAuthActorClaim,
	extras: Record<string, unknown> | undefined,
): OAuthActorClaim {
	if (!isRecord(extras)) return act;
	const reserved = Object.keys(extras).filter((name) =>
		RESERVED_ACTOR_CLAIMS.has(name),
	);
	if (reserved.length > 0) {
		ctx.context.logger.warn(
			`oauthTokenExchange: ignored reserved actorClaims name(s): ${reserved.join(", ")}`,
		);
	}
	const safe = Object.fromEntries(
		Object.entries(extras).filter(([name]) => !RESERVED_ACTOR_CLAIMS.has(name)),
	);
	return { ...safe, ...act };
}

async function exchangeToken(
	input: OAuthExtensionGrantHandlerInput,
	options: OAuthTokenExchangeOptions,
	maxDepth: number,
): Promise<OAuthTokenResponse> {
	const { ctx, opts, provider } = input;
	const body = (ctx.body ?? {}) as Record<string, unknown>;
	const subjectToken = body.subject_token;
	if (typeof subjectToken !== "string" || !subjectToken) {
		deny("subject_token is required");
	}
	if (body.subject_token_type !== ACCESS_TOKEN_TYPE) {
		deny(`subject_token_type must be ${ACCESS_TOKEN_TYPE}`);
	}
	const actorToken = readActorToken(body);
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

	// Only clients registered for this grant, and public clients only when
	// enabled. A confidential client must still send its credentials.
	const { client, confirmation } = await provider.authenticateClient(
		options.publicClients === "dpop-bound"
			? { requireCredentials: false }
			: undefined,
	);
	// Without client authentication, a DPoP proof of the subject token's key is
	// what stops someone holding only a leaked token from exchanging it.
	const isPublicClient = client.tokenEndpointAuthMethod === "none";
	if (isPublicClient) {
		if (actorToken) deny("a public client cannot send actor_token");
		// Fail before any lookup: the proof is checked against the subject
		// token's key once that token is validated.
		if (!getDpopProofJwt(ctx)) {
			tokenError(
				"BAD_REQUEST",
				"invalid_dpop_proof",
				"DPoP proof header is required",
			);
		}
	}

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
	const subject = await validateExchangedToken(
		provider,
		subjectToken,
		client.clientId,
	);
	if (
		!subject?.active ||
		!subject.sub ||
		!subject.exp ||
		// A public client cannot prove it is the resource server in the token's
		// audience, so it may only exchange its own tokens.
		(isPublicClient && subject.client_id !== client.clientId)
	) {
		deny("subject_token is invalid");
	}
	if (isPublicClient && !getConfirmationJkt(subject.cnf)) {
		deny("a public client may only exchange a DPoP-bound subject_token");
	}
	const user = await ctx.context.internalAdapter.findUserById(subject.sub);
	if (!user) deny("subject_token does not represent a user");

	const subjectDepth = actorChainDepth(subject.act);
	if (subjectDepth === null) deny("subject_token is invalid");
	if (subjectDepth + (actorToken ? 1 : 0) > maxDepth) {
		deny("delegation exceeds the maximum depth");
	}
	const actor = actorToken
		? await resolveActor(input, actorToken, client.clientId)
		: undefined;
	if (actor?.user?.id === user.id) {
		deny("actor_token must not represent the subject token's user");
	}
	if (
		subject.may_act !== undefined &&
		!mayActAllows(
			subject.may_act,
			actor,
			(subject.iss as string | undefined) ?? ctx.context.baseURL,
		)
	) {
		deny("the actor is not permitted by the subject token's may_act");
	}
	// An exchange never drops the subject's actors: without an actor_token, the
	// issued token keeps the subject's chain unchanged.
	const subjectAct = subject.act as OAuthActorClaim | undefined;
	const act: OAuthActorClaim | undefined = actor
		? { sub: actor.sub, ...(subjectAct ? { act: subjectAct } : {}) }
		: subjectAct;

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
	const { effectiveScopes, dpopBoundAccessTokensRequired } =
		await resolveResourcePolicy(ctx, opts, {
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
	// A client exchanging its own sender-constrained token must prove the same
	// binding: the same DPoP key, as on refresh, or the same client-auth
	// confirmation, such as an mTLS certificate. A resource server cannot hold
	// that key, so it binds its own.
	const ownBinding =
		subject.client_id === client.clientId ? subject.cnf : undefined;
	const subjectJkt = getConfirmationJkt(ownBinding);
	// A DPoP binding is checked against the proof below, as `invalid_dpop_proof`.
	if (
		ownBinding != null &&
		subjectJkt === undefined &&
		!(isConfirmation(ownBinding) && sameConfirmation(confirmation, ownBinding))
	) {
		deny("client authentication does not match the subject_token binding");
	}
	// The actor token is always the client's own, so its binding must be proven
	// too.
	const actorJkt = getConfirmationJkt(actor?.token.cnf);
	if (subjectJkt && actorJkt && subjectJkt !== actorJkt) {
		tokenError(
			"BAD_REQUEST",
			"invalid_dpop_proof",
			"subject_token and actor_token are bound to different keys",
		);
	}
	if (
		actor?.token.cnf !== undefined &&
		!actorJkt &&
		!(
			isConfirmation(actor.token.cnf) &&
			sameConfirmation(confirmation, actor.token.cnf)
		)
	) {
		deny("actor_token is bound to a key the request does not prove");
	}
	const binding = await resolveIssuanceConfirmation(ctx, opts, {
		client,
		dpopBoundAccessTokensRequired,
		confirmation,
		expectedJkt: subjectJkt ?? actorJkt,
	});
	const request: OAuthTokenExchangeRequest = {
		client,
		user,
		subjectToken: subject,
		resources,
		scopes: effectiveScopes,
		referenceId,
		actor,
		act,
	};
	// Each hook gets its own copy, so nothing one changes reaches the other
	// hook or the issued token.
	if (
		options.allowExchange &&
		!(await options.allowExchange(structuredClone(request)))
	) {
		deny("token exchange denied by policy");
	}
	// `act` is always set when `actor` is.
	const issuedAct =
		actor && act && options.delegation?.actorClaims
			? withActorClaims(
					ctx,
					act,
					await options.delegation.actorClaims(
						structuredClone({ ...request, actor }),
					),
				)
			: act;
	// Delegated access ends when either the subject or the actor token expires.
	const maxExpiresAt = Math.min(subject.exp, actor?.token.exp ?? subject.exp);

	return provider.issueTokens({
		client,
		user,
		scopes: effectiveScopes,
		resources,
		referenceId,
		// Introspection reports the exchanged token inactive once the session ends.
		sessionId: typeof subject.sid === "string" ? subject.sid : undefined,
		maxExpiresAt: new Date(maxExpiresAt * 1000),
		confirmation: binding,
		act: issuedAct,
		tokenResponse: { issued_token_type: ACCESS_TOKEN_TYPE },
	});
}

/**
 * RFC 8693 token exchange for the OAuth Provider. A confidential client
 * registered for the token-exchange grant trades a user's access token, issued
 * by this server to it or for a resource it serves, for an access token to
 * another registered resource. The issued token represents the same user,
 * carries the requesting client as `client_id`, and expires no later than the
 * subject token.
 *
 * With `publicClients: "dpop-bound"`, a public client can also exchange its
 * own DPoP-bound token.
 *
 * Without an `actor_token`, the exchange is impersonation. With one, it is
 * delegation: the issued token names the actor in `act`, nesting any earlier
 * actors from the subject token, and honors the subject token's `may_act`.
 *
 * @example
 * ```ts
 * const auth = betterAuth({
 *   plugins: [jwt(), oauthProvider({ ... }), oauthTokenExchange()],
 * });
 * ```
 */
export function oauthTokenExchange(options: OAuthTokenExchangeOptions = {}) {
	const maxDepth = options.delegation?.maxDepth ?? 1;
	if (!Number.isInteger(maxDepth) || maxDepth < 0) {
		throw new BetterAuthError(
			"oauthTokenExchange: delegation.maxDepth must be a non-negative integer",
		);
	}
	const extension = {
		grants: {
			[TOKEN_EXCHANGE_GRANT_TYPE]: (input: OAuthExtensionGrantHandlerInput) =>
				exchangeToken(input, options, maxDepth),
		},
	};
	return {
		id: "oauth-token-exchange",
		init(ctx: AuthContext) {
			extendOAuthProvider(ctx, extension);
		},
	};
}
