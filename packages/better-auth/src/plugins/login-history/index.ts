import type { BetterAuthPlugin } from "../../types";
import { APIError, createAuthEndpoint, sessionMiddleware } from "../../api";
import type {
	LoginHistory,
	LoginHistoryOptions,
	LoginHistoryModel,
} from "./types";
import { mergeSchema } from "../../db";
import { schema } from "./schema";
import { getClientIP } from "./utils";

export const loginHistory = (options?: LoginHistoryOptions) => {
	const opts = {
		loginHistoryTable: "loginHistory",
		ipHeader: options?.ipHeader,
	};

	const ERROR_CODES = {
		IP_NOT_FOUND: "Could not determine client IP address.",
		USER_AGENT_NOT_FOUND: "Could not determine client user agent.",
	} as const;

	/**
	 * ### Endpoint
	 *
	 * GET `/login-history/list`
	 *
	 * ### API Methods
	 *
	 * **server:**
	 * `auth.api.getLoginHistory`
	 *
	 * **client:**
	 * `authClient.loginHistory.list`
	 *
	 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/login-history#api-method-login-history-list)
	 */
	const getLoginHistory = createAuthEndpoint(
		"/login-history/list",
		{
			method: "GET",
			use: [sessionMiddleware],
			metadata: {
				openapi: {
					description: "Get user login history",
					responses: {
						200: {
							description: "Success",
							content: {
								"application/json": {
									schema: {
										type: "array",
										items: {
											type: "object",
											properties: {
												id: { type: "string" },
												userAgent: { type: "string" },
												ipAddress: { type: "string" },
												createdAt: { type: "number" },
											},
										},
										description: "Array of user login history",
									},
								},
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			const userId = ctx.context.session.user.id;
			const history = await ctx.context.adapter.findMany<LoginHistoryModel>({
				model: opts.loginHistoryTable,
				where: [{ field: "userId", operator: "eq", value: userId }],
				sortBy: { field: "createdAt", direction: "desc" },
			});

			const response = history.map((item): LoginHistory => {
				return {
					id: item.id,
					userAgent: item.userAgent,
					ipAddress: item.ipAddress,
					createdAt: item.createdAt,
				};
			});

			return ctx.json(response);
		},
	);

	return {
		id: "login-history",
		schema: mergeSchema(schema, options?.schema),
		endpoints: {
			getLoginHistory,
		},
		$ERROR_CODES: ERROR_CODES,
		init(ctx) {
			return {
				options: {
					databaseHooks: {
						session: {
							create: {
								async after(session, context) {
									if (!context || !context.request) return;

									const userAgent = context.request.headers.get("user-agent");
									const ipAddress = opts.ipHeader
										? context.request.headers.get(opts.ipHeader)
										: getClientIP(context.request.headers);

									if (!ipAddress) {
										throw new APIError("BAD_REQUEST", {
											message: ERROR_CODES.IP_NOT_FOUND,
										});
									}

									if (!userAgent) {
										throw new APIError("BAD_REQUEST", {
											message: ERROR_CODES.USER_AGENT_NOT_FOUND,
										});
									}

									await ctx.adapter.create({
										model: opts.loginHistoryTable,
										data: {
											userId: session.userId,
											userAgent,
											ipAddress,
											createdAt: new Date(),
										},
									});
								},
							},
						},
					},
				},
			};
		},
	} satisfies BetterAuthPlugin;
};

export * from "./client";
export * from "./types";
