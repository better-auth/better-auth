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
import { getSession } from "../../api";
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

/**
 * Transforms the default session returned by the custom session plugin.
 */
export type CustomSessionHandler<
	Result extends object,
	O extends BetterAuthOptions = BetterAuthOptions,
> = (
	session: {
		user: User<O["user"], O["plugins"]>;
		session: Session<O["session"], O["plugins"]>;
	},
	ctx: GenericEndpointContext,
) => Promise<Result>;

const createCustomSessionPlugin = <
	Result extends object,
	O extends BetterAuthOptions = BetterAuthOptions,
>(
	fn: CustomSessionHandler<Result, O>,
	options?: O | undefined,
	pluginOptions?: CustomSessionPluginOptions | undefined,
) => {
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
				async (ctx): Promise<Result | null> => {
					const session = await getSession()({
						...ctx,
						method: "GET",
						asResponse: false,
						headers: ctx.headers,
						returnHeaders: true,
					}).catch((e) => {
						return null;
					});
					if (!session?.response) {
						return ctx.json(null);
					}
					const fnResult = await fn(
						session.response as Parameters<typeof fn>[0],
						ctx,
					);

					for (const cookieStr of session.headers.getSetCookie()) {
						const parsed = parseSetCookieHeader(cookieStr);
						parsed.forEach((attrs, name) => {
							ctx.setCookie(name, attrs.value, toCookieOptions(attrs));
						});
					}
					session.headers.delete("set-cookie");

					session.headers.forEach((value, key) => {
						ctx.setHeader(key, value);
					});
					return ctx.json(fnResult);
				},
			),
		},
		$Infer: {
			Session: {} as Awaited<ReturnType<typeof fn>>,
		},
		options: pluginOptions,
	} satisfies BetterAuthPlugin;
};

type InferredCustomSessionPlugin<
	Result extends object,
	O extends BetterAuthOptions,
> = ReturnType<typeof createCustomSessionPlugin<Result, O>>;

/**
 * The custom session plugin instance.
 */
export interface CustomSessionPlugin<
	Result extends object,
	O extends BetterAuthOptions = BetterAuthOptions,
> extends InferredCustomSessionPlugin<Result, O> {}

export const customSession = <
	Result extends object,
	O extends BetterAuthOptions = BetterAuthOptions,
>(
	fn: CustomSessionHandler<Result, O>,
	options?: O | undefined,
	pluginOptions?: CustomSessionPluginOptions | undefined,
): CustomSessionPlugin<Result, O> =>
	createCustomSessionPlugin(fn, options, pluginOptions);
