import type { GenericEndpointContext } from "@better-auth/core";
import type {
	OAuthProviderApi,
	SchemaClient,
	Scope,
} from "@better-auth/oauth-provider";
import { getOAuthProviderApi } from "@better-auth/oauth-provider";
import {
	createOAuthEndpoint,
	parseClientMetadata,
} from "@better-auth/oauth-provider/internal";
import { isAPIError } from "better-auth/api";
import { deriveDpopJkt } from "better-auth/oauth2";
import type { JWK } from "jose";
import { decodeProtectedHeader } from "jose";
import * as z from "zod";
import type { AuthSessionRecord } from "./auth-session";
import {
	findAuthSession,
	findLiveSession,
	revokeAuthSession,
	saveAuthSession,
	toStrategyView,
} from "./auth-session";
import { budgetKey, isBudgetSpent, recordFailure } from "./budget";
import { AUTHORIZE_CHALLENGE_PATH, FIRST_PARTY_APP_FIELD } from "./constants";
import { challengeError, FIRST_PARTY_APPS_ERROR_CODES } from "./error-codes";
import type {
	FirstPartyAuthResult,
	FirstPartyAuthStrategy,
	ResolvedFirstPartyAppsOptions,
} from "./types";

/** Client authentication methods whose credentials can be presented twice. */
const REPEATABLE_AUTH_METHODS = new Set([
	"none",
	"client_secret_basic",
	"client_secret_post",
]);

/** Parameters of the challenge protocol itself, never part of the request. */
const PROTOCOL_PARAMS = [
	"auth_session",
	"client_secret",
	"client_assertion",
	"client_assertion_type",
];

/**
 * Errors of `issueAuthorizationCode` that mean the user must interact in a
 * browser, which this endpoint answers with `redirect_to_web` (§5.2.2.1.1).
 */
const BROWSER_ERRORS = new Set([
	"login_required",
	"interaction_required",
	"consent_required",
	"account_selection_required",
]);

function stringParam(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Whether `client` opted in to first-party sign-in. The field is read from
 * `metadata` and is not a registration field, so neither dynamic registration
 * nor a client metadata document can assert it (draft §5, §9.1).
 */
export function isFirstPartyApp(client: SchemaClient<Scope[]>): boolean {
	return parseClientMetadata(client.metadata)?.[FIRST_PARTY_APP_FIELD] === true;
}

function assertFirstPartyApp(client: SchemaClient<Scope[]> | null) {
	if (!client || client.disabled) {
		challengeError(
			"invalid_client",
			FIRST_PARTY_APPS_ERROR_CODES.UNKNOWN_CLIENT.message,
		);
	}
	if (!isFirstPartyApp(client)) {
		challengeError(
			"unauthorized_client",
			FIRST_PARTY_APPS_ERROR_CODES.NOT_FIRST_PARTY.message,
		);
	}
	// issueAuthorizationCode answers consent_required without it, after the
	// user already entered credentials.
	if (!client.skipConsent) {
		challengeError(
			"unauthorized_client",
			FIRST_PARTY_APPS_ERROR_CODES.FIRST_PARTY_REQUIRES_SKIP_CONSENT.message,
		);
	}
	// issueAuthorizationCode authenticates the client again on the final
	// request, which a single-use assertion cannot survive.
	if (!REPEATABLE_AUTH_METHODS.has(client.tokenEndpointAuthMethod ?? "none")) {
		challengeError(
			"unauthorized_client",
			FIRST_PARTY_APPS_ERROR_CODES.UNSUPPORTED_CLIENT_AUTHENTICATION.message,
		);
	}
	return client;
}

/** The jkt of this request's DPoP proof, after a provider call verified it. */
async function proofJkt(ctx: GenericEndpointContext) {
	const proof = ctx.headers?.get("dpop");
	if (!proof) return undefined;
	const { jwk } = decodeProtectedHeader(proof);
	return jwk ? deriveDpopJkt(jwk as JWK) : undefined;
}

export function createAuthorizeChallenge(
	options: ResolvedFirstPartyAppsOptions,
) {
	return createOAuthEndpoint(
		AUTHORIZE_CHALLENGE_PATH,
		{
			method: "POST",
			// Strategies define their own parameters, so the body stays open.
			body: z.looseObject({
				auth_session: z.string().optional(),
				client_id: z.string().optional(),
			}),
			// Repeated parameters are rejected (RFC 6749 §3.2) except `resource`.
			formParams: { repeatable: ["resource"] },
			metadata: {
				noStore: true,
				// §4.1 requires form encoding for the first request; §5.3 lets
				// later requests use JSON.
				allowedMediaTypes: [
					"application/x-www-form-urlencoded",
					"application/json",
				],
				openapi: {
					description:
						"Authorization challenge endpoint (draft-ietf-oauth-first-party-apps)",
					responses: {
						"200": {
							description: "The user signed in",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											authorization_code: { type: "string" },
										},
										required: ["authorization_code"],
									},
								},
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			// init() fails without oauthProvider(), so the plugin is present.
			const oauthOptions = ctx.context.getPlugin("oauth-provider")!.options;
			const provider = getOAuthProviderApi(
				ctx,
				oauthOptions,
				"authorization_code",
			);
			// Before anything single-use, so the client can retry with a nonce.
			await provider.challengeDpopNonce();
			const params = ctx.body as Record<string, unknown>;
			const handle = stringParam(params.auth_session);
			const flow = handle
				? await resumeFlow(ctx, provider, handle)
				: await startFlow(ctx, provider, options, params);
			return runRound(ctx, provider, options, flow, params);
		},
	);
}

interface Flow {
	client: SchemaClient<Scope[]>;
	record: AuthSessionRecord;
	/** The handle the client sent, kept unless the record is rotated. */
	handle?: string;
}

/** The first request: no `auth_session` yet (§5.1). */
async function startFlow(
	ctx: GenericEndpointContext,
	provider: OAuthProviderApi,
	options: ResolvedFirstPartyAppsOptions,
	params: Record<string, unknown>,
): Promise<Flow> {
	const contentType = ctx.request?.headers.get("content-type") ?? "";
	if (
		ctx.request &&
		!contentType.toLowerCase().startsWith("application/x-www-form-urlencoded")
	) {
		challengeError(
			"invalid_request",
			FIRST_PARTY_APPS_ERROR_CODES.FIRST_REQUEST_FORM_ENCODED.message,
		);
	}
	const clientId = stringParam(params.client_id);
	if (!clientId) {
		challengeError(
			"invalid_request",
			FIRST_PARTY_APPS_ERROR_CODES.CLIENT_ID_REQUIRED.message,
		);
	}
	// First-partyness and client authentication come before any credential
	// is looked at (§5, §4.1).
	const client = assertFirstPartyApp(await provider.getClient(clientId));
	await provider.authenticateClient({ clientId, requireCredentials: false });
	const validated = await provider.validateAuthorizationRequest({
		query: authorizationParams(options, params),
	});
	return {
		client,
		record: {
			clientId,
			ownsSession: false,
			state: "pending",
			query: validated.query,
			amr: [],
			failures: 0,
			expiresAt: new Date(Date.now() + options.authSession.expiresIn * 1000),
		},
	};
}

/** A later request, carrying the `auth_session` an earlier one returned. */
async function resumeFlow(
	ctx: GenericEndpointContext,
	provider: OAuthProviderApi,
	handle: string,
): Promise<Flow> {
	const record = await findAuthSession(ctx, handle);
	if (!record || record.expiresAt.getTime() <= Date.now()) {
		if (record) await revokeAuthSession(ctx, record);
		challengeError(
			"invalid_session",
			FIRST_PARTY_APPS_ERROR_CODES.INVALID_SESSION.message,
		);
	}
	const client = assertFirstPartyApp(await provider.getClient(record.clientId));
	// A client_id or credentials for another client fail (§5.1).
	await provider.authenticateClient({
		clientId: record.clientId,
		requireCredentials: false,
	});
	// C2: a handle backed by a session is only as alive as that session.
	if (record.sessionId && !(await findLiveSession(ctx, record.sessionId))) {
		await revokeAuthSession(ctx, record);
		challengeError(
			"invalid_session",
			FIRST_PARTY_APPS_ERROR_CODES.INVALID_SESSION.message,
		);
	}
	// §9.6.1: a bound handle needs a proof on every request. The proof itself
	// is verified before any response that depends on the credentials.
	if (record.dpopJkt && !ctx.headers?.get("dpop")) {
		challengeError(
			"invalid_dpop_proof",
			FIRST_PARTY_APPS_ERROR_CODES.DPOP_PROOF_REQUIRED.message,
		);
	}
	return { client, record, handle };
}

/**
 * Verifies the request's DPoP proof on a request that issues no code, and
 * binds a new record to its key. A request that issues a code leaves this to
 * `issueAuthorizationCode`, which rejects a second verification of the same
 * proof.
 */
async function verifyProof(
	provider: OAuthProviderApi,
	record: AuthSessionRecord,
) {
	if (record.dpopJkt) {
		await provider.verifyDpopProof({ expectedJkt: record.dpopJkt });
		return;
	}
	const proof = await provider.verifyDpopProof();
	if (proof && !record.id) record.dpopJkt = proof.jkt;
}

async function runRound(
	ctx: GenericEndpointContext,
	provider: OAuthProviderApi,
	options: ResolvedFirstPartyAppsOptions,
	flow: Flow,
	params: Record<string, unknown>,
) {
	const { record, client } = flow;
	if (record.state === "authenticated") {
		// The handle restores a live sign-in, like a browser cookie (§5.3.1),
		// for a new authorization request.
		record.query = await validateFollowUpRequest(
			provider,
			options,
			record,
			params,
		);
		const live = await findLiveSession(ctx, record.sessionId!);
		return issueCode(ctx, provider, flow, live!, record.amr, false);
	}
	if (options.budget.client) {
		const key = await budgetKey(ctx, { clientId: client.clientId });
		if (await isBudgetSpent(ctx, key, options.budget.client)) {
			await verifyProof(provider, record);
			return redirectToWeb(ctx, record);
		}
	}
	if (record.state === "step_up" && !record.challenge) {
		// C3: without a strategy that steps up in the app, the browser does.
		const stepUpStrategy = options.strategies.find((s) => s.stepUp);
		if (!stepUpStrategy?.stepUp) {
			await verifyProof(provider, record);
			return redirectToWeb(ctx, record);
		}
		const result = await stepUpStrategy.stepUp({
			ctx,
			client,
			authSession: toStrategyView(record),
			params,
		});
		if ("error" in result && result.error === "redirect_to_web") {
			await verifyProof(provider, record);
			return redirectToWeb(ctx, record);
		}
		// The code a native step-up ends with answers this new request.
		record.query = await validateFollowUpRequest(
			provider,
			options,
			record,
			params,
		);
		return handleResult(ctx, provider, options, flow, stepUpStrategy, result);
	}
	const strategy = selectStrategy(options.strategies, record, params);
	if (!strategy) {
		await verifyProof(provider, record);
		const handle = await saveAuthSession(ctx, record, { rotate: false });
		return challengeError(
			"insufficient_authorization",
			FIRST_PARTY_APPS_ERROR_CODES.CREDENTIALS_REQUIRED.message,
			{ auth_session: handle ?? flow.handle },
		);
	}
	const result = await strategy.authenticate({
		ctx,
		client,
		authSession: toStrategyView(record),
		params,
	});
	return handleResult(ctx, provider, options, flow, strategy, result);
}

/** The authorization request parameters of `params`, without credentials. */
function authorizationParams(
	options: ResolvedFirstPartyAppsOptions,
	params: Record<string, unknown>,
) {
	return Object.fromEntries(
		Object.entries(params).filter(
			([name]) =>
				!PROTOCOL_PARAMS.includes(name) &&
				!options.strategies.some((strategy) => strategy.params.includes(name)),
		),
	);
}

/**
 * Validates the new authorization request a restored or step-up handle
 * carries, for the handle's client.
 */
async function validateFollowUpRequest(
	provider: OAuthProviderApi,
	options: ResolvedFirstPartyAppsOptions,
	record: AuthSessionRecord,
	params: Record<string, unknown>,
) {
	const validated = await provider.validateAuthorizationRequest({
		query: {
			...authorizationParams(options, params),
			client_id: record.clientId,
		},
	});
	return validated.query;
}

function selectStrategy(
	strategies: FirstPartyAuthStrategy[],
	record: AuthSessionRecord,
	params: Record<string, unknown>,
) {
	if (record.challenge) {
		return strategies.find((s) => s.id === record.challenge!.strategy);
	}
	return strategies.find((s) =>
		s.params.some((name) => params[name] !== undefined),
	);
}

async function handleResult(
	ctx: GenericEndpointContext,
	provider: OAuthProviderApi,
	options: ResolvedFirstPartyAppsOptions,
	flow: Flow,
	strategy: FirstPartyAuthStrategy,
	result: FirstPartyAuthResult,
) {
	const { record } = flow;
	// The failure budget is per method: the strategy's first round, or the
	// challenge it answered with.
	const method = record.challenge?.type ?? strategy.id;
	const accountUserId =
		"user" in result && result.user ? result.user.id : record.userId;
	// C1: a spent account answers as if the credentials were wrong.
	const locked =
		accountUserId &&
		!("error" in result && result.error !== "insufficient_authorization") &&
		(await isBudgetSpent(
			ctx,
			await budgetKey(ctx, { userId: accountUserId, method }),
			options.budget.account,
		));
	if (locked) {
		return failRound(ctx, provider, options, flow, null);
	}
	if (!("error" in result)) {
		return completeSignIn(ctx, provider, options, flow, result.user, [
			...record.amr,
			...result.amr,
		]);
	}
	switch (result.error) {
		case "insufficient_authorization": {
			await verifyProof(provider, record);
			record.challenge = {
				strategy: strategy.id,
				type: result.challengeType,
				state: result.state,
			};
			if (result.user) record.userId = result.user.id;
			if (result.amr) record.amr = [...record.amr, ...result.amr];
			const handle = await saveAuthSession(ctx, record, { rotate: false });
			return challengeError(
				"insufficient_authorization",
				FIRST_PARTY_APPS_ERROR_CODES.CREDENTIALS_REQUIRED.message,
				{
					...result.fields,
					auth_session: handle ?? flow.handle,
					challenge_type: result.challengeType,
				},
			);
		}
		case "authentication_failed": {
			const subject = result.userId
				? { userId: result.userId, method }
				: result.identifier
					? { identifier: result.identifier, method }
					: undefined;
			return failRound(ctx, provider, options, flow, subject ?? null);
		}
		default: {
			await verifyProof(provider, record);
			return redirectToWeb(ctx, record);
		}
	}
}

async function failRound(
	ctx: GenericEndpointContext,
	provider: OAuthProviderApi,
	options: ResolvedFirstPartyAppsOptions,
	flow: Flow,
	subject:
		| { userId: string; method: string }
		| { identifier: string; method: string }
		| null,
) {
	const { record, client } = flow;
	// A request with a bad proof learns nothing and spends nothing.
	await verifyProof(provider, record);
	if (subject) {
		await recordFailure(
			ctx,
			await budgetKey(ctx, subject),
			options.budget.account,
		);
	}
	if (options.budget.client) {
		await recordFailure(
			ctx,
			await budgetKey(ctx, { clientId: client.clientId }),
			options.budget.client,
		);
	}
	record.failures += 1;
	if (record.failures >= options.authSession.maxFailures) {
		return redirectToWeb(ctx, record);
	}
	const handle = await saveAuthSession(ctx, record, { rotate: false });
	return challengeError(
		"authentication_failed",
		FIRST_PARTY_APPS_ERROR_CODES.AUTHENTICATION_FAILED.message,
		{ auth_session: handle ?? flow.handle },
	);
}

/**
 * Sends the user to the browser and revokes the handle (§5.2.2.1.1). A
 * step-up carries what the new sign-in must satisfy (C3).
 */
async function redirectToWeb(
	ctx: GenericEndpointContext,
	record: AuthSessionRecord,
): Promise<never> {
	await revokeAuthSession(ctx, record);
	return challengeError(
		"redirect_to_web",
		FIRST_PARTY_APPS_ERROR_CODES.REDIRECT_TO_WEB.message,
		record.state === "step_up"
			? {
					...(record.acrValues ? { acr_values: record.acrValues } : {}),
					max_age: 0,
				}
			: {},
	);
}

async function completeSignIn(
	ctx: GenericEndpointContext,
	provider: OAuthProviderApi,
	options: ResolvedFirstPartyAppsOptions,
	flow: Flow,
	user: { id: string },
	amr: string[],
) {
	const { record } = flow;
	if (record.userId && record.userId !== user.id) {
		// A later round signed in someone other than the user an earlier round
		// identified.
		return failRound(ctx, provider, options, flow, null);
	}
	// C4: a step-up reuses the grant's session.
	if (record.state === "step_up" && record.sessionId) {
		const live = await findLiveSession(ctx, record.sessionId);
		return issueCode(ctx, provider, flow, live!, amr, false);
	}
	const session = await ctx.context.internalAdapter.createSession(user.id);
	const fullUser = await ctx.context.internalAdapter.findUserById(user.id);
	return issueCode(
		ctx,
		provider,
		flow,
		{ session, user: fullUser! },
		amr,
		true,
	);
}

async function issueCode(
	ctx: GenericEndpointContext,
	provider: OAuthProviderApi,
	flow: Flow,
	session: NonNullable<Awaited<ReturnType<typeof findLiveSession>>>,
	amr: string[],
	createdSession: boolean,
) {
	const { record } = flow;
	let code: string;
	try {
		({ code } = await provider.issueAuthorizationCode({
			query: {
				...record.query,
				...(record.dpopJkt ? { dpop_jkt: record.dpopJkt } : {}),
			},
			session,
			amr,
		}));
	} catch (error) {
		if (createdSession) {
			await ctx.context.internalAdapter.deleteSession(session.session.token);
		}
		const code = isAPIError(error)
			? (error.body as { error?: string } | undefined)?.error
			: undefined;
		if (code && BROWSER_ERRORS.has(code)) {
			// A restored handle stays usable; its session is the user's own.
			if (record.state !== "authenticated") {
				await revokeAuthSession(ctx, { ...record, ownsSession: false });
			}
			return challengeError(
				"redirect_to_web",
				FIRST_PARTY_APPS_ERROR_CODES.REDIRECT_TO_WEB.message,
			);
		}
		throw error;
	}
	if (record.state === "step_up") {
		// The grant's own handle, if any, is returned again by the token
		// endpoint; this one has done its job.
		await revokeAuthSession(ctx, record);
		return ctx.json({ authorization_code: code });
	}
	// The proof was verified while issuing, so its key is the code's key.
	record.dpopJkt ??= await proofJkt(ctx);
	record.sessionId = session.session.id;
	record.ownsSession = createdSession || record.ownsSession;
	record.userId = session.user.id;
	record.state = "authenticated";
	record.amr = amr;
	record.challenge = undefined;
	record.failures = 0;
	record.expiresAt = new Date(session.session.expiresAt);
	// The handle is returned by the token endpoint (§6.1), not here.
	await saveAuthSession(ctx, record, { rotate: true });
	return ctx.json({ authorization_code: code });
}
