import type { GenericEndpointContext } from "@better-auth/core";
import { APIError, getSessionFromCtx } from "better-auth/api";
import type { AuthorizeEndpointSettings } from "./authorize";
import { oAuthState } from "./oauth";
import { removePromptFromQuery, searchParamsToQuery } from "./utils";

/**
 * Re-enters `/oauth2/authorize` through the hook pipeline. Injected so the
 * resume paths dispatch the endpoint (running configured hooks) instead of
 * calling the raw `authorizeEndpoint` function, which would skip them.
 */
export type AuthorizeEndpointCaller<Result = unknown> = (
	ctx: GenericEndpointContext,
	settings?: AuthorizeEndpointSettings,
) => Promise<Result>;

export async function continueEndpoint<Result>(
	ctx: GenericEndpointContext,
	authorize: AuthorizeEndpointCaller<Result>,
) {
	// Continue login flow (ensure it's strictly boolean true)
	if (ctx.body.selected === true) {
		return await selected(ctx, authorize);
	} else if (ctx.body.created === true) {
		return await created(ctx, authorize);
	} else if (ctx.body.postLogin === true) {
		return await postLogin(ctx, authorize);
	} else {
		throw new APIError("BAD_REQUEST", {
			error_description: "Missing parameters",
			error: "invalid_request",
		});
	}
}

async function selected<Result>(
	ctx: GenericEndpointContext,
	authorize: AuthorizeEndpointCaller<Result>,
) {
	const _query = (await oAuthState.get())?.query as string | undefined;
	if (!_query) {
		throw new APIError("BAD_REQUEST", {
			error_description: "missing oauth query",
			error: "invalid_request",
		});
	}
	ctx.headers?.set("accept", "application/json");
	const query = new URLSearchParams(_query);
	ctx.query = searchParamsToQuery(
		removePromptFromQuery(query, "select_account"),
	);
	return await authorize(ctx);
}

async function created<Result>(
	ctx: GenericEndpointContext,
	authorize: AuthorizeEndpointCaller<Result>,
) {
	const _query = (await oAuthState.get())?.query as string | undefined;
	if (!_query) {
		throw new APIError("BAD_REQUEST", {
			error_description: "missing oauth query",
			error: "invalid_request",
		});
	}
	const query = new URLSearchParams(_query);
	ctx.headers?.set("accept", "application/json");
	ctx.query = searchParamsToQuery(removePromptFromQuery(query, "create"));
	return await authorize(ctx);
}

async function postLogin<Result>(
	ctx: GenericEndpointContext,
	authorize: AuthorizeEndpointCaller<Result>,
) {
	const state = await oAuthState.get();
	const _query = state?.query as string | undefined;
	if (!_query) {
		throw new APIError("BAD_REQUEST", {
			error_description: "missing oauth query",
			error: "invalid_request",
		});
	}
	const query = new URLSearchParams(_query);
	ctx.headers?.set("accept", "application/json");
	ctx.query = searchParamsToQuery(query);
	// The client-submitted `postLogin: true` only selects this continuation
	// branch — it is NOT proof that the post-login gate (e.g. org/team
	// selection) actually completed. Trust only a server-issued, session-bound
	// marker carried by the signed oauth_query (mirrors the consent endpoint).
	// When that marker is absent (it is only minted at the consent redirect),
	// `authorize` re-runs `opts.postLogin.shouldRedirect` against the live
	// session and redirects back to the gate if selection is still required.
	const session = await getSessionFromCtx(ctx);
	const postLoginCleared =
		state?.postLoginClearedForSession !== undefined &&
		state.postLoginClearedForSession === session?.session.id;
	return await authorize(ctx, {
		postLogin: postLoginCleared,
	});
}
