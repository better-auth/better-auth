import { createAuthEndpoint } from "@better-auth/core/api";
import * as z from "zod";
import { getGraphAdapter } from "../adapter";
import { GRAPH_ERROR_CODES } from "../error-codes";
import type { GraphOptions } from "../types";
import { requireSession } from "../utils";
import { APIError } from "better-call";

export const createRelationshipRoute = <O extends GraphOptions>(
	_options?: O,
) => {
	return createAuthEndpoint(
		"/graph/relationship/create",
		{
			method: "POST",
			body: z.object({
				subjectId: z.string().min(1),
				subjectType: z.string().min(1),
				objectId: z.string().min(1),
				objectType: z.string().min(1),
				relationshipType: z.string().min(1),
				attributes: z.record(z.string(), z.any()).optional(),
				metadata: z.record(z.string(), z.any()).optional(),
			}),
			metadata: {
				openapi: {
					description: "Create a relationship between two objects",
				},
			},
		},
		async (ctx) => {
			requireSession(ctx);
			const adapter = getGraphAdapter(ctx.context, _options);
			const relationship = await adapter.createRelationship({
				subjectId: ctx.body.subjectId,
				subjectType: ctx.body.subjectType,
				objectId: ctx.body.objectId,
				objectType: ctx.body.objectType,
				relationshipType: ctx.body.relationshipType,
				attributes: ctx.body.attributes,
				metadata: ctx.body.metadata,
			});
			return ctx.json({ relationshipId: relationship.id, success: true });
		},
	);
};

export const deleteRelationshipRoute = <O extends GraphOptions>(
	_options?: O,
) => {
	return createAuthEndpoint(
		"/graph/relationship/delete",
		{
			method: "POST",
			body: z.object({
				relationshipId: z.string().min(1),
			}),
			metadata: {
				openapi: {
					description: "Delete a relationship",
				},
			},
		},
		async (ctx) => {
			requireSession(ctx);
			const adapter = getGraphAdapter(ctx.context, _options);
			await adapter.deleteRelationship(ctx.body.relationshipId);
			return ctx.json({ success: true });
		},
	);
};

export const getRelationshipsRoute = <O extends GraphOptions>(
	_options?: O,
) => {
	return createAuthEndpoint(
		"/graph/relationships",
		{
			method: "GET",
			query: z.object({
				objectId: z.string().min(1),
				direction: z
					.enum(["incoming", "outgoing", "both"])
					.default("both")
					.optional(),
				relationshipType: z.string().optional(),
			}),
			metadata: {
				openapi: {
					description: "Get relationships for an object",
				},
			},
		},
		async (ctx) => {
			requireSession(ctx);
			const adapter = getGraphAdapter(ctx.context, _options);
			const relationships = await adapter.findRelationships({
				objectId: ctx.query.objectId,
				direction: ctx.query.direction || "both",
				relationshipType: ctx.query.relationshipType,
			});
			return ctx.json({ relationships });
		},
	);
};
