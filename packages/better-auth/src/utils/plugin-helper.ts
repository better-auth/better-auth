import { APIError } from "better-call";
import type { HookEndpointContext } from "../types";

export const getEndpointResponse = async <T>(ctx: {
	context: {
		returned?: unknown;
	};
}) => {
	const returned = ctx.context.returned;
	if (!returned) {
		return null;
	}
	if (returned instanceof Response) {
		if (returned.status !== 200) {
			return null;
		}
		return (await returned.clone().json()) as T;
	}
	if (returned instanceof APIError) {
		return null;
	}
	return returned as T;
};

export const returnHookResponse = (
	ctx: {
		context: {
			returned?: unknown;
		};
		responseHeader: Headers;
	},
	json?: Record<string, unknown>,
) => {
	const returned = ctx.context.returned;
	if (returned instanceof Response) {
		const response = new Response(JSON.stringify(json), {
			...returned,
			headers: ctx.responseHeader,
			status: returned.status,
		});
		return {
			response,
		};
	}
	return {
		response: json,
		responseHeader: ctx.responseHeader,
	};
};
