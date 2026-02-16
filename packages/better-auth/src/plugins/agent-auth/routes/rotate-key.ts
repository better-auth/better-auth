import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod";
import { getSessionFromCtx } from "../../../api";
import { AGENT_AUTH_ERROR_CODES as ERROR_CODES } from "../error-codes";
import type { Agent } from "../types";

const AGENT_TABLE = "agent";

export function rotateKey() {
	return createAuthEndpoint(
		"/agent/rotate-key",
		{
			method: "POST",
			body: z.object({
				agentId: z.string(),
				publicKey: z.record(z.string(), z.unknown()),
			}),
			metadata: {
				openapi: {
					description:
						"Accept a new public key for an agent. Old key stops working immediately.",
				},
			},
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session) {
				throw APIError.from("UNAUTHORIZED", ERROR_CODES.UNAUTHORIZED_SESSION);
			}

			const { agentId, publicKey } = ctx.body;

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

			if (!publicKey.kty || !publicKey.x) {
				throw APIError.from("BAD_REQUEST", ERROR_CODES.INVALID_PUBLIC_KEY);
			}

			const kid = (publicKey.kid as string) ?? null;

			await ctx.context.adapter.update<Agent>({
				model: AGENT_TABLE,
				where: [{ field: "id", value: agentId }],
				update: {
					publicKey: JSON.stringify(publicKey),
					kid,
					updatedAt: new Date(),
				},
			});

			return ctx.json({ success: true });
		},
	);
}
