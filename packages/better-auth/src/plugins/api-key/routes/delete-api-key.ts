import * as z from "zod";
import { APIError, getSessionFromCtx } from "../../../api";
import { ERROR_CODES } from "..";
import type { apiKeySchema } from "../schema";
import type { ApiKey } from "../types";
import type { PredefinedApiKeyOptions } from ".";
import { API_KEY_TABLE_NAME } from "..";
import type { AuthContext } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
export function deleteApiKey({
	opts,
	schema,
	deleteAllExpiredApiKeys,
}: {
	opts: PredefinedApiKeyOptions;
	schema: ReturnType<typeof apiKeySchema>;
	deleteAllExpiredApiKeys(
		ctx: AuthContext,
		byPassLastCheckTime?: boolean,
	): void;
}) {
	return createAuthEndpoint(
		"/api-key/delete",
		{
			method: "POST",
			body: z.object({
				keyId: z.string().meta({
					description: "The id of the Api Key",
				}),
				userId: z.coerce
					.string()
					.meta({
						description:
							'User Id of the user that the Api Key belongs to. server-only. Eg: "user-id"',
					})
					.optional(),
			}),
			metadata: {
				openapi: {
					description: "Delete an existing API key",
					requestBody: {
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										keyId: {
											type: "string",
											description: "The id of the API key to delete",
										},
									},
									required: ["keyId"],
								},
							},
						},
					},
					responses: {
						"200": {
							description: "API key deleted successfully",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											success: {
												type: "boolean",
												description:
													"Indicates if the API key was successfully deleted",
											},
										},
										required: ["success"],
									},
								},
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			const { keyId } = ctx.body;

			const session = await getSessionFromCtx(ctx);
			const authRequired = ctx.request || ctx.headers;
			const user =
				authRequired && !session
					? null
					: session?.user || { id: ctx.body.userId };

			if (!user?.id) {
				throw new APIError("UNAUTHORIZED", {
					message: ERROR_CODES.UNAUTHORIZED_SESSION,
				});
			}

			if (session && ctx.body.userId && session?.user.id !== ctx.body.userId) {
				throw new APIError("UNAUTHORIZED", {
					message: ERROR_CODES.UNAUTHORIZED_SESSION,
				});
			}

			if (session && session.user.banned === true) {
				throw new APIError("UNAUTHORIZED", {
					message: ERROR_CODES.USER_BANNED,
				});
			}

			const apiKey = await ctx.context.adapter.findOne<ApiKey>({
				model: API_KEY_TABLE_NAME,
				where: [
					{
						field: "id",
						value: keyId,
					},
				],
			});

			if (!apiKey || apiKey.userId !== user.id) {
				throw new APIError("NOT_FOUND", {
					message: ERROR_CODES.KEY_NOT_FOUND,
				});
			}

			try {
				await ctx.context.adapter.delete<ApiKey>({
					model: API_KEY_TABLE_NAME,
					where: [
						{
							field: "id",
							value: apiKey.id,
						},
					],
				});
			} catch (error: any) {
				throw new APIError("INTERNAL_SERVER_ERROR", {
					message: error?.message,
				});
			}
			deleteAllExpiredApiKeys(ctx.context);
			return ctx.json({
				success: true,
			});
		},
	);
}
