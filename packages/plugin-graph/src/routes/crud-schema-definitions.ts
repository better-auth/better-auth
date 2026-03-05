import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "better-call";
import * as z from "zod";
import { getGraphAdapter } from "../adapter";
import { GRAPH_ERROR_CODES } from "../error-codes";
import type { GraphOptions } from "../types";
import { requireSession } from "../utils";

export const createSchemaDefinitionRoute = <O extends GraphOptions>(
	_options?: O,
) => {
	return createAuthEndpoint(
		"/graph/schema-definition/create",
		{
			method: "POST",
			body: z.object({
				version: z.string().min(1),
				definition: z.string().min(1),
				isActive: z.boolean().default(false).optional(),
				metadata: z.record(z.string(), z.any()).optional(),
			}),
			metadata: {
				openapi: {
					description: "Create a new schema definition",
				},
			},
		},
		async (ctx) => {
			const session = requireSession(ctx);
			const adapter = getGraphAdapter(ctx.context, _options);
			const schemaDefinition = await adapter.createSchemaDefinition({
				version: ctx.body.version,
				definition: ctx.body.definition,
				isActive: ctx.body.isActive ?? false,
				metadata: ctx.body.metadata,
				createdBy: session.user.id,
			});
			return ctx.json({ schemaDefinition, success: true });
		},
	);
};

export const updateSchemaDefinitionRoute = <O extends GraphOptions>(
	_options?: O,
) => {
	return createAuthEndpoint(
		"/graph/schema-definition/update",
		{
			method: "POST",
			body: z.object({
				id: z.string().min(1),
				version: z.string().min(1).optional(),
				definition: z.string().min(1).optional(),
				isActive: z.boolean().optional(),
				metadata: z.record(z.string(), z.any()).optional(),
			}),
			metadata: {
				openapi: {
					description: "Update a schema definition",
				},
			},
		},
		async (ctx) => {
			requireSession(ctx);
			const adapter = getGraphAdapter(ctx.context, _options);
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
					message: GRAPH_ERROR_CODES.SCHEMA_NOT_FOUND,
				});
			}
			return ctx.json({ schemaDefinition, success: true });
		},
	);
};

export const getSchemaDefinitionRoute = <O extends GraphOptions>(
	_options?: O,
) => {
	return createAuthEndpoint(
		"/graph/schema-definition/get",
		{
			method: "GET",
			query: z.object({
				id: z.string().min(1),
			}),
			metadata: {
				openapi: {
					description: "Get a schema definition by ID",
				},
			},
		},
		async (ctx) => {
			requireSession(ctx);
			const adapter = getGraphAdapter(ctx.context, _options);
			const schemaDefinition = await adapter.findSchemaDefinitionById(
				ctx.query.id,
			);
			if (!schemaDefinition) {
				throw new APIError("NOT_FOUND", {
					message: GRAPH_ERROR_CODES.SCHEMA_NOT_FOUND,
				});
			}
			return ctx.json({ schemaDefinition });
		},
	);
};

export const listSchemaDefinitionsRoute = <O extends GraphOptions>(
	_options?: O,
) => {
	return createAuthEndpoint(
		"/graph/schema-definitions",
		{
			method: "GET",
			query: z.object({
				isActive: z
					.string()
					.transform((v) => v === "true")
					.optional(),
				limit: z.coerce.number().int().positive().max(100).default(50).optional(),
				offset: z.coerce.number().int().min(0).default(0).optional(),
			}),
			metadata: {
				openapi: {
					description: "List schema definitions",
				},
			},
		},
		async (ctx) => {
			requireSession(ctx);
			const adapter = getGraphAdapter(ctx.context, _options);
			const definitions = await adapter.listSchemaDefinitions({
				isActive: ctx.query.isActive,
				limit: ctx.query.limit,
				offset: ctx.query.offset,
			});
			return ctx.json({ definitions });
		},
	);
};

export const setActiveSchemaDefinitionRoute = <O extends GraphOptions>(
	_options?: O,
) => {
	return createAuthEndpoint(
		"/graph/schema-definition/set-active",
		{
			method: "POST",
			body: z.object({
				id: z.string().min(1),
			}),
			metadata: {
				openapi: {
					description: "Set a schema definition as active",
				},
			},
		},
		async (ctx) => {
			requireSession(ctx);
			const adapter = getGraphAdapter(ctx.context, _options);
			const schemaDefinition = await adapter.setActiveSchemaDefinition(
				ctx.body.id,
			);
			if (!schemaDefinition) {
				throw new APIError("NOT_FOUND", {
					message: GRAPH_ERROR_CODES.SCHEMA_NOT_FOUND,
				});
			}
			return ctx.json({ schemaDefinition, success: true });
		},
	);
};
