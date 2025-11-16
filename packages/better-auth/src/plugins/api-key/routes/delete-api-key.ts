import type { AuthContext } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import * as z from "zod";
import { APIError, sessionMiddleware } from "../../../api";
import { API_KEY_TABLE_NAME, ERROR_CODES } from "..";
import type { apiKeySchema } from "../schema";
import {
	deleteApiKeyFromSecondaryStorage,
	getApiKeyByIdFromSecondaryStorage,
} from "../secondary-storage";
import type { ApiKey } from "../types";
import type { PredefinedApiKeyOptions } from ".";
export function deleteApiKey({
	opts,
	schema,
	deleteAllExpiredApiKeys,
}: {
	opts: PredefinedApiKeyOptions;
	schema: ReturnType<typeof apiKeySchema>;
	deleteAllExpiredApiKeys(
		ctx: AuthContext,
		byPassLastCheckTime?: boolean | undefined,
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
			}),
			use: [sessionMiddleware],
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
			const session = ctx.context.session;
			if (session.user.banned === true) {
				throw new APIError("UNAUTHORIZED", {
					message: ERROR_CODES.USER_BANNED,
				});
			}

			let apiKey: ApiKey | null = null;

			if (
				opts.storage === "secondary-storage" &&
				ctx.context.secondaryStorage
			) {
				apiKey = await getApiKeyByIdFromSecondaryStorage(ctx, keyId);
			} else {
				apiKey = await ctx.context.adapter.findOne<ApiKey>({
					model: API_KEY_TABLE_NAME,
					where: [
						{
							field: "id",
							value: keyId,
						},
					],
				});
			}

			if (!apiKey || apiKey.userId !== session.user.id) {
				throw new APIError("NOT_FOUND", {
					message: ERROR_CODES.KEY_NOT_FOUND,
				});
			}

			try {
				if (
					opts.storage === "secondary-storage" &&
					ctx.context.secondaryStorage
				) {
					await deleteApiKeyFromSecondaryStorage(ctx, apiKey);
				} else {
					await ctx.context.adapter.delete<ApiKey>({
						model: API_KEY_TABLE_NAME,
						where: [
							{
								field: "id",
								value: apiKey.id,
							},
						],
					});
				}
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
