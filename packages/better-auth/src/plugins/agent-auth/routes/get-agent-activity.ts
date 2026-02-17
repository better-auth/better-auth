import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod";
import { getSessionFromCtx } from "../../../api";
import { AGENT_AUTH_ERROR_CODES as ERROR_CODES } from "../error-codes";

const ACTIVITY_TABLE = "agentActivity";

interface AgentActivity {
	id: string;
	agentId: string;
	userId: string;
	method: string;
	path: string;
	status: number | null;
	ipAddress: string | null;
	userAgent: string | null;
	createdAt: Date;
}

export function getAgentActivity() {
	return createAuthEndpoint(
		"/agent/activity",
		{
			method: "GET",
			query: z.object({
				agentId: z
					.string()
					.meta({ description: "Filter by agent ID" })
					.optional(),
				limit: z
					.string()
					.meta({
						description:
							"Maximum number of records to return (default 50, max 200)",
					})
					.optional(),
				offset: z
					.string()
					.meta({ description: "Number of records to skip (default 0)" })
					.optional(),
			}),
			requireHeaders: true,
			metadata: {
				openapi: {
					description:
						"List activity logs for agents owned by the current user. Optionally filter by agent ID.",
					responses: {
						"200": {
							description: "Activity log entries",
						},
					},
				},
			},
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session) {
				throw APIError.from("UNAUTHORIZED", ERROR_CODES.UNAUTHORIZED_SESSION);
			}

			const { agentId, limit: limitStr, offset: offsetStr } = ctx.query;
			const limit = Math.min(Number(limitStr) || 50, 200);
			const offset = Number(offsetStr) || 0;

			const where: Array<{ field: string; value: string }> = [
				{ field: "userId", value: session.user.id },
			];

			if (agentId) {
				where.push({ field: "agentId", value: agentId });
			}

			const activities = await ctx.context.adapter.findMany<AgentActivity>({
				model: ACTIVITY_TABLE,
				where,
				limit,
				offset,
				sortBy: { field: "createdAt", direction: "desc" },
			});

			return ctx.json(activities);
		},
	);
}
