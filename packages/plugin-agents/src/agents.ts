import type { BetterAuthPlugin } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import { getCurrentAdapter } from "@better-auth/core/context";
import { APIError } from "better-call";
import * as z from "zod";

export const AGENTS_ERROR_CODES = {
	UNAUTHORIZED: "AGENTS_UNAUTHORIZED",
	NAME_REQUIRED: "AGENTS_NAME_REQUIRED",
	AGENT_NOT_FOUND: "AGENTS_AGENT_NOT_FOUND",
	FORBIDDEN: "AGENTS_FORBIDDEN",
	ORGANIZATION_ID_REQUIRED: "AGENTS_ORGANIZATION_ID_REQUIRED",
	NOT_MEMBER_OF_ORGANIZATION: "AGENTS_NOT_MEMBER_OF_ORGANIZATION",
	FAILED_TO_UPDATE: "AGENTS_FAILED_TO_UPDATE",
} as const;

export interface AgentsOptions {
	/** Restrict agent types beyond the defaults */
	allowedTypes?: string[];
}

function requireSession(ctx: {
	context: { session: { user: { id: string } } | null };
}) {
	if (!ctx.context.session?.user) {
		throw new APIError("UNAUTHORIZED", {
			message: AGENTS_ERROR_CODES.UNAUTHORIZED,
		});
	}
	return ctx.context.session;
}

function parseJSON(value: unknown): Record<string, any> | null {
	if (value == null) return null;
	if (typeof value === "string") {
		try {
			return JSON.parse(value);
		} catch {
			return null;
		}
	}
	return value as Record<string, any>;
}

function formatAgent(agent: Record<string, any>) {
	return {
		id: agent.id,
		name: agent.name,
		type: agent.type || "custom",
		status: agent.status || "active",
		configuration: parseJSON(agent.configuration),
		ownerId: agent.ownerId || null,
		ownerType: agent.ownerType || "user",
		organizationId: agent.organizationId || null,
		metadata: parseJSON(agent.metadata),
		createdAt: agent.createdAt,
		updatedAt: agent.updatedAt,
	};
}

const createAgentBody = z.object({
	name: z.string().min(1),
	type: z
		.enum([
			"ai_assistant",
			"service_account",
			"bot",
			"workflow",
			"integration",
			"custom",
		])
		.optional(),
	status: z.enum(["active", "inactive", "suspended", "deleted"]).optional(),
	configuration: z.record(z.string(), z.any()).optional(),
	ownerType: z.enum(["user", "organization"]).optional(),
	ownerId: z.string().optional(),
	organizationId: z.string().optional(),
	metadata: z.record(z.string(), z.any()).optional(),
});

const listAgentsQuery = z.object({
	ownerType: z.enum(["user", "organization"]).optional(),
	ownerId: z.string().optional(),
	organizationId: z.string().optional(),
	type: z.string().optional(),
	status: z.string().optional(),
	limit: z.coerce.number().int().positive().max(100).default(50).optional(),
	offset: z.coerce.number().int().nonnegative().default(0).optional(),
});

const updateAgentBody = z.object({
	id: z.string().min(1),
	name: z.string().min(1).optional(),
	type: z.string().optional(),
	status: z.enum(["active", "inactive", "suspended", "deleted"]).optional(),
	configuration: z.record(z.string(), z.any()).optional(),
	metadata: z.record(z.string(), z.any()).optional(),
});

/**
 * Agents plugin for Better Auth.
 *
 * Provides CRUD operations for AI agents, service accounts, and bots.
 * Agents are standalone entities with their own identity, owned by users
 * or organizations.
 *
 * Uses only the public better-auth adapter API — no drizzle-orm dependency.
 *
 * @example
 * ```ts
 * import { betterAuth } from "better-auth";
 * import { agents } from "@anthropic/better-auth-agents";
 *
 * const auth = betterAuth({
 *   plugins: [agents()],
 * });
 * ```
 */
export function agents(options: AgentsOptions = {}): BetterAuthPlugin {
	return {
		id: "agents",
		schema: {
			agent: {
				modelName: "agent",
				fields: {
					name: { type: "string", required: true },
					type: {
						type: "string",
						required: true,
						defaultValue: "custom",
					},
					status: {
						type: "string",
						required: true,
						defaultValue: "active",
					},
					configuration: {
						type: "string",
						required: false,
					},
					ownerId: {
						type: "string",
						required: false,
						references: {
							model: "user",
							field: "id",
							onDelete: "set null",
						},
					},
					ownerType: {
						type: "string",
						required: true,
						defaultValue: "user",
					},
					organizationId: {
						type: "string",
						required: false,
					},
					metadata: {
						type: "string",
						required: false,
					},
					createdAt: {
						type: "date",
						required: true,
						defaultValue: Date,
					},
					updatedAt: {
						type: "date",
						required: false,
					},
				},
			},
		},
		endpoints: {
			createAgent: createAuthEndpoint(
				"/agents/create",
				{
					method: "POST",
					body: createAgentBody,
					metadata: {
						openapi: { description: "Create a new agent" },
					},
				},
				async (ctx) => {
					const session = requireSession(ctx);
					const userId = session.user.id;
					const adapter = await getCurrentAdapter(ctx.context.adapter);

					const ownerType = ctx.body.ownerType || "user";
					const ownerId = ctx.body.ownerId || userId;

					// If org-owned, verify membership
					if (ownerType === "organization") {
						if (!ctx.body.organizationId) {
							throw new APIError("BAD_REQUEST", {
								message: AGENTS_ERROR_CODES.ORGANIZATION_ID_REQUIRED,
							});
						}
						const member = await adapter.findOne({
							model: "member",
							where: [
								{
									field: "organizationId",
									value: ctx.body.organizationId,
								},
								{ field: "userId", value: userId },
							],
						});
						if (!member) {
							throw new APIError("FORBIDDEN", {
								message: AGENTS_ERROR_CODES.NOT_MEMBER_OF_ORGANIZATION,
							});
						}
					}

					const agent = await adapter.create<Record<string, any>>({
						model: "agent",
						data: {
							name: ctx.body.name,
							type: ctx.body.type || "custom",
							status: ctx.body.status || "active",
							configuration: ctx.body.configuration
								? JSON.stringify(ctx.body.configuration)
								: null,
							ownerId: ownerType === "user" ? ownerId : null,
							ownerType,
							organizationId: ctx.body.organizationId || null,
							metadata: ctx.body.metadata
								? JSON.stringify(ctx.body.metadata)
								: null,
							createdAt: new Date(),
						},
					});

					return ctx.json(formatAgent(agent));
				},
			),

			listAgents: createAuthEndpoint(
				"/agents/list",
				{
					method: "GET",
					query: listAgentsQuery,
					metadata: {
						openapi: { description: "List agents" },
					},
				},
				async (ctx) => {
					const session = requireSession(ctx);
					const adapter = await getCurrentAdapter(ctx.context.adapter);

					const where: { field: string; value: any }[] = [];

					if (ctx.query.ownerType && ctx.query.ownerId) {
						where.push(
							{ field: "ownerType", value: ctx.query.ownerType },
							{ field: "ownerId", value: ctx.query.ownerId },
						);
					} else if (ctx.query.ownerType === "user") {
						where.push(
							{ field: "ownerType", value: "user" },
							{ field: "ownerId", value: session.user.id },
						);
					}

					if (ctx.query.organizationId) {
						where.push({
							field: "organizationId",
							value: ctx.query.organizationId,
						});
					}
					if (ctx.query.type) {
						where.push({ field: "type", value: ctx.query.type });
					}
					if (ctx.query.status) {
						where.push({ field: "status", value: ctx.query.status });
					}

					const agentsList = await adapter.findMany<Record<string, any>>({
						model: "agent",
						where: where.length > 0 ? where : undefined,
						limit: ctx.query.limit || 50,
						offset: ctx.query.offset || 0,
						sortBy: { field: "createdAt", direction: "desc" },
					});

					const total = await adapter.count({
						model: "agent",
						where: where.length > 0 ? where : undefined,
					});

					return ctx.json({
						agents: agentsList.map(formatAgent),
						total,
						limit: ctx.query.limit || 50,
						offset: ctx.query.offset || 0,
					});
				},
			),

			getAgent: createAuthEndpoint(
				"/agents/get",
				{
					method: "GET",
					query: z.object({ id: z.string().min(1) }),
					metadata: {
						openapi: { description: "Get an agent by ID" },
					},
				},
				async (ctx) => {
					const session = requireSession(ctx);
					const adapter = await getCurrentAdapter(ctx.context.adapter);

					const agent = await adapter.findOne<Record<string, any>>({
						model: "agent",
						where: [{ field: "id", value: ctx.query.id }],
					});

					if (!agent) {
						throw new APIError("NOT_FOUND", {
							message: AGENTS_ERROR_CODES.AGENT_NOT_FOUND,
						});
					}

					// Check ownership
					if (
						agent.ownerType === "user" &&
						agent.ownerId !== session.user.id
					) {
						throw new APIError("FORBIDDEN", {
							message: AGENTS_ERROR_CODES.FORBIDDEN,
						});
					}

					if (
						agent.ownerType === "organization" &&
						agent.organizationId
					) {
						const member = await adapter.findOne({
							model: "member",
							where: [
								{
									field: "organizationId",
									value: agent.organizationId,
								},
								{ field: "userId", value: session.user.id },
							],
						});
						if (!member) {
							throw new APIError("FORBIDDEN", {
								message: AGENTS_ERROR_CODES.FORBIDDEN,
							});
						}
					}

					return ctx.json(formatAgent(agent));
				},
			),

			updateAgent: createAuthEndpoint(
				"/agents/update",
				{
					method: "POST",
					body: updateAgentBody,
					metadata: {
						openapi: { description: "Update an agent" },
					},
				},
				async (ctx) => {
					const session = requireSession(ctx);
					const adapter = await getCurrentAdapter(ctx.context.adapter);

					const existing = await adapter.findOne<Record<string, any>>({
						model: "agent",
						where: [{ field: "id", value: ctx.body.id }],
					});

					if (!existing) {
						throw new APIError("NOT_FOUND", {
							message: AGENTS_ERROR_CODES.AGENT_NOT_FOUND,
						});
					}

					if (
						existing.ownerType === "user" &&
						existing.ownerId !== session.user.id
					) {
						throw new APIError("FORBIDDEN", {
							message: AGENTS_ERROR_CODES.FORBIDDEN,
						});
					}

					const updateData: Record<string, any> = {
						updatedAt: new Date(),
					};
					if (ctx.body.name !== undefined) updateData.name = ctx.body.name;
					if (ctx.body.type !== undefined) updateData.type = ctx.body.type;
					if (ctx.body.status !== undefined)
						updateData.status = ctx.body.status;
					if (ctx.body.configuration !== undefined)
						updateData.configuration = JSON.stringify(
							ctx.body.configuration,
						);
					if (ctx.body.metadata !== undefined)
						updateData.metadata = JSON.stringify(ctx.body.metadata);

					const updated = await adapter.update<Record<string, any>>({
						model: "agent",
						where: [{ field: "id", value: ctx.body.id }],
						update: updateData,
					});

					if (!updated) {
						throw new APIError("INTERNAL_SERVER_ERROR", {
							message: AGENTS_ERROR_CODES.FAILED_TO_UPDATE,
						});
					}

					return ctx.json(formatAgent(updated));
				},
			),

			deleteAgent: createAuthEndpoint(
				"/agents/delete",
				{
					method: "POST",
					body: z.object({ id: z.string().min(1) }),
					metadata: {
						openapi: { description: "Delete an agent" },
					},
				},
				async (ctx) => {
					const session = requireSession(ctx);
					const adapter = await getCurrentAdapter(ctx.context.adapter);

					const existing = await adapter.findOne<Record<string, any>>({
						model: "agent",
						where: [{ field: "id", value: ctx.body.id }],
					});

					if (!existing) {
						throw new APIError("NOT_FOUND", {
							message: AGENTS_ERROR_CODES.AGENT_NOT_FOUND,
						});
					}

					if (
						existing.ownerType === "user" &&
						existing.ownerId !== session.user.id
					) {
						throw new APIError("FORBIDDEN", {
							message: AGENTS_ERROR_CODES.FORBIDDEN,
						});
					}

					await adapter.delete({
						model: "agent",
						where: [{ field: "id", value: ctx.body.id }],
					});

					return ctx.json({ success: true });
				},
			),
		},
		$ERROR_CODES: AGENTS_ERROR_CODES,
		options,
	} satisfies BetterAuthPlugin;
}
