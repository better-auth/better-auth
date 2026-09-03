import {
	APIGroupSchema,
	OpenAPIGroupResourceSchema,
	SCIMGroupResourceSchema,
	SCIMGroupResourceType,
} from "./group-schemas";
import {
	APIUserSchema,
	OpenAPIUserResourceSchema,
	SCIM_ENTERPRISE_USER_SCHEMA_DESCRIPTOR,
	SCIM_USER_SCHEMA_DESCRIPTORS,
	SCIMUserResourceSchema,
	SCIMUserResourceType,
} from "./user-schemas";

interface SCIMBuiltInSchemaDescriptor {
	id: string;
	required: boolean;
	canonicalAttribute?: "enterprise";
	discoverySchema: {
		id: string;
		meta: { location: string };
		[key: string]: unknown;
	};
}

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
		schemas: SCIM_USER_SCHEMA_DESCRIPTORS,
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
		schemas: [
			{
				id: SCIMGroupResourceSchema.id,
				required: true,
				discoverySchema: SCIMGroupResourceSchema,
			},
		],
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

/** Ordered built-in schema descriptors advertised by SCIM discovery. */
export const SCIM_DISCOVERY_SCHEMA_DESCRIPTORS = [
	...SCIM_RESOURCE_SCHEMA_REGISTRY.User.schemas,
	...SCIM_RESOURCE_SCHEMA_REGISTRY.Group.schemas,
] satisfies readonly SCIMBuiltInSchemaDescriptor[];

/** Standard Enterprise User descriptor owned by the User registry entry. */
export { SCIM_ENTERPRISE_USER_SCHEMA_DESCRIPTOR };

/** Return the case-insensitive prefix accepted on core attribute paths. */
function getSCIMCoreAttributePrefix(resourceType: SCIMResourceType) {
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

type SCIMSchemaDescriptorEntry =
	(typeof SCIM_RESOURCE_SCHEMA_REGISTRY)[SCIMResourceType]["schemas"][number];

/**
 * Resolve a schema-qualified or explicitly supported input-alias path to the
 * attribute path used on one side of the wire (response serialization or
 * canonical persistence). Longest schema identifiers win because SCIM URNs
 * contain colons. Shares the extension's `inputPathAliases` table between
 * both sides so a provider-side bare sub-attribute name (Microsoft Entra
 * sends `attributes=...,manager` rather than the schema-qualified path) also
 * matches. `mapAttribute` selects which descriptor field names the target
 * container (`responseAttribute` or `canonicalAttribute`) so the two sides
 * cannot drift out of sync with each other.
 */
function resolveSCIMAttributePath(
	resourceType: SCIMResourceType,
	attributePath: string,
	mapAttribute: (descriptor: SCIMSchemaDescriptorEntry) => string | undefined,
): string {
	const descriptors = [
		...SCIM_RESOURCE_SCHEMA_REGISTRY[resourceType].schemas,
	].sort((left, right) => right.id.length - left.id.length);
	const normalizedPath = attributePath.toLowerCase();

	for (const descriptor of descriptors) {
		const mappedAttribute = mapAttribute(descriptor);

		if ("inputPathAliases" in descriptor) {
			for (const alias of descriptor.inputPathAliases) {
				const normalizedAlias = alias.path.toLowerCase();
				if (
					normalizedPath !== normalizedAlias &&
					!normalizedPath.startsWith(`${normalizedAlias}.`)
				) {
					continue;
				}
				const suffix = attributePath.slice(alias.path.length);
				return mappedAttribute
					? `${mappedAttribute}.${alias.relativePath}${suffix}`
					: `${alias.relativePath}${suffix}`;
			}
		}

		const normalizedSchemaId = descriptor.id.toLowerCase();
		if (normalizedPath === normalizedSchemaId) {
			return mappedAttribute ?? attributePath;
		}
		const prefix = `${normalizedSchemaId}:`;
		if (!normalizedPath.startsWith(prefix)) continue;

		const relativePath = attributePath.slice(descriptor.id.length + 1);
		return mappedAttribute
			? `${mappedAttribute}.${relativePath}`
			: relativePath;
	}

	return attributePath;
}

/** Resolve a schema-qualified or input-alias path to the response object's attribute path. */
export function resolveSCIMResponseAttributePath(
	resourceType: SCIMResourceType,
	attributePath: string,
): string {
	return resolveSCIMAttributePath(resourceType, attributePath, (descriptor) =>
		"responseAttribute" in descriptor
			? descriptor.responseAttribute
			: undefined,
	);
}

/** Resolve a schema-qualified or input-alias path to the canonical persistence attribute path. */
export function resolveSCIMCanonicalAttributePath(
	resourceType: SCIMResourceType,
	attributePath: string,
): string {
	return resolveSCIMAttributePath(resourceType, attributePath, (descriptor) =>
		"canonicalAttribute" in descriptor
			? descriptor.canonicalAttribute
			: undefined,
	);
}
