import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod";
import { getSessionFromCtx } from "../../../api";
import { AGENT_AUTH_ERROR_CODES as ERROR_CODES } from "../error-codes";
import type { Agent } from "../types";

const AGENT_TABLE = "agent";

export function listAgents() {
	return createAuthEndpoint(
		"/agent/list",
		{
			method: "GET",
			query: z.object({
				orgId: z.string().optional(),
			}).optional(),
			metadata: {
				openapi: {
					description: "List agents for the current user",
				},
			},
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session) {
				throw APIError.from("UNAUTHORIZED", ERROR_CODES.UNAUTHORIZED_SESSION);
			}

			const where: Array<{ field: string; value: unknown }> = [
				{ field: "userId", value: session.user.id },
			];

			if (ctx.query?.orgId) {
				where.push({ field: "orgId", value: ctx.query.orgId });
			}

			const agents = await ctx.context.adapter.findMany<Agent>({
				model: AGENT_TABLE,
				where,
			});

			return ctx.json(
				agents.map((agent) => ({
					id: agent.id,
					name: agent.name,
					status: agent.status,
					scopes: agent.scopes,
					role: agent.role,
					orgId: agent.orgId,
					lastUsedAt: agent.lastUsedAt,
					createdAt: agent.createdAt,
					updatedAt: agent.updatedAt,
					metadata: agent.metadata,
				})),
			);
		},
	);
}
