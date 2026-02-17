import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod";
import { getSessionFromCtx } from "../../../api";
import { AGENT_AUTH_ERROR_CODES as ERROR_CODES } from "../error-codes";
import type { Agent } from "../types";

const AGENT_TABLE = "agent";

const updateAgentBodySchema = z.object({
	agentId: z.string(),
	name: z.string().min(1).optional(),
	scopes: z.array(z.string()).optional(),
	role: z.string().optional(),
	metadata: z.record(z.string(), z.unknown()).optional(),
});

export function updateAgent() {
	return createAuthEndpoint(
		"/agent/update",
		{
			method: "POST",
			body: updateAgentBodySchema,
			metadata: {
				openapi: {
					description: "Update an agent's name, scopes, role, or metadata",
				},
			},
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session) {
				throw APIError.from("UNAUTHORIZED", ERROR_CODES.UNAUTHORIZED_SESSION);
			}

			const { agentId, name, scopes, role, metadata } = ctx.body;

			const agent = await ctx.context.adapter.findOne<Agent>({
				model: AGENT_TABLE,
				where: [
					{ field: "id", value: agentId },
					{ field: "userId", value: session.user.id },
				],
			});

			if (!agent) {
				throw APIError.from("NOT_FOUND", ERROR_CODES.AGENT_NOT_FOUND);
			}

			const updates: Record<string, unknown> = {
				updatedAt: new Date(),
			};

			if (name !== undefined) updates.name = name;
			if (scopes !== undefined) updates.scopes = JSON.stringify(scopes);
			if (role !== undefined) updates.role = role;
			if (metadata !== undefined) updates.metadata = JSON.stringify(metadata);

			const updated = await ctx.context.adapter.update<Agent>({
				model: AGENT_TABLE,
				where: [{ field: "id", value: agentId }],
				update: updates,
			});

			if (!updated) {
				throw APIError.from("NOT_FOUND", ERROR_CODES.AGENT_NOT_FOUND);
			}

			const parsedScopes =
				typeof updated.scopes === "string"
					? JSON.parse(updated.scopes)
					: updated.scopes;
			const parsedMetadata =
				typeof updated.metadata === "string"
					? JSON.parse(updated.metadata)
					: updated.metadata;

			return ctx.json({
				id: updated.id,
				name: updated.name,
				scopes: parsedScopes,
				role: updated.role,
				status: updated.status,
				metadata: parsedMetadata,
				updatedAt: updated.updatedAt,
			});
		},
	);
}
