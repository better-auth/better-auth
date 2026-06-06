import type { GenericEndpointContext } from "@better-auth/core";
import { APIError } from "better-auth/api";
import type { AuthorizeEndpointSettings } from "./authorize";
import { oAuthState } from "./oauth";
import { removePromptFromQuery, searchParamsToQuery } from "./utils";

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
	return await authorize(ctx, {
		postLogin: true,
	});
}
