import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod";
import { AGENT_AUTH_ERROR_CODES as ERROR_CODES } from "../error-codes";
import type { AgentSession } from "../types";

const ACTIVITY_TABLE = "agentActivity";

/**
 * POST /agent/log-activity
 *
 * Lets an agent report its own activity (e.g. gateway tool calls that
 * don't hit the app's HTTP layer). Authenticated via agent JWT — the
 * agentId and userId are extracted from the verified session, so agents
 * can only log activity for themselves.
 */
export function logActivity() {
	return createAuthEndpoint(
		"/agent/log-activity",
		{
			method: "POST",
			body: z.object({
				method: z
					.string()
					.meta({ description: 'HTTP method or "TOOL" for gateway calls' }),
				path: z.string().meta({
					description: "Request path or tool name (e.g. github.create_issue)",
				}),
				status: z
					.number()
					.optional()
					.meta({ description: "Response status code (null if N/A)" }),
			}),
			requireHeaders: true,
			metadata: {
				openapi: {
					description:
						"Report agent activity (authenticated via agent JWT). Used by the MCP gateway to log tool calls.",
					responses: {
						200: { description: "Activity logged" },
					},
				},
			},
		},
		async (ctx) => {
			const agentSession = ctx.context.agentSession as AgentSession | undefined;

			if (!agentSession) {
				throw APIError.from("UNAUTHORIZED", ERROR_CODES.UNAUTHORIZED_SESSION);
			}

			await ctx.context.adapter.create({
				model: ACTIVITY_TABLE,
				data: {
					agentId: agentSession.agent.id,
					userId: agentSession.user.id,
					method: ctx.body.method,
					path: ctx.body.path,
					status: ctx.body.status ?? null,
					ipAddress:
						ctx.headers?.get("x-forwarded-for") ??
						ctx.headers?.get("x-real-ip") ??
						null,
					userAgent: ctx.headers?.get("user-agent") ?? null,
					createdAt: new Date(),
				},
			});

			return ctx.json({ success: true });
		},
	);
}
