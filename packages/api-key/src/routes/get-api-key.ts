import type { AuthContext } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import { safeJSONParse } from "@better-auth/core/utils/json";
import { sessionMiddleware } from "better-auth/api";
import * as z from "zod";
import { API_KEY_ERROR_CODES as ERROR_CODES } from "..";
import { getApiKeyById, migrateDoubleStringifiedMetadata } from "../adapter";
import { checkOrgApiKeyPermission } from "../org-authorization";
import type { apiKeySchema } from "../schema";
import type { ApiKey, ApiKeyOptions, InferApiKey } from "../types";
import type { PredefinedApiKeyOptions } from ".";
import { configIdMatches, resolveConfiguration } from ".";

const getApiKeyQuerySchema = z.object({
	configId: z
		.string()
		.meta({
			description:
				"The configuration ID to use for the API key lookup. If not provided, the default configuration will be used.",
		})
		.optional(),
	id: z.string().meta({
		description: "The id of the Api Key",
	}),
});

export function getApiKey<O extends ApiKeyOptions>({
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
		"/api-key/get",
		{
			method: "GET",
			query: getApiKeyQuerySchema,
			use: [sessionMiddleware],
			metadata: {
				openapi: {
					description: "Retrieve an existing API key by ID",
					responses: {
						"200": {
							description: "API key retrieved successfully",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											id: {
												type: "string",
												description: "ID",
											},
											name: {
												type: "string",
												nullable: true,
												description: "The name of the key",
											},
											start: {
												type: "string",
												nullable: true,
												description:
													"Shows the first few characters of the API key, including the prefix. This allows you to show those few characters in the UI to make it easier for users to identify the API key.",
											},
											prefix: {
												type: "string",
												nullable: true,
												description:
													"The API Key prefix. Stored as plain text.",
											},
											userId: {
												type: "string",
												description: "The owner of the user id",
											},
											refillInterval: {
												type: "number",
												nullable: true,
												description:
													"The interval in milliseconds between refills of the `remaining` count. Example: 3600000 // refill every hour (3600000ms = 1h)",
											},
											refillAmount: {
												type: "number",
												nullable: true,
												description: "The amount to refill",
											},
											lastRefillAt: {
												type: "string",
												format: "date-time",
												nullable: true,
												description: "The last refill date",
											},
											enabled: {
												type: "boolean",
												description: "Sets if key is enabled or disabled",
												default: true,
											},
											rateLimitEnabled: {
												type: "boolean",
												description:
													"Whether the key has rate limiting enabled",
											},
											rateLimitTimeWindow: {
												type: "number",
												nullable: true,
												description: "The duration in milliseconds",
											},
											rateLimitMax: {
												type: "number",
												nullable: true,
												description:
													"Maximum amount of requests allowed within a window",
											},
											requestCount: {
												type: "number",
												description:
													"The number of requests made within the rate limit time window",
											},
											remaining: {
												type: "number",
												nullable: true,
												description:
													"Remaining requests (every time api key is used this should updated and should be updated on refill as well)",
											},
											lastRequest: {
												type: "string",
												format: "date-time",
												nullable: true,
												description: "When last request occurred",
											},
											expiresAt: {
												type: "string",
												format: "date-time",
												nullable: true,
												description: "Expiry date of a key",
											},
											createdAt: {
												type: "string",
												format: "date-time",
												description: "created at",
											},
											updatedAt: {
												type: "string",
												format: "date-time",
												description: "updated at",
											},
											metadata: {
												type: "object",
												nullable: true,
												additionalProperties: true,
												description: "Extra metadata about the apiKey",
											},
											permissions: {
												type: "string",
												nullable: true,
												description:
													"Permissions for the api key (stored as JSON string)",
											},
										},
										required: [
											"id",
											"userId",
											"enabled",
											"rateLimitEnabled",
											"requestCount",
											"createdAt",
											"updatedAt",
										],
									},
								},
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			const { configId, id } = ctx.query;

			const session = ctx.context.session;

			// Use provided configId or fall back to default config for initial lookup
			const lookupOpts = resolveConfiguration(
				ctx.context,
				configurations,
				configId,
			);
			let apiKey: ApiKey | null = null;

			apiKey = await getApiKeyById(ctx, id, lookupOpts);

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

			// Verify ownership based on config's references type
			const referencesType = opts.references ?? "user";
			if (referencesType === "organization") {
				// For organization-owned keys, verify membership and permission
				await checkOrgApiKeyPermission(
					ctx,
					session.user.id,
					apiKey.referenceId,
					"read",
				);
			} else if (apiKey.referenceId !== session.user.id) {
				// User-owned keys - verify user owns the key
				throw APIError.from("NOT_FOUND", ERROR_CODES.KEY_NOT_FOUND);
			}

			deleteAllExpiredApiKeys(ctx.context);

			// Migrate legacy double-stringified metadata if needed
			const metadata = await migrateDoubleStringifiedMetadata(
				ctx,
				apiKey,
				opts,
			);

			const { key: _key, ...returningApiKey } = apiKey;

			return ctx.json({
				...returningApiKey,
				metadata,
				permissions: returningApiKey.permissions
					? safeJSONParse<{
							[key: string]: string[];
						}>(returningApiKey.permissions)
					: null,
			} as Omit<InferApiKey<O>, "key">);
		},
	);
}
