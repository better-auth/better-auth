import type { IncomingMessage } from "node:http";
import { getActions } from "./actions";
import { createInternalAdapter } from "./adapters";
import { getSelectFields, toInternalFields } from "./adapters/utils";
import { type CookieManager, cookieManager } from "./cookies";
import { getCookies } from "./cookies/cookies";
import type { BetterAuthOptions } from "./options";
import type { BetterAuthPlugin } from "./plugins";
import { getPlugins } from "./plugins/utils";
import { router } from "./routes";
import type { Context, InternalResponse } from "./routes/types";
import {
	getBody,
	isValidHttpMethod,
	parseUrl,
	toRequestHeader,
} from "./utils/request";
import { getSecret } from "./utils/secret";
import { timeSpan } from "./utils/time";
import type { UnionToIntersection } from "./utils/types";

export interface HandlerOptions<R = any> {
	cookieManager?: CookieManager;
	toResponse?: (res: InternalResponse, context: Context) => R;
}

export const betterAuth = <O extends BetterAuthOptions>(options: O) => {
	const defaultActions = getActions(options);
	type Actions = O["plugins"] extends Array<BetterAuthPlugin>
		? UnionToIntersection<
				ReturnType<
					O["plugins"][number] extends { getActions: Function }
						? O["plugins"][number]["getActions"]
						: never
				>
			>
		: {};
	const auth = {
		/**
		 * The handler for the better auth routes.
		 */
		handler: async <R = Response>(
			request: Request | IncomingMessage,
			opts?: HandlerOptions<R>,
		): Promise<R> => {
			const context = await toContext(options, request, opts);
			if (!isValidHttpMethod(request.method)) {
				return toResponse({ status: 200 }, context, opts);
			}
			const response = await router(context);
			return toResponse(response, context, opts);
		},
		caller: {
			...defaultActions,
			...options.plugins?.map((plugin) => plugin.getActions?.(options)),
		} as typeof defaultActions & Actions,
		options,
	};

	return auth;
};

export const toContext = async (
	options: BetterAuthOptions,
	request: Request | IncomingMessage,
	handlerOptions?: HandlerOptions,
): Promise<Context> => {
	const basePath = options.basePath || "/api/auth";
	const headers = toRequestHeader(request.headers);
	const { url, action } = parseUrl(request, options);
	const body =
		request.method?.toUpperCase() === "POST" ? await getBody(request) : null;
	return {
		baseURL: url.origin,
		basePath,
		request: {
			method: request.method as string,
			url,
			query: Object.fromEntries(url.searchParams),
			action,
			body,
			headers: headers,
			cookies: handlerOptions?.cookieManager || cookieManager(headers),
		},
		_db: options.adapter,
		providers: options.providers,
		secret: getSecret(options.secret),
		adapter: createInternalAdapter(options.adapter),
		plugins: getPlugins(options),
		cookies: getCookies(options),
		disableCSRF: options.advanced?.skipCSRFCheck || false,
		session: {
			modelName: options.session?.modelName || "session",
			updateAge:
				options.session?.updateAge === undefined
					? timeSpan("1d")
					: options.session.updateAge,
			expiresIn: options.session?.expiresIn || timeSpan("1w"),
			additionalFields: options.session?.additionalFields
				? toInternalFields(options.session.additionalFields)
				: {},
			selectFields: getSelectFields(
				options.session?.additionalFields || {},
				"session",
			),
		},
		user: {
			modelName: options.user?.modelName || "user",
			fields: options.user?.fields ? toInternalFields(options.user.fields) : {},
			selectFields: getSelectFields(options.user?.fields || {}, "user"),
		},
		account: {
			modelName: options.account?.modelName || "account",
			additionalFields: options.account?.additionalFields || {},
			selectFields: [
				...Object.keys(options.account?.additionalFields || {}),
				"userId",
				"providerId",
				"accountId",
			],
		},
		sessionAdapter: options.sessionAdapter,
	};
};

export const toResponse = (
	res: InternalResponse,
	context: Context,
	handlerOptions?: HandlerOptions,
) => {
	if (handlerOptions?.toResponse) {
		return handlerOptions.toResponse(res, context);
	}
	context.request.headers.set("content-type", "application/json");
	const response = new Response(res.body ? JSON.stringify(res.body) : null, {
		headers: {
			...context.request.headers,
			"Set-Cookie": context.request.headers.get("Set-Cookie") ?? "",
			...res.headers,
		},
		status: res.status,
		statusText: res.statusText,
	});
	return response;
};

export type BetterAuthHandler = ReturnType<typeof betterAuth>["handler"];
export type BetterAuth = ReturnType<typeof betterAuth>;
