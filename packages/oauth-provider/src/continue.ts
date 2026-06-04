import type { GenericEndpointContext } from "@better-auth/core";
import { APIError } from "better-auth/api";
import { authorizeEndpointWithHooks } from "./authorize";
import { oAuthState } from "./oauth";
import type { OAuthOptions, Scope } from "./types";
import { removePromptFromQuery, searchParamsToQuery } from "./utils";

export async function continueEndpoint(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
) {
	// Continue login flow (ensure it's strictly boolean true)
	if (ctx.body.selected === true) {
		return await selected(ctx, opts);
	} else if (ctx.body.created === true) {
		return await created(ctx, opts);
	} else if (ctx.body.postLogin === true) {
		return await postLogin(ctx, opts);
	} else {
		throw new APIError("BAD_REQUEST", {
			error_description: "Missing parameters",
			error: "invalid_request",
		});
	}
}

async function selected(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
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
	return await authorizeEndpointWithHooks(ctx, opts);
}

async function created(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
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
	return await authorizeEndpointWithHooks(ctx, opts);
}

async function postLogin(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
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
	ctx.query = searchParamsToQuery(query);
	return await authorizeEndpointWithHooks(ctx, opts, {
		postLogin: true,
	});
}
