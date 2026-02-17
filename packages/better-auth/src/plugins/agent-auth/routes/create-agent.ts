import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod";
import { getSessionFromCtx } from "../../../api";
import { AGENT_AUTH_ERROR_CODES as ERROR_CODES } from "../error-codes";
import type { Agent, ResolvedAgentAuthOptions } from "../types";

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
	role: z.string().meta({ description: "Role name for the agent" }).optional(),
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
			// Try cookie-based session first
			let session = await getSessionFromCtx(ctx);

			// Fallback: check Authorization header for a Bearer session token
			// This supports the device authorization flow where the agent script
			// receives a session token from /device/token and needs to create itself
			if (!session) {
				const authHeader = ctx.headers?.get("authorization");
				if (authHeader) {
					const token = authHeader.replace(/^Bearer\s+/i, "");
					if (token && token !== authHeader) {
						const dbSession =
							await ctx.context.internalAdapter.findSession(token);
						if (
							dbSession &&
							new Date(dbSession.session.expiresAt) > new Date()
						) {
							session = {
								session: dbSession.session,
								user: dbSession.user,
							} as typeof session;
						}
					}
				}
			}

			if (!session) {
				throw APIError.from("UNAUTHORIZED", ERROR_CODES.UNAUTHORIZED_SESSION);
			}

			const { name, publicKey, scopes, role, orgId, metadata } = ctx.body;

			if (!publicKey.kty || !publicKey.x) {
				throw APIError.from("BAD_REQUEST", ERROR_CODES.INVALID_PUBLIC_KEY);
			}

			const resolvedRole = role ?? opts.defaultRole ?? null;
			const resolvedScopes =
				scopes ?? (resolvedRole && opts.roles?.[resolvedRole]) ?? [];

			const now = new Date();
			const kid = (publicKey.kid as string) ?? null;

			// Check if an agent with the same kid already exists for this user
			// This makes the endpoint idempotent — reconnecting with the same
			// keypair reuses/reactivates the existing agent instead of creating duplicates
			if (kid) {
				const existing = await ctx.context.adapter.findOne<Agent>({
					model: AGENT_TABLE,
					where: [
						{ field: "kid", value: kid },
						{ field: "userId", value: session.user.id },
					],
				});

				if (existing) {
					// Reactivate and update the existing agent
					await ctx.context.adapter.update({
						model: AGENT_TABLE,
						where: [{ field: "id", value: existing.id }],
						update: {
							name,
							scopes: JSON.stringify(resolvedScopes),
							role: resolvedRole,
							status: "active",
							publicKey: JSON.stringify(publicKey),
							metadata: metadata ? JSON.stringify(metadata) : null,
							updatedAt: now,
						},
					});

					return ctx.json({
						agentId: existing.id,
						name,
						scopes: resolvedScopes,
						role: resolvedRole,
					});
				}
			}

			const agent = await ctx.context.adapter.create<
				Record<string, unknown>,
				Agent
			>({
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
