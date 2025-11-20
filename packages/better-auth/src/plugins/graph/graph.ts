import type { BetterAuthPlugin } from "@better-auth/core";
import type { BetterAuthPluginDBSchema } from "@better-auth/core/db";
import type {
	GraphSchema,
	InferObject,
	InferRelationship,
	InferSchemaDefinition,
} from "./schema";
import type { GraphOptions } from "./types";
import { GRAPH_ERROR_CODES } from "./error-codes";
import { getOrCreateObjectRoute, getObjectRoute } from "./routes/crud-objects";
import {
	createRelationshipRoute,
	deleteRelationshipRoute,
	// findPathRoute,
	getRelationshipsRoute,
} from "./routes/crud-relationships";
import {
	createSchemaDefinitionRoute,
	getSchemaDefinitionRoute,
	listSchemaDefinitionsRoute,
	setActiveSchemaDefinitionRoute,
	updateSchemaDefinitionRoute,
} from "./routes/crud-schema-definition";

export type GraphObjectEndpoints<O extends GraphOptions> = {
	getOrCreateObject: ReturnType<typeof getOrCreateObjectRoute<O>>;
	getObject: ReturnType<typeof getObjectRoute<O>>;
};

export type GraphRelationshipEndpoints<O extends GraphOptions> = {
	createRelationship: ReturnType<typeof createRelationshipRoute<O>>;
	deleteRelationship: ReturnType<typeof deleteRelationshipRoute<O>>;
	getRelationships: ReturnType<typeof getRelationshipsRoute<O>>;
	// findPath: ReturnType<typeof findPathRoute<O>>;
};

export type GraphSchemaDefinitionEndpoints<O extends GraphOptions> = {
	createSchemaDefinition: ReturnType<typeof createSchemaDefinitionRoute<O>>;
	updateSchemaDefinition: ReturnType<typeof updateSchemaDefinitionRoute<O>>;
	getSchemaDefinition: ReturnType<typeof getSchemaDefinitionRoute<O>>;
	listSchemaDefinitions: ReturnType<typeof listSchemaDefinitionsRoute<O>>;
	setActiveSchemaDefinition: ReturnType<
		typeof setActiveSchemaDefinitionRoute<O>
	>;
};

export type GraphEndpoints<O extends GraphOptions> = GraphObjectEndpoints<O> &
	GraphRelationshipEndpoints<O> &
	GraphSchemaDefinitionEndpoints<O>;

export type GraphPlugin<O extends GraphOptions> = {
	id: "graph";
	endpoints: GraphEndpoints<O>;
	schema: GraphSchema<O>;
	$Infer: {
		Object: InferObject<O>;
		Relationship: InferRelationship<O>;
		SchemaDefinition: InferSchemaDefinition<O>;
	};
	$ERROR_CODES: typeof GRAPH_ERROR_CODES;
	options: O;
};

/**
 * Graph plugin for Better Auth. Graph allows you to create a graph database
 * for managing relationships between objects and implementing authorization
 * based on graph traversal.
 *
 * @example
 * ```ts
 * const auth = betterAuth({
 *  plugins: [
 *    graph({
 *      authzed: {
 *        endpoint: "https://api.authzed.com",
 *        token: "your-token",
 *      },
 *    }),
 *  ],
 * });
 * ```
 */
export function graph<O extends GraphOptions>(
	options?: O | undefined,
): {
	id: "graph";
	endpoints: GraphEndpoints<O>;
	schema: GraphSchema<O>;
	$Infer: {
		Object: InferObject<O>;
		Relationship: InferRelationship<O>;
		SchemaDefinition: InferSchemaDefinition<O>;
	};
	$ERROR_CODES: typeof GRAPH_ERROR_CODES;
	options: O;
};
export function graph<O extends GraphOptions>(options?: O | undefined): any {
	const endpoints = {
		/**
		 * ### Endpoint
		 *
		 * POST `/graph/object/get-or-create`
		 *
		 * ### API Methods
		 *
		 * **server:**
		 * `auth.api.getOrCreateObject`
		 *
		 * **client:**
		 * `authClient.graph.getOrCreateObject`
		 *
		 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/graph#api-method-graph-get-or-create-object)
		 */
		getOrCreateObject: getOrCreateObjectRoute(options as O),
		/**
		 * ### Endpoint
		 *
		 * GET `/graph/object/get`
		 *
		 * ### API Methods
		 *
		 * **server:**
		 * `auth.api.getObject`
		 *
		 * **client:**
		 * `authClient.graph.getObject`
		 *
		 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/graph#api-method-graph-get-object)
		 */
		getObject: getObjectRoute(options as O),
		/**
		 * ### Endpoint
		 *
		 * POST `/graph/relationship/create`
		 *
		 * ### API Methods
		 *
		 * **server:**
		 * `auth.api.createRelationship`
		 *
		 * **client:**
		 * `authClient.graph.createRelationship`
		 *
		 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/graph#api-method-graph-create-relationship)
		 */
		createRelationship: createRelationshipRoute(options as O),
		/**
		 * ### Endpoint
		 *
		 * POST `/graph/relationship/delete`
		 *
		 * ### API Methods
		 *
		 * **server:**
		 * `auth.api.deleteRelationship`
		 *
		 * **client:**
		 * `authClient.graph.deleteRelationship`
		 *
		 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/graph#api-method-graph-delete-relationship)
		 */
		deleteRelationship: deleteRelationshipRoute(options as O),
		/**
		 * ### Endpoint
		 *
		 * GET `/graph/relationships`
		 *
		 * ### API Methods
		 *
		 * **server:**
		 * `auth.api.getRelationships`
		 *
		 * **client:**
		 * `authClient.graph.getRelationships`
		 *
		 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/graph#api-method-graph-get-relationships)
		 */
		getRelationships: getRelationshipsRoute(options as O),
		/**
		 * ### Endpoint
		 *
		 * GET `/graph/path`
		 *
		 * ### API Methods
		 *
		 * **server:**
		 * `auth.api.findPath`
		 *
		 * **client:**
		 * `authClient.graph.findPath`
		 *
		 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/graph#api-method-graph-find-path)
		 */
		// findPath: findPathRoute(options as O),
		/**
		 * ### Endpoint
		 *
		 * POST `/graph/schema-definition/create`
		 *
		 * ### API Methods
		 *
		 * **server:**
		 * `auth.api.createSchemaDefinition`
		 *
		 * **client:**
		 * `authClient.graph.createSchemaDefinition`
		 *
		 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/graph#api-method-graph-create-schema-definition)
		 */
		createSchemaDefinition: createSchemaDefinitionRoute(options as O),
		/**
		 * ### Endpoint
		 *
		 * POST `/graph/schema-definition/update`
		 *
		 * ### API Methods
		 *
		 * **server:**
		 * `auth.api.updateSchemaDefinition`
		 *
		 * **client:**
		 * `authClient.graph.updateSchemaDefinition`
		 *
		 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/graph#api-method-graph-update-schema-definition)
		 */
		updateSchemaDefinition: updateSchemaDefinitionRoute(options as O),
		/**
		 * ### Endpoint
		 *
		 * GET `/graph/schema-definition/get`
		 *
		 * ### API Methods
		 *
		 * **server:**
		 * `auth.api.getSchemaDefinition`
		 *
		 * **client:**
		 * `authClient.graph.getSchemaDefinition`
		 *
		 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/graph#api-method-graph-get-schema-definition)
		 */
		getSchemaDefinition: getSchemaDefinitionRoute(options as O),
		/**
		 * ### Endpoint
		 *
		 * GET `/graph/schema-definition/list`
		 *
		 * ### API Methods
		 *
		 * **server:**
		 * `auth.api.listSchemaDefinitions`
		 *
		 * **client:**
		 * `authClient.graph.listSchemaDefinitions`
		 *
		 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/graph#api-method-graph-list-schema-definitions)
		 */
		listSchemaDefinitions: listSchemaDefinitionsRoute(options as O),
		/**
		 * ### Endpoint
		 *
		 * POST `/graph/schema-definition/set-active`
		 *
		 * ### API Methods
		 *
		 * **server:**
		 * `auth.api.setActiveSchemaDefinition`
		 *
		 * **client:**
		 * `authClient.graph.setActiveSchemaDefinition`
		 *
		 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/graph#api-method-graph-set-active-schema-definition)
		 */
		setActiveSchemaDefinition: setActiveSchemaDefinitionRoute(options as O),
	};

	const schema = {
		object: {
			modelName: options?.schema?.object?.modelName || "object",
			fields: {
				type: {
					type: "string",
					required: true,
					fieldName: options?.schema?.object?.fields?.type || "type",
				},
				externalId: {
					type: "string",
					required: false,
					fieldName:
						options?.schema?.object?.fields?.externalId || "externalId",
				},
				externalType: {
					type: "string",
					required: false,
					fieldName:
						options?.schema?.object?.fields?.externalType || "externalType",
				},
				attributes: {
					type: "string",
					required: false,
					fieldName:
						options?.schema?.object?.fields?.attributes || "attributes",
				},
				metadata: {
					type: "string",
					required: false,
					fieldName: options?.schema?.object?.fields?.metadata || "metadata",
				},
				createdAt: {
					type: "date",
					required: true,
					defaultValue: Date,
					fieldName: options?.schema?.object?.fields?.createdAt || "createdAt",
				},
				updatedAt: {
					type: "date",
					required: false,
					fieldName: options?.schema?.object?.fields?.updatedAt || "updatedAt",
				},
				...(options?.schema?.object?.additionalFields || {}),
			},
		},
		relationship: {
			modelName: options?.schema?.relationship?.modelName || "relationship",
			fields: {
				subjectId: {
					type: "string",
					required: true,
					references: {
						model: "object",
						field: "id",
						onDelete: "cascade",
						name: "subject",
					},
					fieldName:
						options?.schema?.relationship?.fields?.subjectId || "subjectId",
				},
				subjectType: {
					type: "string",
					required: true,
					fieldName:
						options?.schema?.relationship?.fields?.subjectType || "subjectType",
				},
				objectId: {
					type: "string",
					required: true,
					references: {
						model: "object",
						field: "id",
						onDelete: "cascade",
						name: "object",
					},
					fieldName:
						options?.schema?.relationship?.fields?.objectId || "objectId",
				},
				objectType: {
					type: "string",
					required: true,
					fieldName:
						options?.schema?.relationship?.fields?.objectType || "objectType",
				},
				relationshipType: {
					type: "string",
					required: true,
					fieldName:
						options?.schema?.relationship?.fields?.relationshipType ||
						"relationshipType",
				},
				attributes: {
					type: "string",
					required: false,
					fieldName:
						options?.schema?.relationship?.fields?.attributes || "attributes",
				},
				metadata: {
					type: "string",
					required: false,
					fieldName:
						options?.schema?.relationship?.fields?.metadata || "metadata",
				},
				createdAt: {
					type: "date",
					required: true,
					defaultValue: Date,
					fieldName:
						(options?.schema?.relationship?.fields as any)?.createdAt ??
						"createdAt",
				},
				updatedAt: {
					type: "date",
					required: false,
					fieldName:
						(options?.schema?.relationship?.fields as any)?.updatedAt ??
						"updatedAt",
				},
				...(options?.schema?.relationship?.additionalFields || {}),
			},
		},
		schemaDefinition: {
			modelName:
				options?.schema?.schemaDefinition?.modelName || "schemaDefinition",
			fields: {
				version: {
					type: "string",
					required: true,
					fieldName:
						options?.schema?.schemaDefinition?.fields?.version || "version",
				},
				definition: {
					type: "string",
					required: true,
					fieldName:
						options?.schema?.schemaDefinition?.fields?.definition ||
						"definition",
				},
				isActive: {
					type: "boolean",
					required: false,
					defaultValue: true,
					fieldName:
						options?.schema?.schemaDefinition?.fields?.isActive || "isActive",
				},
				metadata: {
					type: "string",
					required: false,
					fieldName:
						options?.schema?.schemaDefinition?.fields?.metadata || "metadata",
				},
				createdAt: {
					type: "date",
					required: true,
					defaultValue: Date,
					fieldName:
						(options?.schema?.schemaDefinition?.fields as any)?.createdAt ??
						"createdAt",
				},
				updatedAt: {
					type: "date",
					required: false,
					fieldName:
						(options?.schema?.schemaDefinition?.fields as any)?.updatedAt ??
						"updatedAt",
				},
				createdBy: {
					type: "string",
					required: false,
					references: {
						model: "user",
						field: "id",
						onDelete: "set null",
					},
					fieldName:
						options?.schema?.schemaDefinition?.fields?.createdBy || "createdBy",
				},
				...(options?.schema?.schemaDefinition?.additionalFields || {}),
			},
		},
	} satisfies BetterAuthPluginDBSchema;

	return {
		id: "graph",
		endpoints,
		schema: schema as GraphSchema<O>,
		$Infer: {
			Object: {} as InferObject<O>,
			Relationship: {} as InferRelationship<O>,
			SchemaDefinition: {} as InferSchemaDefinition<O>,
		},
		$ERROR_CODES: GRAPH_ERROR_CODES,
		options: options as O,
	} satisfies BetterAuthPlugin;
}
