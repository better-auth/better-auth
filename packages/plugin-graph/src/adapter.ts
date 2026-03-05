import type { AuthContext } from "@better-auth/core";
import { getCurrentAdapter } from "@better-auth/core/context";
import type { GraphOptions } from "./types";

function parseJSONField<T>(value: unknown): T | null {
	if (value == null) return null;
	if (typeof value === "string") {
		try {
			return JSON.parse(value) as T;
		} catch {
			return null;
		}
	}
	return value as T;
}

/**
 * Creates a graph adapter that wraps the better-auth database adapter.
 * All operations go through `getCurrentAdapter()` to participate in
 * active transactions.
 */
export function getGraphAdapter<O extends GraphOptions>(
	context: AuthContext,
	_options?: O,
) {
	const baseAdapter = context.adapter;

	return {
		// ─── Object Operations ───────────────────────────────────────

		findObjectById: async (objectId: string) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const object = await adapter.findOne<Record<string, any>>({
				model: "object",
				where: [{ field: "id", value: objectId }],
			});
			if (!object) return null;
			return {
				...object,
				attributes: parseJSONField<Record<string, any>>(object.attributes),
				metadata: parseJSONField<Record<string, any>>(object.metadata),
			};
		},

		findObjectByExternal: async (data: {
			externalId: string;
			externalType: string;
		}) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const object = await adapter.findOne<Record<string, any>>({
				model: "object",
				where: [
					{ field: "externalId", value: data.externalId },
					{ field: "externalType", value: data.externalType },
				],
			});
			if (!object) return null;
			return {
				...object,
				attributes: parseJSONField<Record<string, any>>(object.attributes),
				metadata: parseJSONField<Record<string, any>>(object.metadata),
			};
		},

		getOrCreateObject: async (data: {
			type: string;
			externalId?: string;
			externalType?: string;
			attributes?: Record<string, any>;
			metadata?: Record<string, any>;
		}) => {
			const adapter = await getCurrentAdapter(baseAdapter);

			// Try to find existing by external reference
			if (data.externalId && data.externalType) {
				const existing = await adapter.findOne<Record<string, any>>({
					model: "object",
					where: [
						{ field: "externalId", value: data.externalId },
						{ field: "externalType", value: data.externalType },
					],
				});
				if (existing) {
					return {
						...existing,
						attributes: parseJSONField<Record<string, any>>(
							existing.attributes,
						),
						metadata: parseJSONField<Record<string, any>>(existing.metadata),
					};
				}
			}

			// Create new object
			const created = await adapter.create<Record<string, any>>({
				model: "object",
				data: {
					type: data.type,
					externalId: data.externalId ?? null,
					externalType: data.externalType ?? null,
					attributes: data.attributes
						? JSON.stringify(data.attributes)
						: null,
					metadata: data.metadata ? JSON.stringify(data.metadata) : null,
					createdAt: new Date(),
				},
			});
			return {
				...created,
				attributes: data.attributes ?? null,
				metadata: data.metadata ?? null,
			};
		},

		// ─── Relationship Operations ─────────────────────────────────

		createRelationship: async (data: {
			subjectId: string;
			subjectType: string;
			objectId: string;
			objectType: string;
			relationshipType: string;
			attributes?: Record<string, any>;
			metadata?: Record<string, any>;
		}) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			return adapter.create<Record<string, any>>({
				model: "relationship",
				data: {
					subjectId: data.subjectId,
					subjectType: data.subjectType,
					objectId: data.objectId,
					objectType: data.objectType,
					relationshipType: data.relationshipType,
					attributes: data.attributes
						? JSON.stringify(data.attributes)
						: null,
					metadata: data.metadata ? JSON.stringify(data.metadata) : null,
					createdAt: new Date(),
				},
			});
		},

		deleteRelationship: async (relationshipId: string) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			await adapter.delete({
				model: "relationship",
				where: [{ field: "id", value: relationshipId }],
			});
		},

		findRelationships: async (params: {
			objectId: string;
			direction?: "incoming" | "outgoing" | "both";
			relationshipType?: string;
		}) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			const direction = params.direction || "both";
			const results: Record<string, any>[] = [];

			if (direction === "outgoing" || direction === "both") {
				const outgoing = await adapter.findMany<Record<string, any>>({
					model: "relationship",
					where: [
						{ field: "subjectId", value: params.objectId },
						...(params.relationshipType
							? [
									{
										field: "relationshipType",
										value: params.relationshipType,
									},
								]
							: []),
					],
				});
				results.push(...outgoing);
			}

			if (direction === "incoming" || direction === "both") {
				const incoming = await adapter.findMany<Record<string, any>>({
					model: "relationship",
					where: [
						{ field: "objectId", value: params.objectId },
						...(params.relationshipType
							? [
									{
										field: "relationshipType",
										value: params.relationshipType,
									},
								]
							: []),
					],
				});
				results.push(...incoming);
			}

			return results.map((r) => ({
				...r,
				attributes: parseJSONField<Record<string, any>>(r.attributes),
				metadata: parseJSONField<Record<string, any>>(r.metadata),
			}));
		},

		// ─── Schema Definition Operations ────────────────────────────

		createSchemaDefinition: async (data: {
			version: string;
			definition: string;
			isActive?: boolean;
			metadata?: Record<string, any>;
			createdBy?: string;
		}) => {
			const adapter = await getCurrentAdapter(baseAdapter);

			// If setting as active, deactivate all others first
			if (data.isActive) {
				await adapter.updateMany({
					model: "schemaDefinition",
					where: [{ field: "isActive", value: true }],
					update: { isActive: false },
				});
			}

			return adapter.create<Record<string, any>>({
				model: "schemaDefinition",
				data: {
					version: data.version,
					definition: data.definition,
					isActive: data.isActive ?? false,
					metadata: data.metadata ? JSON.stringify(data.metadata) : null,
					createdBy: data.createdBy ?? null,
					createdAt: new Date(),
				},
			});
		},

		updateSchemaDefinition: async (
			id: string,
			data: {
				version?: string;
				definition?: string;
				isActive?: boolean;
				metadata?: Record<string, any>;
			},
		) => {
			const adapter = await getCurrentAdapter(baseAdapter);

			if (data.isActive) {
				await adapter.updateMany({
					model: "schemaDefinition",
					where: [{ field: "isActive", value: true }],
					update: { isActive: false },
				});
			}

			return adapter.update<Record<string, any>>({
				model: "schemaDefinition",
				where: [{ field: "id", value: id }],
				update: {
					...(data.version !== undefined && { version: data.version }),
					...(data.definition !== undefined && {
						definition: data.definition,
					}),
					...(data.isActive !== undefined && { isActive: data.isActive }),
					...(data.metadata !== undefined && {
						metadata: JSON.stringify(data.metadata),
					}),
					updatedAt: new Date(),
				},
			});
		},

		findSchemaDefinitionById: async (id: string) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			return adapter.findOne<Record<string, any>>({
				model: "schemaDefinition",
				where: [{ field: "id", value: id }],
			});
		},

		listSchemaDefinitions: async (params?: {
			isActive?: boolean;
			limit?: number;
			offset?: number;
		}) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			return adapter.findMany<Record<string, any>>({
				model: "schemaDefinition",
				where: params?.isActive !== undefined
					? [{ field: "isActive", value: params.isActive }]
					: undefined,
				limit: params?.limit,
				offset: params?.offset,
				sortBy: { field: "createdAt", direction: "desc" },
			});
		},

		setActiveSchemaDefinition: async (id: string) => {
			const adapter = await getCurrentAdapter(baseAdapter);
			// Deactivate all
			await adapter.updateMany({
				model: "schemaDefinition",
				where: [{ field: "isActive", value: true }],
				update: { isActive: false },
			});
			// Activate the one
			return adapter.update<Record<string, any>>({
				model: "schemaDefinition",
				where: [{ field: "id", value: id }],
				update: { isActive: true, updatedAt: new Date() },
			});
		},
	};
}

export type GraphAdapter = ReturnType<typeof getGraphAdapter>;
