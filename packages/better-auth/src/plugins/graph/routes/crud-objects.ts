import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "better-call";
import * as z from "zod";
import { getSessionFromCtx, sessionMiddleware } from "../../../api";
import type { InferAdditionalFieldsFromPluginOptions } from "../../../db";
import { toZodSchema } from "../../../db/to-zod";
import { getGraphAdapter } from "../adapter";
import { GRAPH_ERROR_CODES } from "../error-codes";
import type { GraphOptions } from "../types";

export const getOrCreateObjectRoute = <O extends GraphOptions>(
	options?: O | undefined,
) => {
	const additionalFieldsSchema = toZodSchema({
		fields: options?.schema?.object?.additionalFields || {},
		isClientSide: true,
	});
	const baseSchema = z.object({
		type: z.string().min(1).meta({
			description: "The type of the object (e.g., 'user', 'organization')",
		}),
		externalId: z
			.string()
			.meta({
				description:
					"External ID reference to the actual entity (e.g., users.id)",
			})
			.optional(),
		externalType: z
			.string()
			.meta({
				description: "External type reference (e.g., 'users', 'organizations')",
			})
			.optional(),
		attributes: z
			.record(z.string(), z.any())
			.meta({
				description: "Attributes for ABAC (Attribute-Based Access Control)",
			})
			.optional(),
	});

	type Body = InferAdditionalFieldsFromPluginOptions<"object", O> &
		z.infer<typeof baseSchema>;

	return createAuthEndpoint(
		"/graph/object/get-or-create",
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
					description: "Get or create an object in the graph",
					responses: {
						"200": {
							description: "Success",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											objectId: {
												type: "string",
												description: "The ID of the object",
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
			const object = await adapter.getOrCreateObject({
				type: ctx.body.type,
				externalId: ctx.body.externalId,
				externalType: ctx.body.externalType,
				attributes: ctx.body.attributes as Record<string, unknown> | undefined,
			});

			return ctx.json({ objectId: object.id, success: true });
		},
	);
};

export const getObjectRoute = <O extends GraphOptions>(
	options?: O | undefined,
) => {
	const querySchema = z
		.object({
			id: z
				.string()
				.meta({
					description: "The ID of the object",
				})
				.optional(),
			externalId: z
				.string()
				.meta({
					description: "External ID reference",
				})
				.optional(),
			externalType: z
				.string()
				.meta({
					description: "External type reference",
				})
				.optional(),
		})
		.refine((data) => data.id || (data.externalId && data.externalType), {
			message: "Either id or both externalId and externalType are required",
		});

	return createAuthEndpoint(
		"/graph/object/get",
		{
			method: "GET",
			query: querySchema,
			use: [sessionMiddleware],
			metadata: {
				openapi: {
					description: "Get an object from the graph",
					responses: {
						"200": {
							description: "Success",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											object: {
												type: "object",
												description: "The object",
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

			let object;
			if (ctx.query.id) {
				object = await adapter.findObjectById(ctx.query.id);
			} else if (ctx.query.externalId && ctx.query.externalType) {
				object = await adapter.findObjectByExternal({
					externalId: ctx.query.externalId,
					externalType: ctx.query.externalType,
				});
			} else {
				throw new APIError("BAD_REQUEST", {
					message: GRAPH_ERROR_CODES.ID_OR_EXTERNAL_REQUIRED,
				});
			}

			if (!object) {
				throw new APIError("NOT_FOUND", {
					message: GRAPH_ERROR_CODES.OBJECT_NOT_FOUND,
				});
			}

			return ctx.json({ object });
		},
	);
};
