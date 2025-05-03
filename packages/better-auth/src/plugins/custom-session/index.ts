import { z } from "zod";
import { createAuthEndpoint, getSession } from "../../api";
import type {
	BetterAuthOptions,
	BetterAuthPlugin,
	GenericEndpointContext,
	InferSession,
	InferUser,
} from "../../types";

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
	options?: O,
) => {
	return {
		id: "custom-session",
		endpoints: {
			getSession: createAuthEndpoint(
				"/get-session",
				{
					method: "GET",
					query: z.optional(
						z.object({
							/**
							 * If cookie cache is enabled, it will disable the cache
							 * and fetch the session from the database
							 */
							disableCookieCache: z
								.boolean({
									description:
										"Disable cookie cache and fetch session from database",
								})
								.or(z.string().transform((v) => v === "true"))
								.optional(),
							disableRefresh: z
								.boolean({
									description:
										"Disable session refresh. Useful for checking session status, without updating the session",
								})
								.optional(),
						}),
					),
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
				async (ctx) => {
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
					session.headers.forEach((value, key) => {
						ctx.setHeader(key, value);
					});
					return ctx.json(fnResult);
				},
			),
		},
	} satisfies BetterAuthPlugin;
};
