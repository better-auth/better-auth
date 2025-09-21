import { declareEndpoint } from "../../better-call/shared";
import * as z from "zod";

// Create API Key endpoint
export const createApiKeyDef = declareEndpoint("/api-key/create", {
	method: "POST",
	body: z.object({
		name: z.string().meta({ description: "Name of the Api Key" }).optional(),
		expiresIn: z
			.number()
			.meta({
				description: "Expiration time of the Api Key in seconds",
			})
			.min(1)
			.optional()
			.nullable()
			.default(null),
		userId: z.coerce
			.string()
			.meta({
				description:
					'User Id of the user that the Api Key belongs to. server-only. Eg: "user-id"',
			})
			.optional(),
		prefix: z
			.string()
			.meta({ description: "Prefix of the Api Key" })
			.regex(/^[a-zA-Z0-9_-]+$/, {
				message:
					"Invalid prefix format, must be alphanumeric and contain only underscores and hyphens.",
			})
			.optional(),
		remaining: z
			.number()
			.meta({
				description: "Remaining number of requests. Server side only",
			})
			.min(0)
			.optional()
			.nullable()
			.default(null),
		metadata: z.any().optional(),
		refillAmount: z
			.number()
			.meta({
				description:
					"Amount to refill the remaining count of the Api Key. server-only. Eg: 100",
			})
			.min(1)
			.optional(),
		refillInterval: z
			.number()
			.meta({
				description:
					"Interval to refill the Api Key in milliseconds. server-only. Eg: 1000",
			})
			.optional(),
		rateLimitTimeWindow: z
			.number()
			.meta({
				description:
					"The duration in milliseconds where each request is counted. Once the `maxRequests` is reached, the request will be rejected until the `timeWindow` has passed, at which point the `timeWindow` will be reset. server-only. Eg: 1000",
			})
			.optional(),
		rateLimitMax: z
			.number()
			.meta({
				description:
					"Maximum amount of requests allowed within a window. Once the `maxRequests` is reached, the request will be rejected until the `timeWindow` has passed, at which point the `timeWindow` will be reset. server-only. Eg: 100",
			})
			.optional(),
		rateLimitEnabled: z
			.boolean()
			.meta({
				description:
					"Whether the key has rate limiting enabled. server-only. Eg: true",
			})
			.optional(),
		permissions: z
			.record(z.string(), z.array(z.string()))
			.meta({
				description: "Permissions of the Api Key.",
			})
			.optional(),
	}),
	metadata: {
		openapi: {
			description: "Create a new API key for a user",
			responses: {
				"200": {
					description: "API key created successfully",
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									id: {
										type: "string",
										description: "Unique identifier of the API key",
									},
									createdAt: {
										type: "string",
										format: "date-time",
										description: "Creation timestamp",
									},
									updatedAt: {
										type: "string",
										format: "date-time",
										description: "Last update timestamp",
									},
									name: {
										type: "string",
										nullable: true,
										description: "Name of the API key",
									},
									prefix: {
										type: "string",
										nullable: true,
										description: "Prefix of the API key",
									},
									start: {
										type: "string",
										nullable: true,
										description:
											"Starting characters of the key (if configured)",
									},
									key: {
										type: "string",
										description: "The full API key (only returned on creation)",
									},
									enabled: {
										type: "boolean",
										description: "Whether the key is enabled",
									},
									expiresAt: {
										type: "string",
										format: "date-time",
										nullable: true,
										description: "Expiration timestamp",
									},
									userId: {
										type: "string",
										description: "ID of the user owning the key",
									},
									lastRefillAt: {
										type: "string",
										format: "date-time",
										nullable: true,
										description: "Last refill timestamp",
									},
									lastRequest: {
										type: "string",
										format: "date-time",
										nullable: true,
										description: "Last request timestamp",
									},
									metadata: {
										type: "object",
										nullable: true,
										additionalProperties: true,
										description: "Metadata associated with the key",
									},
									rateLimitMax: {
										type: "number",
										nullable: true,
										description: "Maximum requests in time window",
									},
									rateLimitTimeWindow: {
										type: "number",
										nullable: true,
										description: "Rate limit time window in milliseconds",
									},
									remaining: {
										type: "number",
										nullable: true,
										description: "Remaining requests",
									},
									refillAmount: {
										type: "number",
										nullable: true,
										description: "Amount to refill",
									},
									refillInterval: {
										type: "number",
										nullable: true,
										description: "Refill interval in milliseconds",
									},
									rateLimitEnabled: {
										type: "boolean",
										description: "Whether rate limiting is enabled",
									},
									requestCount: {
										type: "number",
										description: "Current request count in window",
									},
									permissions: {
										type: "object",
										nullable: true,
										additionalProperties: {
											type: "array",
											items: { type: "string" },
										},
										description: "Permissions associated with the key",
									},
								},
								required: [
									"id",
									"createdAt",
									"updatedAt",
									"key",
									"enabled",
									"userId",
									"rateLimitEnabled",
									"requestCount",
								],
							},
						},
					},
				},
			},
		},
	},
});

// Verify API Key endpoint
export const verifyApiKeyDef = declareEndpoint("/api-key/verify", {
	method: "POST",
	body: z.object({
		key: z.string().meta({
			description: "The API key to verify",
		}),
	}),
	metadata: {
		openapi: {
			description: "Verify an API key",
			responses: {
				"200": {
					description: "API key verification result",
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									valid: {
										type: "boolean",
										description: "Whether the key is valid",
									},
									apiKey: {
										type: "object",
										nullable: true,
										description: "API key details if valid",
									},
									user: {
										type: "object",
										nullable: true,
										description: "User details if valid",
									},
								},
								required: ["valid"],
							},
						},
					},
				},
			},
		},
	},
});

// List API Keys endpoint
export const listApiKeysDef = declareEndpoint("/api-key/list", {
	method: "GET",
	requireHeaders: true,
	metadata: {
		openapi: {
			description: "List all API keys for the authenticated user",
			responses: {
				"200": {
					description: "API keys retrieved successfully",
					content: {
						"application/json": {
							schema: {
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
											description: "Starting characters of the key",
										},
										prefix: {
											type: "string",
											nullable: true,
											description: "Prefix of the key",
										},
										enabled: {
											type: "boolean",
											description: "Whether the key is enabled",
										},
										createdAt: {
											type: "string",
											format: "date-time",
											description: "Creation timestamp",
										},
										updatedAt: {
											type: "string",
											format: "date-time",
											description: "Last update timestamp",
										},
										expiresAt: {
											type: "string",
											format: "date-time",
											nullable: true,
											description: "Expiration timestamp",
										},
										lastRequest: {
											type: "string",
											format: "date-time",
											nullable: true,
											description: "Last request timestamp",
										},
										rateLimitMax: {
											type: "number",
											nullable: true,
											description: "Maximum requests in time window",
										},
										rateLimitTimeWindow: {
											type: "number",
											nullable: true,
											description: "Rate limit time window",
										},
										remaining: {
											type: "number",
											nullable: true,
											description: "Remaining requests",
										},
										rateLimitEnabled: {
											type: "boolean",
											description: "Whether rate limiting is enabled",
										},
										requestCount: {
											type: "number",
											description: "Current request count",
										},
									},
									required: [
										"id",
										"enabled",
										"createdAt",
										"updatedAt",
										"rateLimitEnabled",
										"requestCount",
									],
								},
							},
						},
					},
				},
			},
		},
	},
});

// Get API Key endpoint
export const getApiKeyDef = declareEndpoint("/api-key/get", {
	method: "GET",
	query: z.object({
		id: z.string().meta({
			description: "The ID of the API key to retrieve",
		}),
	}),
	requireHeaders: true,
	metadata: {
		openapi: {
			description: "Get a specific API key by ID",
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
										description: "ID of the API key",
									},
									name: {
										type: "string",
										nullable: true,
										description: "Name of the key",
									},
									start: {
										type: "string",
										nullable: true,
										description: "Starting characters",
									},
									enabled: {
										type: "boolean",
										description: "Whether the key is enabled",
									},
									createdAt: {
										type: "string",
										format: "date-time",
										description: "Creation timestamp",
									},
									updatedAt: {
										type: "string",
										format: "date-time",
										description: "Update timestamp",
									},
									expiresAt: {
										type: "string",
										format: "date-time",
										nullable: true,
										description: "Expiration timestamp",
									},
									metadata: {
										type: "object",
										nullable: true,
										additionalProperties: true,
										description: "Associated metadata",
									},
								},
								required: ["id", "enabled", "createdAt", "updatedAt"],
							},
						},
					},
				},
			},
		},
	},
});

// Update API Key endpoint
export const updateApiKeyDef = declareEndpoint("/api-key/update", {
	method: "POST",
	body: z.object({
		keyId: z.string().meta({
			description: "The ID of the API key to update",
		}),
		name: z.string().optional().meta({
			description: "New name for the API key",
		}),
		enabled: z.boolean().optional().meta({
			description: "Whether to enable/disable the key",
		}),
		remaining: z.number().optional().meta({
			description: "Update remaining requests count. Server-only",
		}),
		metadata: z.any().optional().meta({
			description: "Update metadata",
		}),
		refillAmount: z.number().optional().meta({
			description: "Update refill amount. Server-only",
		}),
		refillInterval: z.number().optional().meta({
			description: "Update refill interval. Server-only",
		}),
		rateLimitMax: z.number().optional().meta({
			description: "Update rate limit maximum. Server-only",
		}),
		rateLimitTimeWindow: z.number().optional().meta({
			description: "Update rate limit time window. Server-only",
		}),
		rateLimitEnabled: z.boolean().optional().meta({
			description: "Enable/disable rate limiting. Server-only",
		}),
		permissions: z.record(z.string(), z.array(z.string())).optional().meta({
			description: "Update permissions. Server-only",
		}),
	}),
	metadata: {
		openapi: {
			description: "Update an existing API key",
			responses: {
				"200": {
					description: "API key updated successfully",
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									success: {
										type: "boolean",
										description: "Update success status",
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
});

// Delete API Key endpoint
export const deleteApiKeyDef = declareEndpoint("/api-key/delete", {
	method: "POST",
	body: z.object({
		keyId: z.string().meta({
			description: "The ID of the API key to delete",
		}),
	}),
	requireHeaders: true,
	metadata: {
		openapi: {
			description: "Delete an API key",
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
										description: "Deletion success status",
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
});

// Delete All Expired API Keys endpoint
export const deleteAllExpiredApiKeysDef = declareEndpoint(
	"/api-key/delete-all-expired-api-keys",
	{
		method: "POST",
		metadata: {
			openapi: {
				description: "Delete all expired API keys",
				responses: {
					"200": {
						description: "Expired API keys deleted successfully",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										success: {
											type: "boolean",
											description: "Deletion success status",
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
);
