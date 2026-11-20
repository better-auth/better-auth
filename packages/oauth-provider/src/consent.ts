import type { GenericEndpointContext } from "@better-auth/core";
import { APIError, getSessionFromCtx } from "better-auth/api";
import {
	formatErrorURL,
	getAPIErrorURL,
	getErrorURL,
	getIssuer,
	resolveTrustedRedirectUri,
} from "./authorize";
import {
	filterClaimsRequestUserInfoClaims,
	getRequestedUserInfoClaims,
} from "./claims-request";
import type { AuthorizeEndpointCaller } from "./continue";
import { getExtensionInteractionRequest } from "./extensions";
import { oAuthState } from "./oauth";
import { getSupportedClaims } from "./standard-claims";
import type { OAuthConsent, OAuthOptions, Scope } from "./types";
import {
	getConsentReferenceId,
	isSessionFreshForSignedQuery,
	parsePrompt,
	removeMaxAgeFromQuery,
	removePromptFromQuery,
	searchParamsToQuery,
	updateConsent,
} from "./utils";

export async function consentEndpoint<Result>(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	authorize: AuthorizeEndpointCaller<Result>,
) {
	// Obtain oauth query
	const oauthRequest = await oAuthState.get();
	const _query = oauthRequest?.query as string | undefined;
	if (!_query) {
		throw new APIError("BAD_REQUEST", {
			error_description: "missing oauth query",
			error: "invalid_request",
		});
	}
	const query = new URLSearchParams(_query);
	const originalRequestedScopes =
		query
			.get("scope")
			?.split(" ")
			.filter((scope) => scope) ?? [];
	const supportedClaims = getSupportedClaims(opts);
	const originalRequestedUserInfoClaims = getRequestedUserInfoClaims(
		query.get("claims"),
		supportedClaims,
	);
	const clientId = query.get("client_id");
	if (!clientId) {
		throw new APIError("BAD_REQUEST", {
			error_description: "client_id is required",
			error: "invalid_client",
		});
	}

	// Check scopes if received (can only be equal or lesser than originally requested scopes)
	const requestedScopes = (ctx.body.scope as string | undefined)
		?.split(" ")
		.filter((scope) => scope);
	if (requestedScopes) {
		if (!requestedScopes.every((sc) => originalRequestedScopes?.includes(sc))) {
			throw new APIError("BAD_REQUEST", {
				error_description: "Scope not originally requested",
				error: "invalid_request",
			});
		}
	}
	const acceptedClaims = ctx.body.claims as unknown | undefined;
	const acceptedUserInfoClaims =
		acceptedClaims !== undefined
			? getRequestedUserInfoClaims(acceptedClaims, supportedClaims)
			: originalRequestedUserInfoClaims;
	if (
		acceptedClaims !== undefined &&
		!acceptedUserInfoClaims.every((claim) =>
			originalRequestedUserInfoClaims.includes(claim),
		)
	) {
		throw new APIError("BAD_REQUEST", {
			error_description: "Claim not originally requested",
			error: "invalid_request",
		});
	}

	const session = await getSessionFromCtx(ctx);
	// Consent not accepted (ensure it's strictly boolean true)
	const accepted = ctx.body.accept === true;
	if (!accepted) {
		const interaction = getExtensionInteractionRequest(
			opts,
			searchParamsToQuery(query),
		);
		if (interaction) {
			return {
				redirect: true,
				url: await interaction.handler
					.deny({ ctx, value: interaction.value, userId: session?.user.id! })
					.catch((error) =>
						getAPIErrorURL(
							ctx,
							error,
							interaction.handler.errorPage?.({
								ctx,
								value: interaction.value,
							}),
						),
					),
			};
		}
		const redirectUri = await resolveTrustedRedirectUri(
			ctx,
			opts,
			clientId,
			query.get("redirect_uri") ?? undefined,
		);
		return {
			redirect: true,
			url: redirectUri
				? formatErrorURL(
						redirectUri,
						"access_denied",
						"User denied access",
						query.get("state") ?? undefined,
						getIssuer(ctx, opts),
					)
				: getErrorURL(ctx, "access_denied", "User denied access"),
		};
	}

	// Consent accepted
	const chosenReferenceId = ctx.body.reference_id as string | undefined;
	// Without the callback to verify it, a chosen reference would be dropped
	// and the consent stored without one.
	if (chosenReferenceId !== undefined && !opts.postLogin?.consentReferenceId) {
		throw new APIError("BAD_REQUEST", {
			error_description: "reference_id requires postLogin.consentReferenceId",
			error: "invalid_request",
		});
	}
	const promptSet = parsePrompt(query.get("prompt") ?? "");
	const hasLoginPrompt = promptSet.has("login");
	const hasSatisfiedLoginPrompt =
		hasLoginPrompt &&
		isSessionFreshForSignedQuery(
			session?.session.createdAt,
			oauthRequest?.signedQueryIssuedAt,
		);
	if (hasLoginPrompt && !hasSatisfiedLoginPrompt) {
		ctx?.headers?.set("accept", "application/json");
		ctx.query = searchParamsToQuery(query);
		return await authorize(ctx);
	}

	const approvedScopes = requestedScopes ?? originalRequestedScopes;
	const referenceId = await getConsentReferenceId(opts, {
		user: session?.user!,
		session: session?.session!,
		scopes: approvedScopes,
		query: new URLSearchParams(query),
		consent: { referenceId: chosenReferenceId },
	});
	await storeConsentApproval(
		ctx,
		{ clientId, userId: session?.user.id!, referenceId },
		{
			offeredScopes: originalRequestedScopes,
			scopes: approvedScopes,
			offeredUserInfoClaims: originalRequestedUserInfoClaims,
			userInfoClaims: acceptedUserInfoClaims,
			resources: query.getAll("resource"),
		},
	);

	// Return authorization code
	if (requestedScopes) {
		query.set("scope", approvedScopes.join(" "));
	}
	if (acceptedClaims !== undefined) {
		const claimsRequest = filterClaimsRequestUserInfoClaims(
			query.get("claims"),
			acceptedUserInfoClaims,
		);
		if (claimsRequest) {
			query.set("claims", JSON.stringify(claimsRequest));
		} else {
			query.delete("claims");
		}
	}
	ctx?.headers?.set("accept", "application/json");
	let authorizationQuery = removePromptFromQuery(query, "consent");
	if (hasSatisfiedLoginPrompt) {
		authorizationQuery = removePromptFromQuery(authorizationQuery, "login");
		authorizationQuery = removeMaxAgeFromQuery(authorizationQuery);
	}
	ctx.query = searchParamsToQuery(authorizationQuery);
	const postLoginClearedForThisSession =
		oauthRequest?.postLoginClearedForSession !== undefined &&
		oauthRequest.postLoginClearedForSession === session?.session.id;
	return await authorize(ctx, {
		postLogin: postLoginClearedForThisSession,
		acceptedConsent: { referenceId },
	});
}

/**
 * Stores an approval from the consent page. A stored consent is what the user
 * approved for the client under one reference and did not take back, so the
 * approval adds what it approved and removes only what the page offered and
 * the user declined. The page cannot decline a resource, so resources only
 * grow. A client cannot shrink the consent by asking for less.
 */
async function storeConsentApproval(
	ctx: GenericEndpointContext,
	key: { clientId: string; userId: string; referenceId: string | undefined },
	approval: {
		offeredScopes: readonly string[];
		scopes: readonly string[];
		offeredUserInfoClaims: readonly string[];
		userInfoClaims: readonly string[];
		resources: readonly string[];
	},
) {
	const decide = (
		stored: readonly string[] | undefined,
		offered: readonly string[],
		approved: readonly string[],
	) => [
		...new Set([
			...(stored ?? []).filter(
				(value) => !offered.includes(value) || approved.includes(value),
			),
			...approved,
		]),
	];
	const updated = await updateConsent(ctx, key, (consent) => ({
		scopes: decide(consent.scopes, approval.offeredScopes, approval.scopes),
		requestedUserInfoClaims: decide(
			consent.requestedUserInfoClaims,
			approval.offeredUserInfoClaims,
			approval.userInfoClaims,
		),
		resources: [
			...new Set([...(consent.resources ?? []), ...approval.resources]),
		],
	}));
	if (updated) return;
	// Two first approvals at the same moment can each create a row. Reads
	// merge them, and the next write keeps only the oldest.
	const now = new Date(Math.floor(Date.now() / 1000) * 1000);
	await ctx.context.adapter.create<Omit<OAuthConsent<Scope[]>, "id">>({
		model: "oauthConsent",
		data: {
			...key,
			scopes: [...approval.scopes],
			requestedUserInfoClaims: [...approval.userInfoClaims],
			resources: approval.resources.length
				? [...approval.resources]
				: undefined,
			createdAt: now,
			updatedAt: now,
		},
	});
}
