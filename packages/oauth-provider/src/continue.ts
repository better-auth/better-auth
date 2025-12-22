import type { GenericEndpointContext } from "@better-auth/core";
import { APIError } from "better-auth/api";
import { authorizeEndpoint } from "./authorize";
import { oAuthState } from "./oauth";
import type { OAuthOptions, Scope } from "./types";
import { deleteFromPrompt } from "./utils";

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
		uri: url,
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
	ctx.query = deleteFromPrompt(query, "create");
	const { url } = await authorizeEndpoint(ctx, opts);
	return {
		redirect: true,
		uri: url,
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
	ctx.query = Object.fromEntries(query);
	const { url } = await authorizeEndpoint(ctx, opts, {
		postLogin: true,
	});
	return {
		redirect: true,
		uri: url,
	};
}
