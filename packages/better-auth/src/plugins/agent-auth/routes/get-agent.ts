import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod";
import { getSessionFromCtx } from "../../../api";
import { AGENT_AUTH_ERROR_CODES as ERROR_CODES } from "../error-codes";
import type { Agent } from "../types";

const AGENT_TABLE = "agent";

export function getAgent() {
	return createAuthEndpoint(
		"/agent/get",
		{
			method: "GET",
			query: z.object({
				agentId: z.string(),
			}),
			metadata: {
				openapi: {
					description: "Get details for a single agent (no secrets returned)",
				},
			},
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session) {
				throw APIError.from("UNAUTHORIZED", ERROR_CODES.UNAUTHORIZED_SESSION);
			}

			const agent = await ctx.context.adapter.findOne<Agent>({
				model: AGENT_TABLE,
				where: [
					{ field: "id", value: ctx.query.agentId },
					{ field: "userId", value: session.user.id },
				],
			});

			if (!agent) {
				throw APIError.from("NOT_FOUND", ERROR_CODES.AGENT_NOT_FOUND);
			}

			return ctx.json({
				id: agent.id,
				name: agent.name,
				status: agent.status,
				scopes:
					typeof agent.scopes === "string"
						? JSON.parse(agent.scopes)
						: agent.scopes,
				role: agent.role,
				orgId: agent.orgId,
				lastUsedAt: agent.lastUsedAt,
				createdAt: agent.createdAt,
				updatedAt: agent.updatedAt,
				metadata:
					typeof agent.metadata === "string"
						? JSON.parse(agent.metadata)
						: agent.metadata,
			});
		},
	);
}
