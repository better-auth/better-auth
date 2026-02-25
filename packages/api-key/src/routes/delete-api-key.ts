import type { AuthContext } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import { sessionMiddleware } from "better-auth/api";
import * as z from "zod";
import { API_KEY_TABLE_NAME, API_KEY_ERROR_CODES as ERROR_CODES } from "..";
import {
	deleteApiKey as deleteApiKeyFromStorage,
	getApiKeyById,
} from "../adapter";
import { checkOrgApiKeyPermission } from "../org-authorization";
import type { apiKeySchema } from "../schema";
import type { ApiKey } from "../types";
import type { PredefinedApiKeyOptions } from ".";
import { configIdMatches, resolveConfiguration } from ".";

const deleteApiKeyBodySchema = z.object({
	configId: z
		.string()
		.meta({
			description:
				"The configuration ID to use for the API key lookup. If not provided, the default configuration will be used.",
		})
		.optional(),
	keyId: z.string().meta({
		description: "The id of the Api Key",
	}),
});

export function deleteApiKey({
	configurations,
	schema,
	deleteAllExpiredApiKeys,
}: {
	configurations: PredefinedApiKeyOptions[];
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
			body: deleteApiKeyBodySchema,
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
			const { configId, keyId } = ctx.body;
			const session = ctx.context.session;
			if (session.user.banned === true) {
				throw APIError.from("UNAUTHORIZED", ERROR_CODES.USER_BANNED);
			}

			// Use provided configId or fall back to default config for initial lookup
			const lookupOpts = resolveConfiguration(
				ctx.context,
				configurations,
				configId,
			);
			let apiKey: ApiKey | null = null;

			apiKey = await getApiKeyById(ctx, keyId, lookupOpts);

			if (!apiKey) {
				throw APIError.from("NOT_FOUND", ERROR_CODES.KEY_NOT_FOUND);
			}

			if (!configIdMatches(apiKey.configId, lookupOpts.configId)) {
				throw APIError.from("NOT_FOUND", ERROR_CODES.KEY_NOT_FOUND);
			}

			// Resolve the correct config based on the API key's configId
			const opts = resolveConfiguration(
				ctx.context,
				configurations,
				apiKey.configId,
			);

			// Verify ownership - user can only delete their own user-owned keys
			const referencesType = opts.references ?? "user";
			if (referencesType === "organization") {
				// For organization-owned keys, verify membership and permission
				await checkOrgApiKeyPermission(
					ctx,
					session.user.id,
					apiKey.referenceId,
					"delete",
				);
			} else if (apiKey.referenceId !== session.user.id) {
				throw APIError.from("NOT_FOUND", ERROR_CODES.KEY_NOT_FOUND);
			}

			try {
				if (opts.storage === "secondary-storage" && opts.fallbackToDatabase) {
					await deleteApiKeyFromStorage(ctx, apiKey, opts);
					await ctx.context.adapter.delete<ApiKey>({
						model: API_KEY_TABLE_NAME,
						where: [
							{
								field: "id",
								value: apiKey.id,
							},
						],
					});
				} else if (opts.storage === "database") {
					await ctx.context.adapter.delete<ApiKey>({
						model: API_KEY_TABLE_NAME,
						where: [
							{
								field: "id",
								value: apiKey.id,
							},
						],
					});
				} else {
					await deleteApiKeyFromStorage(ctx, apiKey, opts);
				}
			} catch (error: any) {
				throw APIError.fromStatus("INTERNAL_SERVER_ERROR", {
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
