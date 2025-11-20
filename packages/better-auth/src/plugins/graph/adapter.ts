import type { AuthContext } from "@better-auth/core";
import { getCurrentAdapter } from "@better-auth/core/context";
import { BetterAuthError } from "@better-auth/core/error";
import parseJSON from "../../client/parser";
import type { InferAdditionalFieldsFromPluginOptions } from "../../db";
import type {
	InferObject,
	InferRelationship,
	InferSchemaDefinition,
	ObjectInput,
	RelationshipInput,
	SchemaDefinitionInput,
} from "./schema";
import type { GraphOptions } from "./types";
import type { Where } from "../../types";

export const getGraphAdapter = <O extends GraphOptions>(
	context: AuthContext,
	options?: O | undefined,
) => {
	const baseAdapter = context.adapter;
	return {
		// Object operations
		findObjectById: async (objectId: string) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const object = await adapter.findOne<InferObject<O, false>>({
				model: "object",
				where: [
					{
						field: "id",
						value: objectId,
					},
				],
			});
			if (!object) {
				return null;
			}
			return {
				...object,
				attributes:
					object.attributes && typeof object.attributes === "string"
						? parseJSON<Record<string, any>>(object.attributes)
						: object.attributes,
				metadata:
					object.metadata && typeof object.metadata === "string"
						? parseJSON<Record<string, any>>(object.metadata)
						: object.metadata,
			} as typeof object;
		},
		findObjectByExternal: async (data: {
			externalId: string;
			externalType: string;
		}) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const object = await adapter.findOne<InferObject<O, false>>({
				model: "object",
				where: [
					{
						field: "externalId",
						value: data.externalId,
					},
					{
						field: "externalType",
						value: data.externalType,
					},
				],
			});
			if (!object) {
				return null;
			}
			return {
				...object,
				attributes:
					object.attributes && typeof object.attributes === "string"
						? parseJSON<Record<string, any>>(object.attributes)
						: object.attributes,
				metadata:
					object.metadata && typeof object.metadata === "string"
						? parseJSON<Record<string, any>>(object.metadata)
						: object.metadata,
			} as typeof object;
		},
		getOrCreateObject: async (
			data: {
				type: string;
				externalId?: string | undefined;
				externalType?: string | undefined;
				attributes?: Record<string, any> | undefined;
				metadata?: Record<string, any> | undefined;
			} & Record<string, any>,
		) => {
			const adapter = await getCurrentAdapter(baseAdapter);

			// Try to find existing object
			if (data.externalId && data.externalType) {
				const existing = await adapter.findOne<InferObject<O, false>>({
					model: "object",
					where: [
						{
							field: "externalId",
							value: data.externalId,
						},
						{
							field: "externalType",
							value: data.externalType,
						},
					],
				});

				if (existing) {
					return {
						...existing,
						attributes:
							existing.attributes && typeof existing.attributes === "string"
								? parseJSON<Record<string, any>>(existing.attributes)
								: existing.attributes,
						metadata:
							existing.metadata && typeof existing.metadata === "string"
								? parseJSON<Record<string, any>>(existing.metadata)
								: existing.metadata,
					} as typeof existing;
				}
			}

			// Create new object
			const object = await adapter.create<
				ObjectInput & Record<string, any>,
				InferObject<O, false>
			>({
				model: "object",
				data: {
					type: data.type,
					externalId: data.externalId || null,
					externalType: data.externalType || null,
					attributes: data.attributes
						? JSON.stringify(data.attributes)
						: undefined,
					metadata: data.metadata ? JSON.stringify(data.metadata) : undefined,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});

			return {
				...object,
				attributes:
					object.attributes && typeof object.attributes === "string"
						? parseJSON<Record<string, any>>(object.attributes)
						: object.attributes,
				metadata:
					object.metadata && typeof object.metadata === "string"
						? parseJSON<Record<string, any>>(object.metadata)
						: object.metadata,
			} as typeof object;
		},
		createObject: async (
			data: Omit<ObjectInput, "id"> &
				Record<string, any> & {
					attributes?: Record<string, any> | undefined;
					metadata?: Record<string, any> | undefined;
				},
		) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const object = await adapter.create<typeof data, InferObject<O, false>>({
				model: "object",
				data: {
					...data,
					attributes: data.attributes
						? JSON.stringify(data.attributes)
						: undefined,
					metadata: data.metadata ? JSON.stringify(data.metadata) : undefined,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});
			return {
				...object,
				attributes:
					object.attributes && typeof object.attributes === "string"
						? parseJSON<Record<string, any>>(object.attributes)
						: object.attributes,
				metadata:
					object.metadata && typeof object.metadata === "string"
						? parseJSON<Record<string, any>>(object.metadata)
						: object.metadata,
			} as typeof object;
		},
		updateObject: async (
			objectId: string,
			data: Partial<ObjectInput> & {
				attributes?: Record<string, any> | undefined;
				metadata?: Record<string, any> | undefined;
			},
		) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const object = await adapter.update<InferObject<O, false>>({
				model: "object",
				where: [
					{
						field: "id",
						value: objectId,
					},
				],
				update: {
					...data,
					attributes:
						typeof data.attributes === "object"
							? JSON.stringify(data.attributes)
							: data.attributes,
					metadata:
						typeof data.metadata === "object"
							? JSON.stringify(data.metadata)
							: data.metadata,
					updatedAt: new Date(),
				},
			});
			if (!object) {
				return null;
			}
			return {
				...object,
				attributes:
					object.attributes && typeof object.attributes === "string"
						? parseJSON<Record<string, any>>(object.attributes)
						: object.attributes,
				metadata:
					object.metadata && typeof object.metadata === "string"
						? parseJSON<Record<string, any>>(object.metadata)
						: object.metadata,
			};
		},
		deleteObject: async (objectId: string) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			await adapter.delete<InferObject<O, false>>({
				model: "object",
				where: [
					{
						field: "id",
						value: objectId,
					},
				],
			});
			return objectId;
		},

		// Relationship operations
		createRelationship: async (
			data: Omit<RelationshipInput, "id"> &
				Record<string, any> & {
					attributes?: Record<string, any> | undefined;
					metadata?: Record<string, any> | undefined;
				},
		) => {
			const adapter = await getCurrentAdapter(baseAdapter);

			// Verify both objects exist
			const [subjectObj, objectObj] = await Promise.all([
				adapter.findOne<InferObject<O, false>>({
					model: "object",
					where: [
						{
							field: "id",
							value: data.subjectId,
						},
					],
				}),
				adapter.findOne<InferObject<O, false>>({
					model: "object",
					where: [
						{
							field: "id",
							value: data.objectId,
						},
					],
				}),
			]);

			if (!subjectObj) {
				throw new BetterAuthError("Subject object not found");
			}

			if (!objectObj) {
				throw new BetterAuthError("Object not found");
			}

			const relationship = await adapter.create<
				typeof data,
				InferRelationship<O, false>
			>({
				model: "relationship",
				data: {
					...data,
					subjectType: data.subjectType || subjectObj.type,
					objectType: data.objectType || objectObj.type,
					attributes: data.attributes
						? JSON.stringify(data.attributes)
						: undefined,
					metadata: data.metadata ? JSON.stringify(data.metadata) : undefined,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});

			return {
				...relationship,
				attributes:
					relationship.attributes && typeof relationship.attributes === "string"
						? parseJSON<Record<string, any>>(relationship.attributes)
						: relationship.attributes,
				metadata:
					relationship.metadata && typeof relationship.metadata === "string"
						? parseJSON<Record<string, any>>(relationship.metadata)
						: relationship.metadata,
			} as typeof relationship;
		},
		findRelationship: async (relationshipId: string) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const relationship = await adapter.findOne<InferRelationship<O, false>>({
				model: "relationship",
				where: [
					{
						field: "id",
						value: relationshipId,
					},
				],
			});
			if (!relationship) {
				return null;
			}
			return {
				...relationship,
				attributes:
					relationship.attributes && typeof relationship.attributes === "string"
						? parseJSON<Record<string, any>>(relationship.attributes)
						: relationship.attributes,
				metadata:
					relationship.metadata && typeof relationship.metadata === "string"
						? parseJSON<Record<string, any>>(relationship.metadata)
						: relationship.metadata,
			} as typeof relationship;
		},
		findRelationships: async (data: {
			objectId: string;
			direction?: "incoming" | "outgoing" | "both" | undefined;
			relationshipType?: string | undefined;
			limit?: number | undefined;
			offset?: number | undefined;
		}) => {
			const adapter = await getCurrentAdapter(baseAdapter);

			const where: Where[] = [];

			if (data.direction === "incoming" || data.direction === "both") {
				where.push({
					field: "objectId",
					value: data.objectId,
				});
			}

			if (data.direction === "outgoing" || data.direction === "both") {
				where.push({
					field: "subjectId",
					value: data.objectId,
				});
			}

			if (data.relationshipType) {
				where.push({
					field: "relationshipType",
					value: data.relationshipType,
				});
			}

			// If both directions, we need to use OR logic
			if (data.direction === "both") {
				const relationships = await Promise.all([
					adapter.findMany<InferRelationship<O, false>>({
						model: "relationship",
						where: [
							{
								field: "objectId",
								value: data.objectId,
							},
							...(data.relationshipType
								? [
										{
											field: "relationshipType",
											value: data.relationshipType,
										},
									]
								: []),
						],
						limit: data.limit || 100,
						offset: data.offset || 0,
					}),
					adapter.findMany<InferRelationship<O, false>>({
						model: "relationship",
						where: [
							{
								field: "subjectId",
								value: data.objectId,
							},
							...(data.relationshipType
								? [
										{
											field: "relationshipType",
											value: data.relationshipType,
										},
									]
								: []),
						],
						limit: data.limit || 100,
						offset: data.offset || 0,
					}),
				]);

				const allRelationships = [...relationships[0], ...relationships[1]];
				return allRelationships.map((rel) => ({
					...rel,
					attributes:
						rel.attributes && typeof rel.attributes === "string"
							? parseJSON<Record<string, any>>(rel.attributes)
							: rel.attributes,
					metadata:
						rel.metadata && typeof rel.metadata === "string"
							? parseJSON<Record<string, any>>(rel.metadata)
							: rel.metadata,
				}));
			}

			const relationships = await adapter.findMany<InferRelationship<O, false>>(
				{
					model: "relationship",
					where,
					limit: data.limit || 100,
					offset: data.offset || 0,
				},
			);

			return relationships.map((rel) => ({
				...rel,
				attributes:
					rel.attributes && typeof rel.attributes === "string"
						? parseJSON<Record<string, any>>(rel.attributes)
						: rel.attributes,
				metadata:
					rel.metadata && typeof rel.metadata === "string"
						? parseJSON<Record<string, any>>(rel.metadata)
						: rel.metadata,
			}));
		},
		updateRelationship: async (
			relationshipId: string,
			data: Partial<RelationshipInput> & {
				attributes?: Record<string, any> | undefined;
				metadata?: Record<string, any> | undefined;
			},
		) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const relationship = await adapter.update<InferRelationship<O, false>>({
				model: "relationship",
				where: [
					{
						field: "id",
						value: relationshipId,
					},
				],
				update: {
					...data,
					attributes:
						typeof data.attributes === "object"
							? JSON.stringify(data.attributes)
							: data.attributes,
					metadata:
						typeof data.metadata === "object"
							? JSON.stringify(data.metadata)
							: data.metadata,
					updatedAt: new Date(),
				},
			});
			if (!relationship) {
				return null;
			}
			return {
				...relationship,
				attributes:
					relationship.attributes && typeof relationship.attributes === "string"
						? parseJSON<Record<string, any>>(relationship.attributes)
						: relationship.attributes,
				metadata:
					relationship.metadata && typeof relationship.metadata === "string"
						? parseJSON<Record<string, any>>(relationship.metadata)
						: relationship.metadata,
			};
		},
		deleteRelationship: async (relationshipId: string) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			await adapter.delete<InferRelationship<O, false>>({
				model: "relationship",
				where: [
					{
						field: "id",
						value: relationshipId,
					},
				],
			});
			return relationshipId;
		},

		// Schema Definition operations
		createSchemaDefinition: async (
			data: Omit<SchemaDefinitionInput, "id"> &
				Record<string, any> & {
					metadata?: Record<string, any> | undefined;
					createdBy?: string | undefined;
				},
		) => {
			const adapter = await getCurrentAdapter(baseAdapter);

			// If setting as active, deactivate all other schemas
			if (data.isActive) {
				const existingSchemas = await adapter.findMany<
					InferSchemaDefinition<O, false>
				>({
					model: "schemaDefinition",
					where: [
						{
							field: "isActive",
							value: true,
						},
					],
				});

				for (const schema of existingSchemas) {
					await adapter.update<InferSchemaDefinition<O, false>>({
						model: "schemaDefinition",
						where: [
							{
								field: "id",
								value: schema.id,
							},
						],
						update: {
							isActive: false,
							updatedAt: new Date(),
						},
					});
				}
			}

			const schemaDefinition = await adapter.create<
				typeof data,
				InferSchemaDefinition<O, false>
			>({
				model: "schemaDefinition",
				data: {
					...data,
					metadata: data.metadata ? JSON.stringify(data.metadata) : undefined,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});

			return {
				...schemaDefinition,
				metadata:
					schemaDefinition.metadata &&
					typeof schemaDefinition.metadata === "string"
						? parseJSON<Record<string, any>>(schemaDefinition.metadata)
						: schemaDefinition.metadata,
			} as typeof schemaDefinition;
		},
		findSchemaDefinition: async (data: {
			id?: string | undefined;
			version?: string | undefined;
			isActive?: boolean | undefined;
		}) => {
			const adapter = await getCurrentAdapter(baseAdapter);

			let schemaDefinition: InferSchemaDefinition<O, false> | null = null;

			if (data.id) {
				schemaDefinition = await adapter.findOne<
					InferSchemaDefinition<O, false>
				>({
					model: "schemaDefinition",
					where: [
						{
							field: "id",
							value: data.id,
						},
					],
				});
			} else if (data.version) {
				schemaDefinition = await adapter.findOne<
					InferSchemaDefinition<O, false>
				>({
					model: "schemaDefinition",
					where: [
						{
							field: "version",
							value: data.version,
						},
					],
				});
			} else if (data.isActive !== undefined) {
				schemaDefinition = await adapter.findOne<
					InferSchemaDefinition<O, false>
				>({
					model: "schemaDefinition",
					where: [
						{
							field: "isActive",
							value: data.isActive,
						},
					],
				});
			} else {
				// Default to active schema
				schemaDefinition = await adapter.findOne<
					InferSchemaDefinition<O, false>
				>({
					model: "schemaDefinition",
					where: [
						{
							field: "isActive",
							value: true,
						},
					],
				});
			}

			if (!schemaDefinition) {
				return null;
			}

			return {
				...schemaDefinition,
				metadata:
					schemaDefinition.metadata &&
					typeof schemaDefinition.metadata === "string"
						? parseJSON<Record<string, any>>(schemaDefinition.metadata)
						: schemaDefinition.metadata,
			} as typeof schemaDefinition;
		},
		updateSchemaDefinition: async (
			schemaDefinitionId: string,
			data: Partial<SchemaDefinitionInput> & {
				metadata?: Record<string, any> | undefined;
			},
		) => {
			const adapter = await getCurrentAdapter(baseAdapter);

			// Check if schema exists
			const existing = await adapter.findOne<InferSchemaDefinition<O, false>>({
				model: "schemaDefinition",
				where: [
					{
						field: "id",
						value: schemaDefinitionId,
					},
				],
			});

			if (!existing) {
				return null;
			}

			// If setting as active, deactivate all other schemas
			if (data.isActive === true) {
				const activeSchemas = await adapter.findMany<
					InferSchemaDefinition<O, false>
				>({
					model: "schemaDefinition",
					where: [
						{
							field: "isActive",
							value: true,
						},
						{
							field: "id",
							operator: "ne",
							value: schemaDefinitionId,
						},
					],
				});

				for (const schema of activeSchemas) {
					await adapter.update<InferSchemaDefinition<O, false>>({
						model: "schemaDefinition",
						where: [
							{
								field: "id",
								value: schema.id,
							},
						],
						update: {
							isActive: false,
							updatedAt: new Date(),
						},
					});
				}
			}

			const updateData: Record<string, any> = {
				updatedAt: new Date(),
			};

			if (data.version !== undefined) {
				updateData.version = data.version;
			}
			if (data.definition !== undefined) {
				updateData.definition = data.definition;
			}
			if (data.isActive !== undefined) {
				updateData.isActive = data.isActive;
			}
			if (data.metadata !== undefined) {
				updateData.metadata =
					typeof data.metadata === "object"
						? JSON.stringify(data.metadata)
						: data.metadata;
			}

			const schemaDefinition = await adapter.update<
				InferSchemaDefinition<O, false>
			>({
				model: "schemaDefinition",
				where: [
					{
						field: "id",
						value: schemaDefinitionId,
					},
				],
				update: updateData,
			});

			if (!schemaDefinition) {
				return null;
			}

			return {
				...schemaDefinition,
				metadata:
					schemaDefinition.metadata &&
					typeof schemaDefinition.metadata === "string"
						? parseJSON<Record<string, any>>(schemaDefinition.metadata)
						: schemaDefinition.metadata,
			};
		},
		listSchemaDefinitions: async (data: {
			limit?: number | undefined;
			offset?: number | undefined;
		}) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const [schemaDefinitions, total] = await Promise.all([
				adapter.findMany<InferSchemaDefinition<O, false>>({
					model: "schemaDefinition",
					limit: data.limit || 100,
					offset: data.offset || 0,
					sortBy: {
						field: "createdAt",
						direction: "desc",
					},
				}),
				adapter.count({
					model: "schemaDefinition",
				}),
			]);

			return {
				schemaDefinitions: schemaDefinitions.map((schema) => ({
					...schema,
					metadata:
						schema.metadata && typeof schema.metadata === "string"
							? parseJSON<Record<string, any>>(schema.metadata)
							: schema.metadata,
				})),
				total,
			};
		},
		setActiveSchemaDefinition: async (schemaDefinitionId: string) => {
			const adapter = await getCurrentAdapter(baseAdapter);

			// Check if schema exists
			const existing = await adapter.findOne<InferSchemaDefinition<O, false>>({
				model: "schemaDefinition",
				where: [
					{
						field: "id",
						value: schemaDefinitionId,
					},
				],
			});

			if (!existing) {
				return null;
			}

			// Deactivate all other schemas
			const activeSchemas = await adapter.findMany<
				InferSchemaDefinition<O, false>
			>({
				model: "schemaDefinition",
				where: [
					{
						field: "isActive",
						value: true,
					},
				],
			});

			for (const schema of activeSchemas) {
				await adapter.update<InferSchemaDefinition<O, false>>({
					model: "schemaDefinition",
					where: [
						{
							field: "id",
							value: schema.id,
						},
					],
					update: {
						isActive: false,
						updatedAt: new Date(),
					},
				});
			}

			// Activate the selected schema
			const schemaDefinition = await adapter.update<
				InferSchemaDefinition<O, false>
			>({
				model: "schemaDefinition",
				where: [
					{
						field: "id",
						value: schemaDefinitionId,
					},
				],
				update: {
					isActive: true,
					updatedAt: new Date(),
				},
			});

			if (!schemaDefinition) {
				return null;
			}

			return {
				...schemaDefinition,
				metadata:
					schemaDefinition.metadata &&
					typeof schemaDefinition.metadata === "string"
						? parseJSON<Record<string, any>>(schemaDefinition.metadata)
						: schemaDefinition.metadata,
			};
		},
	};
};
