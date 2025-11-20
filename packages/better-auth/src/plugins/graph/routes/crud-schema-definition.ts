import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "better-call";
import * as z from "zod";
import { getSessionFromCtx, sessionMiddleware } from "../../../api";
import type { InferAdditionalFieldsFromPluginOptions } from "../../../db";
import { toZodSchema } from "../../../db/to-zod";
import { getGraphAdapter } from "../adapter";
import { GRAPH_ERROR_CODES } from "../error-codes";
import type { GraphOptions } from "../types";

export const createSchemaDefinitionRoute = <O extends GraphOptions>(
	options?: O | undefined,
) => {
	const additionalFieldsSchema = toZodSchema({
		fields: options?.schema?.schemaDefinition?.additionalFields || {},
		isClientSide: true,
	});
	const baseSchema = z.object({
		version: z.string().min(1).meta({
			description: "The version identifier for this schema",
		}),
		definition: z.string().min(1).meta({
			description: "The raw .zed schema definition",
		}),
		isActive: z
			.boolean()
			.meta({
				description:
					"Whether this schema should be set as active (will deactivate others)",
			})
			.default(false)
			.optional(),
		metadata: z
			.record(z.string(), z.any())
			.meta({
				description: "Additional metadata for the schema",
			})
			.optional(),
	});

	type Body = InferAdditionalFieldsFromPluginOptions<"schemaDefinition", O> &
		z.infer<typeof baseSchema>;

	return createAuthEndpoint(
		"/graph/schema-definition/create",
		{
			method: "POST",
			body: z.object({
				...baseSchema.shape,
				...additionalFieldsSchema.shape,
			}),
			use: [sessionMiddleware],
			metadata: {
				$Infer: {
					body: {} as Body,
				},
				openapi: {
					description: "Create a new schema definition",
					responses: {
						"200": {
							description: "Success",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											schemaDefinition: {
												type: "object",
												description: "The created schema definition",
											},
											success: {
												type: "boolean",
											},
										},
									},
								},
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session?.user) {
				throw new APIError("UNAUTHORIZED", {
					message: GRAPH_ERROR_CODES.UNAUTHORIZED,
				});
			}

			const adapter = getGraphAdapter(ctx.context, options as O);

			const schemaDefinition = await adapter.createSchemaDefinition({
				version: ctx.body.version,
				definition: ctx.body.definition,
				isActive: ctx.body.isActive ?? false,
				metadata: ctx.body.metadata || {},
				createdBy: session.user.id,
			});

			return ctx.json({ schemaDefinition, success: true });
		},
	);
};

export const updateSchemaDefinitionRoute = <O extends GraphOptions>(
	options?: O | undefined,
) => {
	const additionalFieldsSchema = toZodSchema({
		fields: options?.schema?.schemaDefinition?.additionalFields || {},
		isClientSide: true,
	});
	const baseSchema = z.object({
		id: z.string().min(1).meta({
			description: "The ID of the schema definition to update",
		}),
		version: z
			.string()
			.min(1)
			.meta({
				description: "The version identifier",
			})
			.optional(),
		definition: z
			.string()
			.min(1)
			.meta({
				description: "The raw .zed schema definition",
			})
			.optional(),
		isActive: z
			.boolean()
			.meta({
				description:
					"Whether this schema should be set as active (will deactivate others)",
			})
			.optional(),
		metadata: z
			.record(z.string(), z.any())
			.meta({
				description: "Additional metadata for the schema",
			})
			.optional(),
	});

	type Body = InferAdditionalFieldsFromPluginOptions<"schemaDefinition", O> &
		z.infer<typeof baseSchema>;

	return createAuthEndpoint(
		"/graph/schema-definition/update",
		{
			method: "POST",
			body: z.object({
				...baseSchema.shape,
				...additionalFieldsSchema.shape,
			}),
			use: [sessionMiddleware],
			metadata: {
				$Infer: {
					body: {} as Body,
				},
				openapi: {
					description: "Update a schema definition",
					responses: {
						"200": {
							description: "Success",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											schemaDefinition: {
												type: "object",
												description: "The updated schema definition",
											},
											success: {
												type: "boolean",
											},
										},
									},
								},
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session?.user) {
				throw new APIError("UNAUTHORIZED", {
					message: GRAPH_ERROR_CODES.UNAUTHORIZED,
				});
			}

			const adapter = getGraphAdapter(ctx.context, options as O);

			const schemaDefinition = await adapter.updateSchemaDefinition(
				ctx.body.id,
				{
					version: ctx.body.version,
					definition: ctx.body.definition,
					isActive: ctx.body.isActive,
					metadata: ctx.body.metadata,
				},
			);

			if (!schemaDefinition) {
				throw new APIError("NOT_FOUND", {
					message: GRAPH_ERROR_CODES.OBJECT_NOT_FOUND,
				});
			}

			return ctx.json({ schemaDefinition, success: true });
		},
	);
};

export const getSchemaDefinitionRoute = <O extends GraphOptions>(
	options?: O | undefined,
) => {
	const querySchema = z.object({
		id: z
			.string()
			.meta({
				description: "The ID of the schema definition",
			})
			.optional(),
		version: z
			.string()
			.meta({
				description: "The version of the schema definition",
			})
			.optional(),
		isActive: z
			.boolean()
			.meta({
				description: "Get the active schema definition",
			})
			.optional(),
	});

	return createAuthEndpoint(
		"/graph/schema-definition/get",
		{
			method: "GET",
			query: querySchema,
			use: [sessionMiddleware],
			metadata: {
				openapi: {
					description:
						"Get a schema definition by ID, version, or active status",
					responses: {
						"200": {
							description: "Success",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											schemaDefinition: {
												type: "object",
												description: "The schema definition",
											},
										},
									},
								},
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session?.user) {
				throw new APIError("UNAUTHORIZED", {
					message: GRAPH_ERROR_CODES.UNAUTHORIZED,
				});
			}

			const adapter = getGraphAdapter(ctx.context, options as O);

			const schemaDefinition = await adapter.findSchemaDefinition({
				id: ctx.query.id,
				version: ctx.query.version,
				isActive: ctx.query.isActive,
			});

			if (!schemaDefinition) {
				throw new APIError("NOT_FOUND", {
					message: GRAPH_ERROR_CODES.OBJECT_NOT_FOUND,
				});
			}

			return ctx.json({ schemaDefinition });
		},
	);
};

export const listSchemaDefinitionsRoute = <O extends GraphOptions>(
	options?: O | undefined,
) => {
	const querySchema = z.object({
		limit: z.coerce
			.number()
			.int()
			.positive()
			.max(100)
			.meta({
				description: "Maximum number of results to return",
			})
			.default(100)
			.optional(),
		offset: z.coerce
			.number()
			.int()
			.nonnegative()
			.meta({
				description: "Number of results to skip",
			})
			.default(0)
			.optional(),
	});

	return createAuthEndpoint(
		"/graph/schema-definition/list",
		{
			method: "GET",
			query: querySchema,
			use: [sessionMiddleware],
			metadata: {
				openapi: {
					description: "List all schema definitions",
					responses: {
						"200": {
							description: "Success",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											schemaDefinitions: {
												type: "array",
												items: {
													type: "object",
												},
											},
										},
									},
								},
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session?.user) {
				throw new APIError("UNAUTHORIZED", {
					message: GRAPH_ERROR_CODES.UNAUTHORIZED,
				});
			}

			const adapter = getGraphAdapter(ctx.context, options as O);

			const result = await adapter.listSchemaDefinitions({
				limit: ctx.query.limit || 100,
				offset: ctx.query.offset || 0,
			});

			return ctx.json({
				schemaDefinitions: result.schemaDefinitions,
				total: result.total,
			});
		},
	);
};

export const setActiveSchemaDefinitionRoute = <O extends GraphOptions>(
	options?: O | undefined,
) => {
	const bodySchema = z.object({
		id: z.string().min(1).meta({
			description: "The ID of the schema definition to set as active",
		}),
	});

	return createAuthEndpoint(
		"/graph/schema-definition/set-active",
		{
			method: "POST",
			body: bodySchema,
			use: [sessionMiddleware],
			metadata: {
				openapi: {
					description: "Set a schema definition as active",
					responses: {
						"200": {
							description: "Success",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											schemaDefinition: {
												type: "object",
												description: "The activated schema definition",
											},
											success: {
												type: "boolean",
											},
										},
									},
								},
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session?.user) {
				throw new APIError("UNAUTHORIZED", {
					message: GRAPH_ERROR_CODES.UNAUTHORIZED,
				});
			}

			const adapter = getGraphAdapter(ctx.context, options as O);

			const schemaDefinition = await adapter.setActiveSchemaDefinition(
				ctx.body.id,
			);

			if (!schemaDefinition) {
				throw new APIError("NOT_FOUND", {
					message: GRAPH_ERROR_CODES.OBJECT_NOT_FOUND,
				});
			}

			return ctx.json({ schemaDefinition, success: true });
		},
	);
};
