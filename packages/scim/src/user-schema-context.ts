import type {
	SCIMOptions,
	SCIMUserSchemaExtensionAttributeType,
} from "./configuration";
import {
	SCIM_DISCOVERY_SCHEMA_DESCRIPTORS,
	SCIM_RESOURCE_SCHEMA_REGISTRY,
} from "./resource-schema-registry";
import type { CompiledUserSchemaExtensionDescriptor } from "./schema-extensions";
import { compileUserSchemaExtensions } from "./schema-extensions";
import {
	buildAPIUserSchema,
	buildCanonicalUserAttributesSchema,
	buildOpenAPIUserResourceSchema,
	buildUserResourceType,
} from "./user-schemas";

/** One custom attribute mapped onto a `user.additionalFields` key. */
export interface SCIMMappedUserAttribute {
	/** The extension schema URN carrying the attribute. */
	urn: string;
	/** The attribute's SCIM name. */
	name: string;
	/** The `user.additionalFields` key the attribute is written to. */
	mapTo: string;
	/** The attribute's SCIM type. */
	type: SCIMUserSchemaExtensionAttributeType;
}

interface SCIMDiscoveryEntry {
	id: string;
	meta: { location: string };
	[key: string]: unknown;
}

/**
 * The per-instance SCIM User schema surface. Built once from
 * `options.userSchemaExtensions`, it carries the custom-aware validation,
 * persistence, discovery, and field-mapping data the endpoints consume. With
 * no declared extensions it is equivalent to the built-in behavior.
 */
export interface SCIMUserSchemaContext {
	customDescriptors: readonly CompiledUserSchemaExtensionDescriptor[];
	inputSchema: ReturnType<typeof buildAPIUserSchema>;
	canonicalSchema: ReturnType<typeof buildCanonicalUserAttributesSchema>;
	openAPISchema: ReturnType<typeof buildOpenAPIUserResourceSchema>;
	userResourceType: ReturnType<typeof buildUserResourceType>;
	discoverySchemas: readonly SCIMDiscoveryEntry[];
	resourceTypes: readonly SCIMDiscoveryEntry[];
	mappedAttributes: readonly SCIMMappedUserAttribute[];
}

/** Build the per-instance SCIM User schema context from plugin options. */
export function buildSCIMUserSchemaContext(
	options: SCIMOptions,
): SCIMUserSchemaContext {
	const customDescriptors = compileUserSchemaExtensions(
		options.userSchemaExtensions,
	);
	const userResourceType = buildUserResourceType(customDescriptors);
	const discoverySchemas: SCIMDiscoveryEntry[] = [
		...SCIM_DISCOVERY_SCHEMA_DESCRIPTORS.map(
			(descriptor) => descriptor.discoverySchema,
		),
		...customDescriptors.map((descriptor) => descriptor.discoverySchema),
	];
	const resourceTypes: SCIMDiscoveryEntry[] = [
		userResourceType,
		SCIM_RESOURCE_SCHEMA_REGISTRY.Group.resourceType,
	];
	const mappedAttributes: SCIMMappedUserAttribute[] = customDescriptors.flatMap(
		(descriptor) =>
			descriptor.attributes
				.filter(
					(attribute): attribute is typeof attribute & { mapTo: string } =>
						attribute.mapTo !== undefined,
				)
				.map((attribute) => ({
					urn: descriptor.id,
					name: attribute.name,
					mapTo: attribute.mapTo,
					type: attribute.type,
				})),
	);

	return {
		customDescriptors,
		inputSchema: buildAPIUserSchema(customDescriptors),
		canonicalSchema: buildCanonicalUserAttributesSchema(customDescriptors),
		openAPISchema: buildOpenAPIUserResourceSchema(customDescriptors),
		userResourceType,
		discoverySchemas,
		resourceTypes,
		mappedAttributes,
	};
}

/** The `user.additionalFields` entry shape this validator inspects. */
interface SCIMUserAdditionalField {
	type?: unknown;
	required?: boolean;
	input?: boolean;
}

/** The Better Auth additionalField type each SCIM attribute type maps onto. */
function expectedAdditionalFieldType(
	type: SCIMUserSchemaExtensionAttributeType,
): "string" | "number" | "boolean" | "date" {
	switch (type) {
		case "integer":
		case "decimal":
			return "number";
		case "boolean":
			return "boolean";
		case "dateTime":
			return "date";
		case "string":
		case "reference":
			return "string";
	}
}

/**
 * Validate that every mapped custom attribute targets a declared, optional,
 * type-compatible `user.additionalFields` entry. Throws (via `fail`) on a
 * misconfiguration, and calls `warn` for a mapped field that end users can
 * write, which would let a user spoof a provisioned value.
 */
export function validateMappedUserFields(
	context: SCIMUserSchemaContext,
	additionalFields: Record<string, SCIMUserAdditionalField> | undefined,
	handlers: {
		fail: (message: string) => never;
		warn: (message: string) => void;
	},
): void {
	for (const mapped of context.mappedAttributes) {
		const field = additionalFields?.[mapped.mapTo];
		if (!field) {
			handlers.fail(
				`SCIM extension attribute "${mapped.urn}:${mapped.name}" maps to user.additionalFields.${mapped.mapTo}, which is not declared on the user model.`,
			);
		}
		if (field.required === true) {
			handlers.fail(
				`SCIM mapped user field "${mapped.mapTo}" must be optional so it can be cleared on replace or deprovision.`,
			);
		}
		const expected = expectedAdditionalFieldType(mapped.type);
		if (field.type !== expected) {
			handlers.fail(
				`SCIM mapped user field "${mapped.mapTo}" has type "${String(field.type)}" but the "${mapped.type}" attribute requires "${expected}".`,
			);
		}
		if (field.input !== false) {
			handlers.warn(
				`SCIM mapped user field "${mapped.mapTo}" is end-user writable. Declare it with input: false so only SCIM can set it.`,
			);
		}
	}
}
