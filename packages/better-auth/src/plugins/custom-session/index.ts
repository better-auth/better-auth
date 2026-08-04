import type {
	BetterAuthOptions,
	BetterAuthPlugin,
	GenericEndpointContext,
} from "@better-auth/core";
import {
	createAuthEndpoint,
	createAuthMiddleware,
} from "@better-auth/core/api";
import type { Session, User } from "@better-auth/core/db";
import {
	refreshSession as createRefreshSessionEndpoint,
	getSession,
} from "../../api";
import {
	parseSetCookieHeader,
	toCookieOptions,
} from "../../cookies/cookie-utils";
import { getSessionQuerySchema } from "../../cookies/session-store";
import { getEndpointResponse } from "../../utils/plugin-helper";
import { PACKAGE_VERSION } from "../../version";

declare module "@better-auth/core" {
	interface BetterAuthPluginRegistry<AuthOptions, Options> {
		"custom-session": {
			creator: typeof customSession;
		};
	}
}

export type CustomSessionPluginOptions = {
	/**
	 * This option is used to determine if the list-device-sessions endpoint should be mutated to the custom session data.
	 * @default false
	 */
	shouldMutateListDeviceSessionsEndpoint?: boolean | undefined;
};

export const customSession = <
	Returns extends Record<string, any>,
	O extends BetterAuthOptions = BetterAuthOptions,
>(
	fn: (
		session: {
			user: User<O["user"], O["plugins"]>;
			session: Session<O["session"], O["plugins"]>;
		},
		ctx: GenericEndpointContext,
	) => Promise<Returns>,
	options?: O | undefined,
	pluginOptions?: CustomSessionPluginOptions | undefined,
) => {
	type SessionResult = {
		headers: Headers;
		response: {
			session: Session<O["session"], O["plugins"]>;
			user: User<O["user"], O["plugins"]>;
			needsRefresh?: true;
		} | null;
	};

	const transformSession = async (
		ctx: GenericEndpointContext,
		result: SessionResult,
	) => {
		for (const cookieStr of result.headers.getSetCookie()) {
			const parsed = parseSetCookieHeader(cookieStr);
			parsed.forEach((attrs, name) => {
				ctx.setCookie(name, attrs.value, toCookieOptions(attrs));
			});
		}
		result.headers.delete("set-cookie");

		result.headers.forEach((value, key) => {
			ctx.setHeader(key, value);
		});

		if (!result.response) {
			return ctx.json(null);
		}
		const transformedSession = await fn(result.response, ctx);
		return ctx.json({
			...transformedSession,
			...(result.response.needsRefresh ? { needsRefresh: true as const } : {}),
		});
	};

	return {
		id: "custom-session",
		version: PACKAGE_VERSION,
		hooks: {
			after: [
				{
					matcher: (ctx) =>
						ctx.path === "/multi-session/list-device-sessions" &&
						(pluginOptions?.shouldMutateListDeviceSessionsEndpoint ?? false),
					handler: createAuthMiddleware(async (ctx) => {
						const response = await getEndpointResponse<[]>(ctx);
						if (!response) return;
						const newResponse = await Promise.all(
							response.map(async (v) => await fn(v, ctx)),
						);
						return ctx.json(newResponse);
					}),
				},
			],
		},
		endpoints: {
			getSession: createAuthEndpoint(
				"/get-session",
				{
					method: "GET",
					query: getSessionQuerySchema,
					metadata: {
						CUSTOM_SESSION: true,
						openapi: {
							description: "Get custom session data",
							responses: {
								"200": {
									description: "Success",
									content: {
										"application/json": {
											schema: {
												type: "array",
												nullable: true,
												items: {
													$ref: "#/components/schemas/Session",
												},
											},
										},
									},
								},
							},
						},
					},
					requireHeaders: true,
				},
				async (ctx): Promise<Returns | null> => {
					const result = await getSession<O>()({
						...ctx,
						method: "GET",
						asResponse: false,
						headers: ctx.headers,
						returnHeaders: true,
					});
					return transformSession(ctx, result);
				},
			),
			refreshSession: createAuthEndpoint(
				"/refresh-session",
				{
					method: "POST",
					query: getSessionQuerySchema,
					metadata: {
						CUSTOM_SESSION: true,
						openapi: {
							description: "Refresh custom session data",
							responses: {
								"200": {
									description: "Success",
									content: {
										"application/json": {
											schema: {
												type: "array",
												nullable: true,
												items: {
													$ref: "#/components/schemas/Session",
												},
											},
										},
									},
								},
							},
						},
					},
					requireHeaders: true,
				},
				async (ctx): Promise<Returns | null> => {
					const result = await createRefreshSessionEndpoint<O>()({
						...ctx,
						method: "POST",
						asResponse: false,
						headers: ctx.headers,
						returnHeaders: true,
					});
					return transformSession(ctx, result);
				},
			),
		},
		$Infer: {
			Session: {} as Awaited<ReturnType<typeof fn>>,
		},
		options: pluginOptions,
	} satisfies BetterAuthPlugin;
};
