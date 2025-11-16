import type {
	BetterAuthOptions,
	BetterAuthPlugin,
	GenericEndpointContext,
} from "@better-auth/core";
import {
	createAuthEndpoint,
	createAuthMiddleware,
} from "@better-auth/core/api";
import * as z from "zod";
import { getSession } from "../../api";
import type { InferSession, InferUser } from "../../types";
import { getEndpointResponse } from "../../utils/plugin-helper";

const getSessionQuerySchema = z.optional(
	z.object({
		/**
		 * If cookie cache is enabled, it will disable the cache
		 * and fetch the session from the database
		 */
		disableCookieCache: z
			.boolean()
			.meta({
				description: "Disable cookie cache and fetch session from database",
			})
			.or(z.string().transform((v) => v === "true"))
			.optional(),
		disableRefresh: z
			.boolean()
			.meta({
				description:
					"Disable session refresh. Useful for checking session status, without updating the session",
			})
			.optional(),
	}),
);

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
			user: InferUser<O>;
			session: InferSession<O>;
		},
		ctx: GenericEndpointContext,
	) => Promise<Returns>,
	options?: O | undefined,
	pluginOptions?: CustomSessionPluginOptions | undefined,
) => {
	return {
		id: "custom-session",
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
					const session = await getSession()({
						...ctx,
						asResponse: false,
						headers: ctx.headers,
						returnHeaders: true,
					}).catch((e) => {
						return null;
					});
					if (!session?.response) {
						return ctx.json(null);
					}
					const fnResult = await fn(session.response as any, ctx);

					const setCookie = session.headers.get("set-cookie");
					if (setCookie) {
						ctx.setHeader("set-cookie", setCookie);
						session.headers.delete("set-cookie");
					}

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
	} satisfies BetterAuthPlugin;
};
