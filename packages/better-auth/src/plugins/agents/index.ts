// SPDX-FileCopyrightText: 2025-present Kriasoft
// SPDX-License-Identifier: MIT
import type { BetterAuthPlugin } from "better-auth";
import { APIError } from "better-call";
import { and, desc, eq, sql } from "drizzle-orm";

import { AGENTS_ERROR_CODES } from "./error-codes";
import {
	createAgentBodySchema,
	deleteAgentBodySchema,
	getAgentQuerySchema,
	listAgentsQuerySchema,
	updateAgentBodySchema,
} from "./schemas";
import { createAuthEndpoint } from "@better-auth/core/api";
import { sessionMiddleware } from "../../api";

export interface AgentsOptions {
	events?: {
		[key: string]: boolean;
	};
	signing?: {
		secret: string;
		algorithm?: "sha256" | "sha512";
	};
	retry?: {
		attempts?: number;
		backoff?: "linear" | "exponential";
		initialDelay?: number;
	};
	timeout?: number;
	headers?: Record<string, string>;
}

export function agents(options: AgentsOptions = {}): BetterAuthPlugin {
	return {
		id: "agents",
		schema: {
			person: {
				modelName: "person",
				fields: {
					name: { type: "string" },
				},
			},
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
						type: "string", // JSONB stored as string in Better Auth schema
					},
					ownerId: {
						type: "string",
					},
					ownerType: {
						type: "string",
						required: true,
						defaultValue: "user",
					},
					organizationId: {
						type: "string",
						references: {
							model: "organization",
							field: "id",
							onDelete: "set null",
						},
					},
					metadata: {
						type: "string", // JSONB stored as string
					},
					createdAt: {
						type: "date",
					},
					updatedAt: {
						type: "date",
					},
				},
			},
		},
		endpoints: {
			createAgent: createAuthEndpoint(
				"/agents/create",
				{
					method: "POST",
					use: [sessionMiddleware],
					body: createAgentBodySchema,
				},
				async (ctx) => {
					const session = ctx.context.session;
					if (!session?.user) {
						throw new APIError("UNAUTHORIZED", {
							message: AGENTS_ERROR_CODES.UNAUTHORIZED,
						});
					}

					const userId = session.user.id;
					const body = ctx.body as z.infer<typeof createAgentBodySchema>;

					// Validate required fields
					if (!body.name) {
						throw new APIError("BAD_REQUEST", {
							message: AGENTS_ERROR_CODES.NAME_REQUIRED,
						});
					}

					const agentType = body.type || "custom";
					const status = body.status || "active";
					const ownerType = body.ownerType || "user";
					const ownerId = body.ownerId || userId;

					// If ownerType is organization, validate organizationId
					if (ownerType === "organization") {
						if (!body.organizationId) {
							throw new APIError("BAD_REQUEST", {
								message: AGENTS_ERROR_CODES.ORGANIZATION_ID_REQUIRED,
							});
						}

						// Verify user is member of the organization
						const [member] = await db
							.select()
							.from(tables.members)
							.where(
								and(
									eq(tables.members.organizationId, body.organizationId),
									eq(tables.members.userId, userId),
								),
							)
							.limit(1);

						if (!member) {
							throw new APIError("FORBIDDEN", {
								message: AGENTS_ERROR_CODES.NOT_MEMBER_OF_ORGANIZATION,
							});
						}
					}

					// Create user for the agent
					const agentUser = await ctx.context.internalAdapter.createUser({
						name: body.name,
						email: `agent_${Date.now()}@system.local`, // Temporary email
						emailVerified: true,
						actorType: "agent",
					});

					// Create agent record using adapter
					const agent = await ctx.context.adapter.create({
						model: "agent",
						data: {
							userId: agentUser.id,
							name: body.name,
							type: agentType,
							status: status,
							configuration: body.configuration
								? JSON.stringify(body.configuration)
								: null,
							ownerId: ownerType === "user" ? ownerId : null,
							ownerType: ownerType,
							organizationId: body.organizationId || null,
							metadata: body.metadata ? JSON.stringify(body.metadata) : null,
						},
					});

					// Update user's actorId using db directly
					await db
						.update(tables.users)
						.set({ actorId: agent.id })
						.where(eq(tables.users.id, agentUser.id));

					return ctx.json({
						id: agent.id,
						userId: agent.userId,
						name: agent.name,
						type: (agent as any).type || "custom",
						status: (agent as any).status || "active",
						configuration: (agent as any).configuration
							? JSON.parse((agent as any).configuration)
							: null,
						ownerId: (agent as any).ownerId || null,
						ownerType: (agent as any).ownerType || "user",
						organizationId: (agent as any).organizationId || null,
						metadata: (agent as any).metadata
							? JSON.parse((agent as any).metadata)
							: null,
						createdAt: (agent as any).createdAt,
						updatedAt: (agent as any).updatedAt,
					});
				},
			),

			listAgents: createAuthEndpoint(
				"/agents/list",
				{
					method: "GET",
					use: [sessionMiddleware],
					query: listAgentsQuerySchema,
				},
				async (ctx) => {
					const session = ctx.context.session;
					if (!session?.user) {
						throw new APIError("UNAUTHORIZED", {
							message: AGENTS_ERROR_CODES.UNAUTHORIZED,
						});
					}

					const userId = session.user.id;
					const query = ctx.query as z.infer<typeof listAgentsQuerySchema>;

					const limit = query.limit ? parseInt(query.limit.toString()) : 50;
					const offset = query.offset ? parseInt(query.offset.toString()) : 0;

					// Build where conditions - using raw SQL for fields that may not exist yet
					let whereClause = sql`1=1`;

					// Filter by owner
					if (query.ownerType && query.ownerId) {
						whereClause = sql`${whereClause} AND owner_type = ${query.ownerType} AND owner_id = ${query.ownerId}`;
					} else if (query.ownerType === "user") {
						// Default to current user if no ownerId specified
						whereClause = sql`${whereClause} AND owner_type = 'user' AND owner_id = ${userId}`;
					}

					// Filter by organization
					if (query.organizationId) {
						whereClause = sql`${whereClause} AND organization_id = ${query.organizationId}`;
					}

					// Filter by type
					if (query.type) {
						whereClause = sql`${whereClause} AND type = ${query.type}`;
					}

					// Filter by status
					if (query.status) {
						whereClause = sql`${whereClause} AND status = ${query.status}`;
					}

					// Get agents using raw SQL for now until migration is run
					const agentsList = await db.execute(
						sql`
              SELECT * FROM ${tables.agents}
              WHERE ${whereClause}
              ORDER BY created_at DESC
              LIMIT ${limit}
              OFFSET ${offset}
            `,
					);

					// Get total count
					const totalResult = await db.execute(
						sql`
              SELECT COUNT(*) as count FROM ${tables.agents}
              WHERE ${whereClause}
            `,
					);

					const total = parseInt((totalResult.rows[0] as any)?.count || "0");

					return ctx.json({
						agents: agentsList.rows.map((agent: any) => ({
							id: agent.id,
							userId: agent.user_id,
							name: agent.name,
							type: agent.type || "custom",
							status: agent.status || "active",
							configuration: agent.configuration
								? JSON.parse(agent.configuration)
								: null,
							ownerId: agent.owner_id || null,
							ownerType: agent.owner_type || "user",
							organizationId: agent.organization_id || null,
							metadata: agent.metadata ? JSON.parse(agent.metadata) : null,
							createdAt: agent.created_at,
							updatedAt: agent.updated_at,
						})),
						total,
						limit,
						offset,
					});
				},
			),

			getAgent: createAuthEndpoint(
				"/agents/get",
				{
					method: "GET",
					use: [sessionMiddleware],
					query: getAgentQuerySchema,
				},
				async (ctx) => {
					const session = ctx.context.session;
					if (!session?.user) {
						throw new APIError("UNAUTHORIZED", {
							message: AGENTS_ERROR_CODES.UNAUTHORIZED,
						});
					}

					const userId = session.user.id;
					const query = ctx.query as z.infer<typeof getAgentQuerySchema>;

					const [agent] = await db
						.select()
						.from(tables.agents)
						.where(eq(tables.agents.id, query.id))
						.limit(1);

					if (!agent) {
						throw new APIError("NOT_FOUND", {
							message: AGENTS_ERROR_CODES.AGENT_NOT_FOUND,
						});
					}

					// Check permissions - user must own the agent or be in the organization
					const agentData = agent as any;
					if (agentData.ownerType === "user" && agentData.ownerId !== userId) {
						throw new APIError("FORBIDDEN", {
							message: AGENTS_ERROR_CODES.FORBIDDEN,
						});
					}

					if (
						agentData.ownerType === "organization" &&
						agentData.organizationId
					) {
						const [member] = await db
							.select()
							.from(tables.members)
							.where(
								and(
									eq(tables.members.organizationId, agentData.organizationId),
									eq(tables.members.userId, userId),
								),
							)
							.limit(1);

						if (!member) {
							throw new APIError("FORBIDDEN", {
								message: AGENTS_ERROR_CODES.FORBIDDEN,
							});
						}
					}

					return ctx.json({
						id: agent.id,
						userId: agent.userId,
						name: agent.name,
						type: agentData.type || "custom",
						status: agentData.status || "active",
						configuration: agentData.configuration
							? JSON.parse(agentData.configuration)
							: null,
						ownerId: agentData.ownerId || null,
						ownerType: agentData.ownerType || "user",
						organizationId: agentData.organizationId || null,
						metadata: agentData.metadata
							? JSON.parse(agentData.metadata)
							: null,
						createdAt: agentData.createdAt,
						updatedAt: agentData.updatedAt,
					});
				},
			),

			updateAgent: createAuthEndpoint(
				"/agents/update",
				{
					method: "POST",
					use: [sessionMiddleware],
					body: updateAgentBodySchema,
				},
				async (ctx) => {
					const session = ctx.context.session;
					if (!session?.user) {
						throw new APIError("UNAUTHORIZED", {
							message: AGENTS_ERROR_CODES.UNAUTHORIZED,
						});
					}

					const userId = session.user.id;
					const body = ctx.body as z.infer<typeof updateAgentBodySchema>;

					// Get existing agent
					const [existingAgent] = await db
						.select()
						.from(tables.agents)
						.where(eq(tables.agents.id, body.id))
						.limit(1);

					if (!existingAgent) {
						return ctx.json({ error: "Agent not found" }, { status: 404 });
					}

					const existingAgentData = existingAgent as any;

					// Check permissions
					if (
						existingAgentData.ownerType === "user" &&
						existingAgentData.ownerId !== userId
					) {
						return ctx.json({ error: "Forbidden" }, { status: 403 });
					}

					if (
						existingAgentData.ownerType === "organization" &&
						existingAgentData.organizationId
					) {
						const [member] = await db
							.select()
							.from(tables.members)
							.where(
								and(
									eq(
										tables.members.organizationId,
										existingAgentData.organizationId,
									),
									eq(tables.members.userId, userId),
								),
							)
							.limit(1);

						if (!member) {
							return ctx.json({ error: "Forbidden" }, { status: 403 });
						}
					}

					// Build update data
					const updateData: any = {};
					if (body.name !== undefined) updateData.name = body.name;
					if (body.type !== undefined) updateData.type = body.type;
					if (body.status !== undefined) updateData.status = body.status;
					if (body.configuration !== undefined) {
						updateData.configuration = JSON.stringify(body.configuration);
					}
					if (body.metadata !== undefined) {
						updateData.metadata = JSON.stringify(body.metadata);
					}

					// Update agent using db directly
					const [updatedAgent] = await db
						.update(tables.agents)
						.set(updateData)
						.where(eq(tables.agents.id, body.id))
						.returning();

					if (!updatedAgent) {
						throw new APIError("INTERNAL_SERVER_ERROR", {
							message: AGENTS_ERROR_CODES.FAILED_TO_UPDATE,
						});
					}

					const updatedAgentData = updatedAgent as any;

					return ctx.json({
						id: updatedAgentData.id,
						userId: updatedAgentData.userId,
						name: updatedAgentData.name,
						type: updatedAgentData.type || "custom",
						status: updatedAgentData.status || "active",
						configuration: updatedAgentData.configuration
							? JSON.parse(updatedAgentData.configuration)
							: null,
						ownerId: updatedAgentData.ownerId || null,
						ownerType: updatedAgentData.ownerType || "user",
						organizationId: updatedAgentData.organizationId || null,
						metadata: updatedAgentData.metadata
							? JSON.parse(updatedAgentData.metadata)
							: null,
						createdAt: updatedAgentData.createdAt,
						updatedAt: updatedAgentData.updatedAt,
					});
				},
			),

			deleteAgent: createAuthEndpoint(
				"/agents/delete",
				{
					method: "POST",
					use: [sessionMiddleware],
					body: deleteAgentBodySchema,
				},
				async (ctx) => {
					const session = ctx.context.session;
					if (!session?.user) {
						throw new APIError("UNAUTHORIZED", {
							message: AGENTS_ERROR_CODES.UNAUTHORIZED,
						});
					}

					const userId = session.user.id;
					const body = ctx.body as z.infer<typeof deleteAgentBodySchema>;

					// Get existing agent
					const [existingAgent] = await db
						.select()
						.from(tables.agents)
						.where(eq(tables.agents.id, body.id))
						.limit(1);

					if (!existingAgent) {
						throw new APIError("NOT_FOUND", {
							message: AGENTS_ERROR_CODES.AGENT_NOT_FOUND,
						});
					}

					const existingAgentData = existingAgent as any;

					// Check permissions
					if (
						existingAgentData.ownerType === "user" &&
						existingAgentData.ownerId !== userId
					) {
						throw new APIError("FORBIDDEN", {
							message: AGENTS_ERROR_CODES.FORBIDDEN,
						});
					}

					if (
						existingAgentData.ownerType === "organization" &&
						existingAgentData.organizationId
					) {
						const [member] = await db
							.select()
							.from(tables.members)
							.where(
								and(
									eq(
										tables.members.organizationId,
										existingAgentData.organizationId,
									),
									eq(tables.members.userId, userId),
								),
							)
							.limit(1);

						if (!member) {
							throw new APIError("FORBIDDEN", {
								message: AGENTS_ERROR_CODES.FORBIDDEN,
							});
						}
					}

					// Delete agent (cascade will delete the user)
					await db.delete(tables.agents).where(eq(tables.agents.id, body.id));

					return ctx.json({ success: true });
				},
			),
		},
	} satisfies BetterAuthPlugin;
}

export default agents;
