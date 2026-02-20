import type { AuthContext } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import { safeJSONParse } from "@better-auth/core/utils/json";
import * as z from "zod/v4";
import { sessionMiddleware } from "../../../api";
import {
	batchMigrateLegacyMetadata,
	listApiKeys as listApiKeysFromStorage,
	parseDoubleStringifiedMetadata,
} from "../adapter";
import type { apiKeySchema } from "../schema";
import type { PredefinedApiKeyOptions } from ".";

const listApiKeysQuerySchema = z
	.object({
		configId: z
			.string()
			.meta({
				description:
					"Filter by configuration ID. If not provided, returns keys from all configurations.",
			})
			.optional(),
		organizationId: z
			.string()
			.meta({
				description:
					"Organization ID to list keys for. If provided, returns organization-owned keys. If not provided, returns user-owned keys.",
			})
			.optional(),
		limit: z.coerce
			.number()
			.int()
			.nonnegative()
			.meta({
				description: "The number of API keys to return",
			})
			.optional(),
		offset: z.coerce
			.number()
			.int()
			.nonnegative()
			.meta({
				description: "The offset to start from",
			})
			.optional(),
		sortBy: z
			.string()
			.meta({
				description: "The field to sort by (e.g., createdAt, name, expiresAt)",
			})
			.optional(),
		sortDirection: z
			.enum(["asc", "desc"])
			.meta({
				description: "The direction to sort by",
			})
			.optional(),
	})
	.optional();

export function listApiKeys({
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
		"/api-key/list",
		{
			method: "GET",
			use: [sessionMiddleware],
			query: listApiKeysQuerySchema,
			metadata: {
				openapi: {
					description:
						"List all API keys for the authenticated user or for a specific organization",
					responses: {
						"200": {
							description: "API keys retrieved successfully",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											apiKeys: {
												type: "array",
												items: {
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
											total: {
												type: "number",
												description: "Total number of API keys",
											},
											limit: {
												type: "number",
												nullable: true,
												description: "The limit used for pagination",
											},
											offset: {
												type: "number",
												nullable: true,
												description: "The offset used for pagination",
											},
										},
										required: ["apiKeys", "total"],
									},
								},
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			const session = ctx.context.session;
			const configId = ctx.query?.configId;
			const organizationId = ctx.query?.organizationId;
			const limit =
				ctx.query?.limit != null ? Number(ctx.query.limit) : undefined;
			const offset =
				ctx.query?.offset != null ? Number(ctx.query.offset) : undefined;

			// Use default config for storage operations
			const opts = configurations[0]!;

			// Determine the referenceId to query - either organizationId or user.id
			const referenceId = organizationId ?? session.user.id;
			const expectedReferencesType = organizationId ? "organization" : "user";

			// List keys by referenceId
			const { apiKeys: allApiKeys } = await listApiKeysFromStorage(
				ctx,
				referenceId,
				opts,
				{
					limit: undefined, // Get all for filtering
					offset: undefined,
					sortBy: ctx.query?.sortBy,
					sortDirection: ctx.query?.sortDirection,
				},
			);

			// Filter by ownership type (user or organization) based on config's references setting
			let filteredApiKeys = allApiKeys.filter((key) => {
				const keyConfig = configurations.find(
					(c) => c.configId === key.configId,
				);
				const referencesType = keyConfig?.references ?? "user";
				return (
					referencesType === expectedReferencesType &&
					key.referenceId === referenceId
				);
			});

			if (configId) {
				filteredApiKeys = filteredApiKeys.filter(
					(key) => key.configId === configId,
				);
			}

			const total = filteredApiKeys.length;

			// Apply pagination after filtering
			let paginatedApiKeys = filteredApiKeys;
			if (offset !== undefined) {
				paginatedApiKeys = paginatedApiKeys.slice(offset);
			}
			if (limit !== undefined) {
				paginatedApiKeys = paginatedApiKeys.slice(0, limit);
			}

			deleteAllExpiredApiKeys(ctx.context);

			// Build response with parsed metadata (synchronous, no DB calls)
			const returningApiKeys = paginatedApiKeys.map((apiKey) => {
				const { key: _key, ...rest } = apiKey;
				return {
					...rest,
					metadata: parseDoubleStringifiedMetadata(apiKey.metadata),
					permissions: rest.permissions
						? safeJSONParse<{
								[key: string]: string[];
							}>(rest.permissions)
						: null,
				};
			});

			// Batch migrate legacy metadata (parallel DB updates)
			await ctx.context.runInBackgroundOrAwait(
				batchMigrateLegacyMetadata(ctx, paginatedApiKeys, opts),
			);

			return ctx.json({
				apiKeys: returningApiKeys,
				total,
				limit,
				offset,
			});
		},
	);
}
