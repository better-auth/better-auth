import {
	APIGroupSchema,
	OpenAPIGroupResourceSchema,
	SCIMGroupResourceSchema,
	SCIMGroupResourceType,
} from "./group-schemas";
import {
	APIUserSchema,
	OpenAPIUserResourceSchema,
	SCIMUserResourceSchema,
	SCIMUserResourceType,
} from "./user-schemas";

/**
 * The supported SCIM resource contract.
 *
 * Protocol consumers use this registry instead of maintaining independent
 * lists for validation, discovery, filtering, and response metadata.
 */
export const SCIM_RESOURCE_SCHEMA_REGISTRY = {
	User: {
		type: "User",
		schemaId: SCIMUserResourceSchema.id,
		inputSchema: APIUserSchema,
		openAPISchema: OpenAPIUserResourceSchema,
		discoverySchema: SCIMUserResourceSchema,
		resourceType: SCIMUserResourceType,
		filterAttributes: [
			"id",
			"userName",
			"externalId",
			"emails.value",
			"emails.work.value",
		] as const,
	},
	Group: {
		type: "Group",
		schemaId: SCIMGroupResourceSchema.id,
		inputSchema: APIGroupSchema,
		openAPISchema: OpenAPIGroupResourceSchema,
		discoverySchema: SCIMGroupResourceSchema,
		resourceType: SCIMGroupResourceType,
		filterAttributes: ["id", "displayName", "externalId"] as const,
	},
} as const;

export type SCIMResourceType = keyof typeof SCIM_RESOURCE_SCHEMA_REGISTRY;

/** Ordered registry entries used by SCIM discovery collection endpoints. */
export const SCIM_RESOURCE_SCHEMAS = [
	SCIM_RESOURCE_SCHEMA_REGISTRY.User,
	SCIM_RESOURCE_SCHEMA_REGISTRY.Group,
] as const;

/** Return the case-insensitive prefix accepted on core attribute paths. */
export function getSCIMCoreAttributePrefix(resourceType: SCIMResourceType) {
	return `${SCIM_RESOURCE_SCHEMA_REGISTRY[resourceType].schemaId}:`;
}

/** Remove a core schema prefix from an attribute path, case-insensitively. */
export function stripSCIMCoreAttributePrefix(
	resourceType: SCIMResourceType,
	attributePath: string,
): string {
	const prefix = getSCIMCoreAttributePrefix(resourceType);
	return attributePath.toLowerCase().startsWith(prefix.toLowerCase())
		? attributePath.slice(prefix.length)
		: attributePath;
}
