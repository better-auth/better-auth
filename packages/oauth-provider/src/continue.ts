import type { GenericEndpointContext } from "@better-auth/core";
import { APIError } from "better-auth/api";
import { authorizeEndpoint } from "./authorize.js";
import { oAuthState } from "./oauth.js";
import type { OAuthOptions, Scope } from "./types/index.js";
import { deleteFromPrompt, searchParamsToQuery } from "./utils/index.js";

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
	ctx.query = deleteFromPrompt(query, "select_account");
	const { url } = await authorizeEndpoint(ctx, opts);
	return {
		redirect: true,
		url,
	};
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
	ctx.query = deleteFromPrompt(query, "create");
	const { url } = await authorizeEndpoint(ctx, opts);
	return {
		redirect: true,
		url,
	};
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
	const { url } = await authorizeEndpoint(ctx, opts, {
		postLogin: true,
	});
	return {
		redirect: true,
		url,
	};
}
