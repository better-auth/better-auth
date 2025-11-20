import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "better-call";
import * as z from "zod";
import { getSessionFromCtx, sessionMiddleware } from "../../../api";
import type { InferAdditionalFieldsFromPluginOptions } from "../../../db";
import { toZodSchema } from "../../../db/to-zod";
import { getGraphAdapter } from "../adapter";
import { GRAPH_ERROR_CODES } from "../error-codes";
import type { GraphOptions } from "../types";

export const createRelationshipRoute = <O extends GraphOptions>(
	options?: O | undefined,
) => {
	const additionalFieldsSchema = toZodSchema({
		fields: options?.schema?.relationship?.additionalFields || {},
		isClientSide: true,
	});
	const baseSchema = z.object({
		subjectId: z.string().min(1).meta({
			description: "The ID of the subject object",
		}),
		objectId: z.string().min(1).meta({
			description: "The ID of the object",
		}),
		subjectType: z.string().min(1).meta({
			description: "The type of the subject object",
		}),
		objectType: z.string().min(1).meta({
			description: "The type of the object",
		}),
		relationshipType: z.string().min(1).meta({
			description: "The type of relationship",
		}),
		attributes: z
			.record(z.string(), z.any())
			.meta({
				description: "Attributes for the relationship",
			})
			.optional(),
	});

	type Body = InferAdditionalFieldsFromPluginOptions<"relationship", O> &
		z.infer<typeof baseSchema>;

	return createAuthEndpoint(
		"/graph/relationship/create",
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
					description: "Create a relationship between two objects",
					responses: {
						"200": {
							description: "Success",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											relationshipId: {
												type: "string",
												description: "The ID of the created relationship",
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
			const relationship = await adapter.createRelationship({
				subjectId: ctx.body.subjectId,
				subjectType: ctx.body.subjectType,
				objectId: ctx.body.objectId,
				objectType: ctx.body.objectType,
				relationshipType: ctx.body.relationshipType,
				attributes: ctx.body.attributes as Record<string, unknown> | undefined,
			});

			return ctx.json({ relationshipId: relationship.id, success: true });
		},
	);
};

export const deleteRelationshipRoute = <O extends GraphOptions>(
	options?: O | undefined,
) => {
	const bodySchema = z.object({
		relationshipId: z.string().min(1).meta({
			description: "The ID of the relationship to delete",
		}),
	});

	return createAuthEndpoint(
		"/graph/relationship/delete",
		{
			method: "POST",
			body: bodySchema,
			use: [sessionMiddleware],
			metadata: {
				openapi: {
					description: "Delete a relationship",
					responses: {
						"200": {
							description: "Success",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
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
			await adapter.deleteRelationship(ctx.body.relationshipId);

			return ctx.json({ success: true });
		},
	);
};

export const getRelationshipsRoute = <O extends GraphOptions>(
	options?: O | undefined,
) => {
	const querySchema = z.object({
		objectId: z.string().min(1).meta({
			description: "The ID of the object to get relationships for",
		}),
		direction: z
			.enum(["incoming", "outgoing", "both"])
			.meta({
				description: "The direction of relationships to retrieve",
			})
			.default("both")
			.optional(),
		relationshipType: z
			.string()
			.meta({
				description: "Filter by relationship type",
			})
			.optional(),
	});

	return createAuthEndpoint(
		"/graph/relationships",
		{
			method: "GET",
			query: querySchema,
			use: [sessionMiddleware],
			metadata: {
				openapi: {
					description: "Get relationships for an object",
					responses: {
						"200": {
							description: "Success",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											relationships: {
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
			const relationships = await adapter.findRelationships({
				objectId: ctx.query.objectId,
				direction: ctx.query.direction || "both",
				relationshipType: ctx.query.relationshipType,
			});

			return ctx.json({ relationships });
		},
	);
};

// export const findPathRoute = <O extends GraphOptions>(
// 	options?: O | undefined,
// ) => {
// 	const querySchema = z.object({
// 		subjectId: z.string().min(1).meta({
// 			description: "The ID of the subject object",
// 		}),
// 		objectId: z.string().min(1).meta({
// 			description: "The ID of the target object",
// 		}),
// 		maxDepth: z.coerce
// 			.number()
// 			.int()
// 			.positive()
// 			.max(50)
// 			.meta({
// 				description: "Maximum depth for path traversal",
// 			})
// 			.default(10)
// 			.optional(),
// 		relationshipTypes: z
// 			.string()
// 			.meta({
// 				description: "Comma-separated list of allowed relationship types",
// 			})
// 			.optional(),
// 	});

// 	return createAuthEndpoint(
// 		"/graph/path",
// 		{
// 			method: "GET",
// 			query: querySchema,
// 			use: [sessionMiddleware],
// 			metadata: {
// 				openapi: {
// 					description: "Find path between two objects using graph traversal",
// 					responses: {
// 						"200": {
// 							description: "Success",
// 							content: {
// 								"application/json": {
// 									schema: {
// 										type: "object",
// 										properties: {
// 											paths: {
// 												type: "array",
// 												items: {
// 													type: "object",
// 												},
// 											},
// 										},
// 									},
// 								},
// 							},
// 						},
// 					},
// 				},
// 			},
// 		},
// 		async (ctx) => {
// 			const session = await getSessionFromCtx(ctx);
// 			if (!session?.user) {
// 				throw new APIError("UNAUTHORIZED", {
// 					message: GRAPH_ERROR_CODES.UNAUTHORIZED,
// 				});
// 			}

// 			const allowedTypes = ctx.query.relationshipTypes
// 				? ctx.query.relationshipTypes.split(",")
// 				: undefined;

// 			const paths = await findPath(
// 				ctx.query.subjectId,
// 				ctx.query.objectId,
// 				ctx.query.maxDepth || 10,
// 				allowedTypes,
// 			);

// 			return ctx.json({ paths });
// 		},
// 	);
// };
