import { createAuthEndpoint } from "@better-auth/core/api";
import type { Agent } from "../types";

const AGENT_TABLE = "agent";

/**
 * Batch-revoke agents whose expiresAt has passed.
 * Intended to be called by a cron job or admin trigger.
 * Returns the number of agents revoked.
 */
export function cleanupAgents() {
	return createAuthEndpoint(
		"/agent/cleanup",
		{
			method: "POST",
			metadata: {
				openapi: {
					description:
						"Revoke all agents whose session TTL has expired. Call from a cron job or admin panel.",
				},
			},
		},
		async (ctx) => {
			const now = new Date();

			const expired = await ctx.context.adapter.findMany<Agent>({
				model: AGENT_TABLE,
				where: [
					{ field: "status", value: "active" },
					{ field: "expiresAt", value: now, operator: "lt" },
				],
			});

			let revoked = 0;
			for (const agent of expired) {
				await ctx.context.adapter.update({
					model: AGENT_TABLE,
					where: [{ field: "id", value: agent.id }],
					update: {
						status: "revoked",
						publicKey: "",
						kid: null,
						updatedAt: now,
					},
				});
				revoked++;
			}

			return ctx.json({ revoked });
		},
	);
}
