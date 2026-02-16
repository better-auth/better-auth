import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod";
import { getSessionFromCtx } from "../../../api";
import { AGENT_AUTH_ERROR_CODES as ERROR_CODES } from "../error-codes";
import type { Agent } from "../types";

const AGENT_TABLE = "agent";

export function revokeAgent() {
	return createAuthEndpoint(
		"/agent/revoke",
		{
			method: "POST",
			body: z.object({
				agentId: z.string(),
			}),
			metadata: {
				openapi: {
					description:
						"Revoke an agent. Wipes credential material and sets status to revoked.",
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
					{ field: "id", value: ctx.body.agentId },
					{ field: "userId", value: session.user.id },
				],
			});

			if (!agent) {
				throw APIError.from("NOT_FOUND", ERROR_CODES.AGENT_NOT_FOUND);
			}

			await ctx.context.adapter.update<Agent>({
				model: AGENT_TABLE,
				where: [{ field: "id", value: ctx.body.agentId }],
				update: {
					status: "revoked",
					publicKey: "",
					kid: null,
					updatedAt: new Date(),
				},
			});

			return ctx.json({ success: true });
		},
	);
}
