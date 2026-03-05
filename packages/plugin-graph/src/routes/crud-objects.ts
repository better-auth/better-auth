import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "better-call";
import * as z from "zod";
import { getGraphAdapter } from "../adapter";
import { GRAPH_ERROR_CODES } from "../error-codes";
import type { GraphOptions } from "../types";
import { requireSession } from "../utils";

export const getOrCreateObjectRoute = <O extends GraphOptions>(
	_options?: O,
) => {
	return createAuthEndpoint(
		"/graph/object/get-or-create",
		{
			method: "POST",
			body: z.object({
				type: z.string().min(1),
				externalId: z.string().optional(),
				externalType: z.string().optional(),
				attributes: z.record(z.string(), z.any()).optional(),
			}),
			metadata: {
				openapi: {
					description: "Get or create an object in the graph",
				},
			},
		},
		async (ctx) => {
			requireSession(ctx);
			const adapter = getGraphAdapter(ctx.context, _options);
			const object = await adapter.getOrCreateObject({
				type: ctx.body.type,
				externalId: ctx.body.externalId,
				externalType: ctx.body.externalType,
				attributes: ctx.body.attributes,
			});
			return ctx.json({ objectId: object.id, success: true });
		},
	);
};

export const getObjectRoute = <O extends GraphOptions>(_options?: O) => {
	return createAuthEndpoint(
		"/graph/object/get",
		{
			method: "GET",
			query: z.object({
				id: z.string().optional(),
				externalId: z.string().optional(),
				externalType: z.string().optional(),
			}),
			metadata: {
				openapi: {
					description: "Get an object from the graph",
				},
			},
		},
		async (ctx) => {
			requireSession(ctx);
			const adapter = getGraphAdapter(ctx.context, _options);

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
