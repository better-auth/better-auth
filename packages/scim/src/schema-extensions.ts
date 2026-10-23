import * as z from "zod";
import type {
	SCIMUserSchemaExtension,
	SCIMUserSchemaExtensionAttribute,
	SCIMUserSchemaExtensionAttributeType,
} from "./configuration";
import type { SCIMDiscoveryAttribute } from "./user-schemas";
import { SCIM_ENTERPRISE_USER_SCHEMA, SCIM_USER_SCHEMA } from "./user-schemas";

const SCIM_SCHEMA_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:Schema";
const SCIM_GROUP_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:Group";
const SCIM_RESOURCE_TYPE_SCHEMA =
	"urn:ietf:params:scim:schemas:core:2.0:ResourceType";

/** Schema URNs an application-defined extension must not redeclare. */
const RESERVED_SCHEMA_URNS: ReadonlySet<string> = new Set([
	SCIM_USER_SCHEMA,
	SCIM_ENTERPRISE_USER_SCHEMA,
	SCIM_GROUP_SCHEMA,
	SCIM_SCHEMA_SCHEMA,
	SCIM_RESOURCE_TYPE_SCHEMA,
]);

/** RFC 3339 date-time, as SCIM requires for the `dateTime` attribute type. */
const SCIM_RFC3339_PATTERN =
	/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/** Permitted SCIM attribute names: a letter or `$`, then letters/digits/`-`/`_`. */
const SCIM_ATTRIBUTE_NAME_PATTERN = /^[A-Za-z$][A-Za-z0-9$_-]*$/;

const SCIM_EXTENSION_STRING_MAX_LENGTH = 1_024;
const SCIM_EXTENSION_REFERENCE_MAX_LENGTH = 2_048;

const SCIM_EXTENSION_ATTRIBUTE_TYPES: ReadonlySet<string> =
	new Set<SCIMUserSchemaExtensionAttributeType>([
		"string",
		"boolean",
		"integer",
		"decimal",
		"dateTime",
		"reference",
	]);

/** One compiled attribute carrying the metadata the write path needs. */
export interface CompiledUserSchemaExtensionAttribute {
	name: string;
	type: SCIMUserSchemaExtensionAttributeType;
	required: boolean;
	/** When the attribute is returned in a response. */
	returned: "default" | "always" | "never";
	/** The `user.additionalFields` key this attribute is written to, if any. */
	mapTo?: string;
}

/**
 * The complete protocol and storage behavior compiled from one application
 * defined extension. Structurally compatible with the built-in extension
 * descriptors so the registry can consume both uniformly.
 */
export interface CompiledUserSchemaExtensionDescriptor {
	kind: "extension";
	id: string;
	/** Extensions are never required in a resource's `schemas` array. */
	required: false;
	inputPathAliases: readonly { path: string; relativePath: string }[];
	inputSchema: z.ZodType;
	canonicalSchema: z.ZodType;
	canonicalAttribute: string;
	responseAttribute: string;
	discoverySchema: {
		id: string;
		schemas: readonly string[];
		name: string;
		description: string;
		attributes: readonly SCIMDiscoveryAttribute[];
		meta: { resourceType: "Schema"; location: string };
	};
	openAPISchema: Record<string, unknown>;
	/** The declared attributes, retained for persistence and field mapping. */
	attributes: readonly CompiledUserSchemaExtensionAttribute[];
	/**
	 * Per-attribute scalar validators keyed by attribute name, used to validate a
	 * single attribute value targeted by a PATCH path without requiring the whole
	 * extension object.
	 */
	attributeInputSchemas: Record<string, z.ZodType>;
}

/**
 * Unwrap a single-element array before validation. Microsoft Entra sometimes
 * wraps a single-valued attribute's PATCH replace value in an array.
 */
function scimSingleValueScalar<Schema extends z.ZodType>(schema: Schema) {
	return z.preprocess(
		(value) => (Array.isArray(value) && value.length === 1 ? value[0] : value),
		schema,
	);
}

function scalarSchemaFor(
	type: SCIMUserSchemaExtensionAttributeType,
): z.ZodType {
	switch (type) {
		case "boolean":
			return z.boolean();
		case "integer":
			return z.number().int();
		case "decimal":
			return z.number();
		case "reference":
			return z.string().trim().min(1).max(SCIM_EXTENSION_REFERENCE_MAX_LENGTH);
		case "dateTime":
			return z
				.string()
				.trim()
				.min(1)
				.refine(
					(value) =>
						SCIM_RFC3339_PATTERN.test(value) &&
						!Number.isNaN(new Date(value).getTime()),
					{ message: "must be a valid RFC 3339 dateTime" },
				);
		case "string":
			return z.string().trim().min(1).max(SCIM_EXTENSION_STRING_MAX_LENGTH);
	}
}

function openAPISchemaFor(
	type: SCIMUserSchemaExtensionAttributeType,
): Record<string, unknown> {
	switch (type) {
		case "boolean":
			return { type: "boolean" };
		case "integer":
			return { type: "integer" };
		case "decimal":
			return { type: "number" };
		case "reference":
			return { type: "string", maxLength: SCIM_EXTENSION_REFERENCE_MAX_LENGTH };
		case "dateTime":
			return { type: "string", format: "date-time" };
		case "string":
			return { type: "string", maxLength: SCIM_EXTENSION_STRING_MAX_LENGTH };
	}
}

function discoveryAttributeFor(
	attribute: SCIMUserSchemaExtensionAttribute,
): SCIMDiscoveryAttribute {
	return {
		name: attribute.name,
		type: attribute.type ?? "string",
		multiValued: false,
		description: attribute.description ?? "",
		required: attribute.required ?? false,
		caseExact: attribute.caseExact ?? false,
		mutability: "readWrite",
		returned: attribute.returned ?? "default",
		uniqueness: "none",
	};
}

function buildExtensionObjectSchema(
	attributes: readonly SCIMUserSchemaExtensionAttribute[],
	options: { input: boolean },
): z.ZodType {
	const shape: Record<string, z.ZodType> = {};
	for (const attribute of attributes) {
		const scalar = scalarSchemaFor(attribute.type ?? "string");
		const field = options.input ? scimSingleValueScalar(scalar) : scalar;
		shape[attribute.name] = attribute.required ? field : field.optional();
	}
	// Input is strict so an undeclared attribute inside a declared extension is
	// rejected. Canonical persistence is lenient so historical rows still read.
	return options.input ? z.strictObject(shape) : z.object(shape);
}

function fail(urn: string, message: string): never {
	throw new Error(`Invalid SCIM user schema extension "${urn}": ${message}`);
}

/**
 * Compile one application-defined User schema extension into a descriptor the
 * SCIM registry can consume alongside the built-in core and Enterprise
 * descriptors. Throws on an invalid declaration.
 */
export function compileUserSchemaExtension(
	extension: SCIMUserSchemaExtension,
): CompiledUserSchemaExtensionDescriptor {
	const urn = extension.urn?.trim();
	if (!urn) {
		throw new Error("Invalid SCIM user schema extension: urn is required");
	}
	if (RESERVED_SCHEMA_URNS.has(urn)) {
		fail(urn, "urn must not be a built-in SCIM schema");
	}
	if (!extension.name?.trim()) {
		fail(urn, "name is required");
	}
	if (!extension.attributes || extension.attributes.length === 0) {
		fail(urn, "at least one attribute is required");
	}

	const seenNames = new Set<string>();
	const compiledAttributes: CompiledUserSchemaExtensionAttribute[] = [];
	for (const attribute of extension.attributes) {
		const name = attribute.name?.trim();
		if (!name || !SCIM_ATTRIBUTE_NAME_PATTERN.test(name)) {
			fail(urn, `attribute name "${attribute.name}" is not a valid SCIM name`);
		}
		const lowerName = name.toLowerCase();
		if (seenNames.has(lowerName)) {
			fail(urn, `attribute "${name}" is declared more than once`);
		}
		seenNames.add(lowerName);

		const type = attribute.type ?? "string";
		if (!SCIM_EXTENSION_ATTRIBUTE_TYPES.has(type)) {
			fail(urn, `attribute "${name}" has unsupported type "${type}"`);
		}
		if (attribute.mapTo !== undefined && !attribute.mapTo.trim()) {
			fail(urn, `attribute "${name}" has an empty mapTo`);
		}
		compiledAttributes.push({
			name,
			type,
			required: attribute.required ?? false,
			returned: attribute.returned ?? "default",
			...(attribute.mapTo === undefined
				? {}
				: { mapTo: attribute.mapTo.trim() }),
		});
	}

	const normalizedAttributes = extension.attributes.map((attribute) => ({
		...attribute,
		name: attribute.name.trim(),
	}));

	return {
		kind: "extension",
		id: urn,
		required: false,
		inputPathAliases: [],
		inputSchema: buildExtensionObjectSchema(normalizedAttributes, {
			input: true,
		}),
		canonicalSchema: buildExtensionObjectSchema(normalizedAttributes, {
			input: false,
		}),
		canonicalAttribute: urn,
		responseAttribute: urn,
		discoverySchema: {
			id: urn,
			schemas: [SCIM_SCHEMA_SCHEMA],
			name: extension.name.trim(),
			description: extension.description?.trim() ?? "",
			attributes: normalizedAttributes.map(discoveryAttributeFor),
			meta: {
				resourceType: "Schema",
				location: `/scim/v2/Schemas/${urn}`,
			},
		},
		openAPISchema: {
			type: "object",
			properties: Object.fromEntries(
				compiledAttributes.map((attribute) => [
					attribute.name,
					openAPISchemaFor(attribute.type),
				]),
			),
			...(compiledAttributes.some((attribute) => attribute.required)
				? {
						required: compiledAttributes
							.filter((attribute) => attribute.required)
							.map((attribute) => attribute.name),
					}
				: {}),
		},
		attributes: compiledAttributes,
		attributeInputSchemas: Object.fromEntries(
			compiledAttributes.map((attribute) => [
				attribute.name,
				scimSingleValueScalar(scalarSchemaFor(attribute.type)),
			]),
		),
	};
}

/**
 * Compile every declared User schema extension. Enforces that schema URNs are
 * unique and that no two attributes map to the same `user` field.
 */
export function compileUserSchemaExtensions(
	extensions: readonly SCIMUserSchemaExtension[] | undefined,
): readonly CompiledUserSchemaExtensionDescriptor[] {
	if (!extensions || extensions.length === 0) return [];

	const seenUrns = new Set<string>();
	const seenMapTargets = new Set<string>();
	const compiled: CompiledUserSchemaExtensionDescriptor[] = [];
	for (const extension of extensions) {
		const descriptor = compileUserSchemaExtension(extension);
		const lowerUrn = descriptor.id.toLowerCase();
		if (seenUrns.has(lowerUrn)) {
			fail(descriptor.id, "urn is declared more than once");
		}
		seenUrns.add(lowerUrn);

		for (const attribute of descriptor.attributes) {
			if (attribute.mapTo === undefined) continue;
			if (seenMapTargets.has(attribute.mapTo)) {
				fail(
					descriptor.id,
					`mapTo "${attribute.mapTo}" is already mapped by another attribute`,
				);
			}
			seenMapTargets.add(attribute.mapTo);
		}
		compiled.push(descriptor);
	}
	return compiled;
}
