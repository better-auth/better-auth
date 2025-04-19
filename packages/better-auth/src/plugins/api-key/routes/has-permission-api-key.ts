import { z } from "zod";
import { APIError, createAuthEndpoint } from "../../../api";
import { base64Url } from "@better-auth/utils/base64";
import type { apiKeySchema } from "../schema";
import type { ApiKey } from "../types";
import type { AuthContext } from "../../../types";
import type { PredefinedApiKeyOptions } from ".";
import { createHash } from "@better-auth/utils/hash";
import { ERROR_CODES } from "..";
import { role } from "../../access";
import { safeJSONParse } from "../../../utils/json";

export function hasPermissionApiKey({
	opts,
	schema,
	deleteAllExpiredApiKeys,
}: {
	opts: PredefinedApiKeyOptions;
	schema: ReturnType<typeof apiKeySchema>;
	deleteAllExpiredApiKeys(
		ctx: AuthContext,
		bypassLastCheckTime?: boolean,
	): Promise<number> | undefined;
}) {
	return createAuthEndpoint(
		"/api-key/has-permission",
		{
			method: "POST",
			body: z.object({
				key: z.string({
					description: "The id of the Api Key",
				}),
				permissions: z.record(z.string(), z.array(z.string())),
			}),
			metadata: {
				openapi: {
					description: "Check if api key has permission(s)",
					requestBody: {
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										key: {
											type: "string",
											description: "The id of the Api key to check",
										},
										permissions: {
											type: "object",
											description: "The permissions to check",
										},
									},
									required: ["key", "permissions"],
								},
							},
						},
					},
					responses: {
						"200": {
							description: "Success",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											error: {
												type: "string",
											},
											success: {
												type: "boolean",
											},
											missingPermissions: {
												type: ["object"],
											},
										},
										required: ["success"],
									},
								},
							},
						},
					},
				},
				$Infer: {
					body: {} as {
						key: string;
						permissions: { [key: string]: string[] };
					},
				},
				SERVER_ONLY: true,
			},
		},
		async (ctx) => {
			if (!ctx.body?.permissions) {
				throw new APIError("BAD_REQUEST", {
					message: "invalid permission check. no permission(s) were passed.",
				});
			}

			const { key, permissions } = ctx.body;

			if (key.length < opts.defaultKeyLength) {
				// if the key is shorter than the default key length, than we know the key is invalid.
				// we can't check if the key is exactly equal to the default key length, because
				// a prefix may be added to the key.
				throw new APIError("BAD_REQUEST", {
					message: ERROR_CODES.INVALID_API_KEY,
				});
			}

			const hash = await createHash("SHA-256").digest(
				new TextEncoder().encode(key),
			);
			const hashed = base64Url.encode(new Uint8Array(hash), {
				padding: false,
			});

			deleteAllExpiredApiKeys(ctx.context);

			const apiKey = await ctx.context.adapter.findOne<ApiKey>({
				model: schema.apikey.modelName,
				where: [
					{
						field: "key",
						value: hashed,
					},
				],
			});

			if (!apiKey) {
				throw new APIError("BAD_REQUEST", {
					message: ERROR_CODES.KEY_NOT_FOUND,
				});
			}

			const apiKeyPermissions = apiKey.permissions
				? safeJSONParse<{
						[key: string]: string[];
					}>(
						//@ts-ignore - from DB, this value is always a string
						apiKey.permissions,
					)
				: null;

			const r = role(apiKeyPermissions as any);
			const hasPermission = r.authorize(permissions);

			const response = {
				success: hasPermission.success,
				...(hasPermission.missingPermissions && {
					missingPermissions: hasPermission.missingPermissions,
				}),
			};

			return ctx.json(response);
		},
	);
}
