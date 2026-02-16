import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod";
import { getSessionFromCtx } from "../../../api";
import { AGENT_AUTH_ERROR_CODES as ERROR_CODES } from "../error-codes";
import type { ResolvedAgentAuthOptions, Agent } from "../types";

const AGENT_TABLE = "agent";

const createAgentBodySchema = z.object({
	name: z.string().min(1).meta({ description: "Friendly name for the agent" }),
	publicKey: z
		.record(z.string(), z.unknown())
		.meta({ description: "Agent's Ed25519 public key as JWK" }),
	scopes: z
		.array(z.string())
		.meta({ description: "Scope strings the agent is granted" })
		.optional(),
	role: z
		.string()
		.meta({ description: "Role name for the agent" })
		.optional(),
	orgId: z
		.string()
		.meta({ description: "Organization ID (if org-scoped)" })
		.optional(),
	metadata: z
		.record(z.string(), z.unknown())
		.meta({ description: "Optional metadata" })
		.optional(),
});

export function createAgent(opts: ResolvedAgentAuthOptions) {
	return createAuthEndpoint(
		"/agent/create",
		{
			method: "POST",
			body: createAgentBodySchema,
			metadata: {
				openapi: {
					description:
						"Register a new agent with its public key. The agent generates its own keypair — the private key never touches the server.",
					responses: {
						"200": {
							description: "Agent created successfully",
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

			const { name, publicKey, scopes, role, orgId, metadata } = ctx.body;

			if (!publicKey.kty || !publicKey.x) {
				throw APIError.from("BAD_REQUEST", ERROR_CODES.INVALID_PUBLIC_KEY);
			}

			const resolvedScopes =
				scopes ?? (role && opts.roles?.[role]) ?? [];
			const resolvedRole = role ?? opts.defaultRole ?? null;

			const now = new Date();
			const kid = (publicKey.kid as string) ?? null;

			const agent = await ctx.context.adapter.create<Record<string, unknown>, Agent>({
				model: AGENT_TABLE,
				data: {
					name,
					userId: session.user.id,
					orgId: orgId ?? null,
					scopes: JSON.stringify(resolvedScopes),
					role: resolvedRole,
					status: "active",
					publicKey: JSON.stringify(publicKey),
					kid,
					lastUsedAt: null,
					metadata: metadata ? JSON.stringify(metadata) : null,
					createdAt: now,
					updatedAt: now,
				},
			});

			return ctx.json({
				agentId: agent.id,
				name: agent.name,
				scopes: resolvedScopes,
				role: resolvedRole,
			});
		},
	);
}
