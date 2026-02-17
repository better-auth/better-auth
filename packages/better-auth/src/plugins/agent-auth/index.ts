import type { BetterAuthPlugin } from "@better-auth/core";
import { createAuthMiddleware } from "@better-auth/core/api";
import { decodeJwt } from "jose";
import { APIError } from "../../api";
import { mergeSchema } from "../../db";
import { verifyAgentJWT } from "./crypto";
import { AGENT_AUTH_ERROR_CODES } from "./error-codes";
import { createAgentRoutes } from "./routes";
import { agentSchema } from "./schema";
import type {
	Agent,
	AgentAuthOptions,
	AgentSession,
	ResolvedAgentAuthOptions,
} from "./types";

declare module "@better-auth/core" {
	interface BetterAuthPluginRegistry<AuthOptions, Options> {
		"agent-auth": {
			creator: typeof agentAuth;
		};
	}
}

export { AGENT_AUTH_ERROR_CODES } from "./error-codes";

const AGENT_TABLE = "agent";

export const agentAuth = (options?: AgentAuthOptions) => {
	const opts: ResolvedAgentAuthOptions = {
		...options,
		allowedKeyAlgorithms: options?.allowedKeyAlgorithms ?? ["Ed25519"],
		jwtFormat: options?.jwtFormat ?? "simple",
		jwtMaxAge: options?.jwtMaxAge ?? 60,
	};

	const schema = mergeSchema(agentSchema(), opts.schema);

	const routes = createAgentRoutes(opts);

	return {
		id: "agent-auth",
		$ERROR_CODES: AGENT_AUTH_ERROR_CODES,
		hooks: {
			before: [
				{
					matcher: (ctx) => {
						const auth = ctx.headers?.get("authorization");
						if (!auth) return false;
						const bearer = auth.replace(/^Bearer\s+/i, "");
						if (!bearer || bearer === auth) return false;
						// Check if it looks like a JWT (three dot-separated segments)
						return bearer.split(".").length === 3;
					},
					handler: createAuthMiddleware(async (ctx) => {
						const bearer = ctx.headers
							?.get("authorization")
							?.replace(/^Bearer\s+/i, "")!;

						// Decode JWT payload without verification to get the agentId (sub)
						let agentId: string;
						try {
							const payload = decodeJwt(bearer);
							if (!payload.sub) {
								throw APIError.from(
									"UNAUTHORIZED",
									AGENT_AUTH_ERROR_CODES.INVALID_JWT,
								);
							}
							agentId = payload.sub;
						} catch {
							throw APIError.from(
								"UNAUTHORIZED",
								AGENT_AUTH_ERROR_CODES.INVALID_JWT,
							);
						}

						// Look up the agent by ID
						const agent = await ctx.context.adapter.findOne<Agent>({
							model: AGENT_TABLE,
							where: [{ field: "id", value: agentId }],
						});

						if (!agent) {
							throw APIError.from(
								"UNAUTHORIZED",
								AGENT_AUTH_ERROR_CODES.AGENT_NOT_FOUND,
							);
						}

						if (agent.status !== "active") {
							throw APIError.from(
								"UNAUTHORIZED",
								AGENT_AUTH_ERROR_CODES.AGENT_REVOKED,
							);
						}

						// Verify the JWT signature with the agent's stored public key
						const publicKey = JSON.parse(agent.publicKey);
						const payload = await verifyAgentJWT({
							jwt: bearer,
							publicKey,
							maxAge: opts.jwtMaxAge,
						});

						if (!payload) {
							throw APIError.from(
								"UNAUTHORIZED",
								AGENT_AUTH_ERROR_CODES.INVALID_JWT,
							);
						}

						// Load the user who owns this agent
						const user = await ctx.context.internalAdapter.findUserById(
							agent.userId,
						);
						if (!user) {
							throw APIError.from(
								"UNAUTHORIZED",
								AGENT_AUTH_ERROR_CODES.AGENT_NOT_FOUND,
							);
						}

						// Build agent session
						const agentSession: AgentSession = {
							agent: {
								id: agent.id,
								name: agent.name,
								scopes:
									typeof agent.scopes === "string"
										? JSON.parse(agent.scopes)
										: agent.scopes,
								role: agent.role,
								orgId: agent.orgId,
								createdAt: agent.createdAt,
								metadata:
									typeof agent.metadata === "string"
										? JSON.parse(agent.metadata)
										: agent.metadata,
							},
							user: {
								id: user.id,
								name: user.name,
								email: user.email,
							},
						};

						// Attach agent session to context
						(ctx.context as Record<string, unknown>).agentSession =
							agentSession;

						// Update lastUsedAt in background
						ctx.context.runInBackground(
							ctx.context.adapter
								.update({
									model: AGENT_TABLE,
									where: [{ field: "id", value: agent.id }],
									update: { lastUsedAt: new Date() },
								})
								.catch(() => {}),
						);

						// For get-agent-session endpoint, return the session directly
						if (ctx.path === "/agent/get-session") {
							return agentSession;
						}

						return { context: ctx };
					}),
				},
			],
		},
		endpoints: {
			createAgent: routes.createAgent,
			listAgents: routes.listAgents,
			getAgent: routes.getAgent,
			updateAgent: routes.updateAgent,
			revokeAgent: routes.revokeAgent,
			rotateKey: routes.rotateKey,
			getAgentSession: routes.getAgentSession,
		},
		schema,
		options,
	} satisfies BetterAuthPlugin;
};

export type * from "./types";
