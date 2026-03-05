import type { BetterAuthPlugin } from "@better-auth/core";
import type { BetterAuthPluginDBSchema } from "@better-auth/core/db";
import { getCurrentAdapter } from "@better-auth/core/context";
import { GRAPH_ERROR_CODES } from "./error-codes";
import { getOrCreateObjectRoute, getObjectRoute } from "./routes/crud-objects";
import {
	createRelationshipRoute,
	deleteRelationshipRoute,
	getRelationshipsRoute,
} from "./routes/crud-relationships";
import {
	createSchemaDefinitionRoute,
	updateSchemaDefinitionRoute,
	getSchemaDefinitionRoute,
	listSchemaDefinitionsRoute,
	setActiveSchemaDefinitionRoute,
} from "./routes/crud-schema-definitions";
import type { GraphOptions } from "./types";

/**
 * Graph plugin for Better Auth.
 *
 * Provides a graph database layer for managing relationships between objects
 * and implementing authorization based on graph traversal (e.g., via SpiceDB/Authzed).
 *
 * Uses only the public better-auth plugin API:
 * - Database schema for objects, relationships, and schema definitions
 * - CRUD endpoints for all graph entities
 * - `databaseHooks.user.create.before` to write outbox entries in the same
 *   DB transaction as user creation (ensuring atomicity)
 *
 * @example
 * ```ts
 * import { betterAuth } from "better-auth";
 * import { graph } from "@anthropic/better-auth-graph";
 *
 * const auth = betterAuth({
 *   plugins: [
 *     graph({
 *       userCreationHooks: {
 *         enabled: true,
 *         relationships: [
 *           { relation: "has_role", objectType: "platform_role", objectId: "platform_user" },
 *         ],
 *       },
 *     }),
 *   ],
 * });
 * ```
 */
export function graph<O extends GraphOptions>(options?: O) {
	const opts = (options || {}) as O;

	const endpoints = {
		getOrCreateObject: getOrCreateObjectRoute(opts),
		getObject: getObjectRoute(opts),
		createRelationship: createRelationshipRoute(opts),
		deleteRelationship: deleteRelationshipRoute(opts),
		getRelationships: getRelationshipsRoute(opts),
		createSchemaDefinition: createSchemaDefinitionRoute(opts),
		updateSchemaDefinition: updateSchemaDefinitionRoute(opts),
		getSchemaDefinition: getSchemaDefinitionRoute(opts),
		listSchemaDefinitions: listSchemaDefinitionsRoute(opts),
		setActiveSchemaDefinition: setActiveSchemaDefinitionRoute(opts),
	};

	const schema = {
		object: {
			modelName: opts.schema?.object?.modelName || "object",
			fields: {
				type: {
					type: "string" as const,
					required: true,
					fieldName: opts.schema?.object?.fields?.type || "type",
				},
				externalId: {
					type: "string" as const,
					required: false,
					fieldName:
						opts.schema?.object?.fields?.externalId || "externalId",
				},
				externalType: {
					type: "string" as const,
					required: false,
					fieldName:
						opts.schema?.object?.fields?.externalType || "externalType",
				},
				attributes: {
					type: "string" as const,
					required: false,
					fieldName:
						opts.schema?.object?.fields?.attributes || "attributes",
				},
				metadata: {
					type: "string" as const,
					required: false,
					fieldName:
						opts.schema?.object?.fields?.metadata || "metadata",
				},
				createdAt: {
					type: "date" as const,
					required: true,
					defaultValue: Date,
				},
				updatedAt: {
					type: "date" as const,
					required: false,
				},
				...(opts.schema?.object?.additionalFields || {}),
			},
		},
		relationship: {
			modelName: opts.schema?.relationship?.modelName || "relationship",
			fields: {
				subjectId: {
					type: "string" as const,
					required: true,
					references: {
						model: "object",
						field: "id",
						onDelete: "cascade" as const,
					},
					fieldName:
						opts.schema?.relationship?.fields?.subjectId || "subjectId",
				},
				subjectType: {
					type: "string" as const,
					required: true,
					fieldName:
						opts.schema?.relationship?.fields?.subjectType || "subjectType",
				},
				objectId: {
					type: "string" as const,
					required: true,
					references: {
						model: "object",
						field: "id",
						onDelete: "cascade" as const,
					},
					fieldName:
						opts.schema?.relationship?.fields?.objectId || "objectId",
				},
				objectType: {
					type: "string" as const,
					required: true,
					fieldName:
						opts.schema?.relationship?.fields?.objectType || "objectType",
				},
				relationshipType: {
					type: "string" as const,
					required: true,
					fieldName:
						opts.schema?.relationship?.fields?.relationshipType ||
						"relationshipType",
				},
				attributes: {
					type: "string" as const,
					required: false,
					fieldName:
						opts.schema?.relationship?.fields?.attributes || "attributes",
				},
				metadata: {
					type: "string" as const,
					required: false,
					fieldName:
						opts.schema?.relationship?.fields?.metadata || "metadata",
				},
				createdAt: {
					type: "date" as const,
					required: true,
					defaultValue: Date,
				},
				updatedAt: {
					type: "date" as const,
					required: false,
				},
				...(opts.schema?.relationship?.additionalFields || {}),
			},
		},
		schemaDefinition: {
			modelName:
				opts.schema?.schemaDefinition?.modelName || "schemaDefinition",
			fields: {
				version: {
					type: "string" as const,
					required: true,
				},
				definition: {
					type: "string" as const,
					required: true,
				},
				isActive: {
					type: "boolean" as const,
					required: false,
					defaultValue: true,
				},
				metadata: {
					type: "string" as const,
					required: false,
				},
				createdAt: {
					type: "date" as const,
					required: true,
					defaultValue: Date,
				},
				updatedAt: {
					type: "date" as const,
					required: false,
				},
				createdBy: {
					type: "string" as const,
					required: false,
					references: {
						model: "user",
						field: "id",
						onDelete: "set null" as const,
					},
				},
				...(opts.schema?.schemaDefinition?.additionalFields || {}),
			},
		},
		// Outbox table for transactional graph sync
		graphOutbox: {
			modelName: "graphOutbox",
			fields: {
				action: {
					type: "string" as const,
					required: true,
				},
				subjectId: {
					type: "string" as const,
					required: true,
				},
				subjectType: {
					type: "string" as const,
					required: true,
				},
				objectId: {
					type: "string" as const,
					required: true,
				},
				objectType: {
					type: "string" as const,
					required: true,
				},
				relation: {
					type: "string" as const,
					required: true,
				},
				status: {
					type: "string" as const,
					required: true,
					defaultValue: "pending",
				},
				error: {
					type: "string" as const,
					required: false,
				},
				createdAt: {
					type: "date" as const,
					required: true,
					defaultValue: Date,
				},
				processedAt: {
					type: "date" as const,
					required: false,
				},
			},
		},
	} satisfies BetterAuthPluginDBSchema;

	return {
		id: "graph",
		endpoints,
		schema,
		init(ctx) {
			// Wire up databaseHooks for transactional outbox on user creation
			const hookConfig = opts.userCreationHooks;
			if (!hookConfig?.enabled) return;

			return {
				options: {
					databaseHooks: {
						user: {
							create: {
								before: async (user: any) => {
									const relationships = hookConfig.relationships || [];
									if (relationships.length === 0) return { data: user };

									// Generate user ID if not present (we own this ID)
									const userId =
										user.id || ctx.generateId({ model: "user" });

									// Write outbox + object + relationship entries in same tx
									const adapter = await getCurrentAdapter(ctx.adapter);

									// Ensure user object exists in graph
									await adapter.create({
										model: "object",
										data: {
											type: "user",
											externalId: userId,
											externalType: "user",
											createdAt: new Date(),
										},
									});

									// Write outbox entries for each relationship
									for (const rel of relationships) {
										// Ensure the target object exists
										const existing = await adapter.findOne({
											model: "object",
											where: [
												{
													field: "externalId",
													value: rel.objectId,
												},
												{
													field: "externalType",
													value: rel.objectType,
												},
											],
										});

										let targetObjectId: string;
										if (existing) {
											targetObjectId = (existing as any).id;
										} else {
											const created = await adapter.create<
												Record<string, any>
											>({
												model: "object",
												data: {
													type: rel.objectType,
													externalId: rel.objectId,
													externalType: rel.objectType,
													createdAt: new Date(),
												},
											});
											targetObjectId = created.id;
										}

										// Get the user's graph object ID
										const userObj = await adapter.findOne<
											Record<string, any>
										>({
											model: "object",
											where: [
												{ field: "externalId", value: userId },
												{ field: "externalType", value: "user" },
											],
										});

										// Create the relationship in the DB
										await adapter.create({
											model: "relationship",
											data: {
												subjectId: userObj!.id,
												subjectType: "user",
												objectId: targetObjectId,
												objectType: rel.objectType,
												relationshipType: rel.relation,
												createdAt: new Date(),
											},
										});

										// Write to outbox for async sync to SpiceDB
										await adapter.create({
											model: "graphOutbox",
											data: {
												action: "create_relationship",
												subjectId: userId,
												subjectType: "user",
												objectId: rel.objectId,
												objectType: rel.objectType,
												relation: rel.relation,
												status: "pending",
												createdAt: new Date(),
											},
										});
									}

									// Pass the generated ID through so better-auth uses it
									return { data: { ...user, id: userId } };
								},
							},
						},
					},
				},
			};
		},
		$ERROR_CODES: GRAPH_ERROR_CODES,
		options: opts,
	} satisfies BetterAuthPlugin;
}
