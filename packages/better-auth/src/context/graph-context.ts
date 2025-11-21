import type { BetterAuthOptions } from "@better-auth/core";
import {
	type Relationship,
	type GraphAdapter,
	getCurrentAdapter,
} from "@better-auth/core/context";
import { AuthzedSyncClient } from "../plugins";
import type { DBAdapter } from "../types";
import { generateId } from "../utils";

type RelationshipWriteRequest = Relationship & {
	operation: "create" | "delete" | "touch";
};

export async function initializeGraph(authzedClient: AuthzedSyncClient) {
	console.log("initializing graph");
	const result = await authzedClient.syncRelationshipsBatch([
		{
			objectId: "platform_admin",
			objectType: "platform_role",
			relationshipType: "platform",
			subjectId: "default",
			subjectType: "platform",
			operation: "touch",
		},
		{
			objectId: "platform_user",
			objectType: "platform_role",
			relationshipType: "platform",
			subjectId: "default",
			subjectType: "platform",
			operation: "touch",
		},
		{
			objectId: "default",
			objectType: "platform",
			relationshipType: "org_administrator",
			subjectId: "platform_admin",
			subjectType: "platform_role",
			optionalRelation: "member",
			operation: "touch",
		},
		{
			objectId: "default",
			objectType: "platform",
			relationshipType: "role_manager",
			subjectId: "platform_admin",
			subjectType: "platform_role",
			optionalRelation: "member",
			operation: "touch",
		},
		{
			objectId: "default",
			objectType: "platform",
			relationshipType: "user_administrator",
			subjectId: "platform_admin",
			subjectType: "platform_role",
			optionalRelation: "member",
			operation: "touch",
		},
		{
			objectId: "default",
			objectType: "platform",
			relationshipType: "org_creator",
			subjectId: "platform_user",
			subjectType: "platform_role",
			optionalRelation: "member",
			operation: "touch",
		},
	]);
	console.log("result", result);
	console.log("graph initialized");
}

export function createGraphAdapter(
	adapter: DBAdapter<BetterAuthOptions>,
	options: BetterAuthOptions,
	authzedClient?: AuthzedSyncClient,
): GraphAdapter {
	let relations: RelationshipWriteRequest[] = [];
	authzedClient ??= new AuthzedSyncClient({
		token: options.graph?.authzed?.token || "",
		endpoint: options.graph?.authzed?.endpoint || "http://localhost:50051",
	});
	const id = generateId();
	const graphAdapter = {
		id,
		migrate: async () => {
			if (options.graph?.authzed?.schema) {
				await authzedClient.writeSchema(options.graph.authzed.schema);
			}
		},
		addRelationship: async (relationship: Relationship) => {
			console.log("adding relationship", id, relationship);
			relations.push({
				...relationship,
				operation: "create",
			});
		},
		deleteRelationship: async (relationship: Relationship) => {
			relations.push({
				...relationship,
				operation: "delete",
			});
		},
		check: async (
			subjectType: string,
			subjectId: string,
			relationshipType: string,
			objectType: string,
			objectId: string,
		) => {
			return await authzedClient.can(
				subjectType,
				subjectId,
				relationshipType,
				objectType,
				objectId,
			);
		},
		commit: async () => {
			// await dbAdapter.createMany({
			// 	model: "relationship",
			// 	data: relations.map((relation) => ({
			// 		objectId: relation.objectId,
			// 		objectType: relation.objectType,
			// 		relationshipType: relation.relationshipType,
			// 		subjectId: relation.subjectId,
			// 		subjectType: relation.subjectType,
			// 		createdAt: new Date(),
			// 		updatedAt: new Date(),
			// 	})),
			// });
			console.log("syncing relationships", id, relations);
			relations.forEach((relation) => {
				console.log(
					"relation",
					`${relation.subjectType}:${relation.subjectId} -> ${relation.relationshipType}:${relation.objectType}:${relation.objectId}`,
				);
			});
			try {
				await authzedClient.syncRelationshipsBatch(relations);
			} catch (error) {
				console.error("error syncing relationships", error);
				throw error;
			}
			relations = [];
		},
		transaction: () => {
			return createGraphAdapter(adapter, options, authzedClient);
		},
	} satisfies GraphAdapter;

	return graphAdapter;
}
