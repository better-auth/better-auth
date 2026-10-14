import type { SCIMResourceType } from "./resource-schema-registry";
import { SCIM_RESOURCE_SCHEMA_REGISTRY } from "./resource-schema-registry";
import { createSCIMError } from "./scim-error";

/**
 * RFC 7643 Section 2.1 makes attribute names case-insensitive. These helpers
 * rewrite request keys to the names the resource schema declares, so the rest
 * of the plugin can match attributes exactly. Unknown keys are left unchanged.
 */

/** An attribute name and its sub-attribute names. */
export interface SCIMAttributeName {
	name: string;
	subAttributes?: readonly SCIMAttributeName[];
}

interface SCIMResourceAttributeNames {
	attributes: readonly SCIMAttributeName[];
	extensions: readonly {
		id: string;
		attributes: readonly SCIMAttributeName[];
	}[];
}

/** Attributes RFC 7643 Section 3.1 defines on every resource. */
const SCIM_COMMON_ATTRIBUTES: readonly SCIMAttributeName[] = [
	{ name: "schemas" },
	{ name: "id" },
	{ name: "externalId" },
	{ name: "meta" },
];

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function findAttribute(
	attributes: readonly SCIMAttributeName[],
	key: string,
): SCIMAttributeName | undefined {
	const name = key.toLowerCase();
	return attributes.find((attribute) => attribute.name.toLowerCase() === name);
}

function readResourceAttributeNames(
	resourceType: SCIMResourceType,
): SCIMResourceAttributeNames {
	const registry = SCIM_RESOURCE_SCHEMA_REGISTRY[resourceType];
	return {
		attributes: [
			...SCIM_COMMON_ATTRIBUTES,
			...registry.discoverySchema.attributes,
		],
		extensions: registry.schemas
			.filter((schema) => schema.id !== registry.schemaId)
			.map((schema) => ({
				id: schema.id,
				attributes: schema.discoverySchema.attributes,
			})),
	};
}

function canonicalizeRecord(
	record: Record<string, unknown>,
	names: SCIMResourceAttributeNames,
): Record<string, unknown> {
	let changed = false;
	const seenNames = new Set<string>();
	const entries: [string, unknown][] = [];
	for (const [key, entry] of Object.entries(record)) {
		const extension = names.extensions.find(
			(candidate) => candidate.id.toLowerCase() === key.toLowerCase(),
		);
		const attribute = extension
			? undefined
			: findAttribute(names.attributes, key);
		const name = extension?.id ?? attribute?.name ?? key;
		if (seenNames.has(name)) {
			throw createSCIMError("BAD_REQUEST", {
				detail: `${name} appears more than once with different letter case`,
				scimType: "invalidSyntax",
			});
		}
		const subAttributes = extension?.attributes ?? attribute?.subAttributes;
		const value = subAttributes
			? canonicalizeSCIMAttributeNames(entry, subAttributes)
			: entry;
		if (name !== key || value !== entry) changed = true;
		seenNames.add(name);
		entries.push([name, value]);
	}
	// fromEntries keeps a `__proto__` key as data instead of setting the prototype.
	return changed ? Object.fromEntries(entries) : record;
}

/**
 * Rewrite the keys of a complex value, or of each complex entry in an array,
 * to the declared sub-attribute names. Nested arrays are left unchanged.
 */
export function canonicalizeSCIMAttributeNames(
	value: unknown,
	attributes: readonly SCIMAttributeName[],
): unknown {
	const names = { attributes, extensions: [] };
	if (isRecord(value)) return canonicalizeRecord(value, names);
	if (!Array.isArray(value)) return value;
	let changed = false;
	const entries = value.map((entry) => {
		if (!isRecord(entry)) return entry;
		const canonical = canonicalizeRecord(entry, names);
		if (canonical !== entry) changed = true;
		return canonical;
	});
	return changed ? entries : value;
}

/**
 * Rewrite the attribute keys of each PATCH operation value without mutating
 * the body. `canonicalizeValue` resolves what each operation's path targets.
 */
export function canonicalizeSCIMPatchRequestBody(
	body: unknown,
	canonicalizeValue: (path: string | undefined, value: unknown) => unknown,
): unknown {
	if (!isRecord(body) || !Array.isArray(body.Operations)) return body;
	let changed = false;
	const operations = body.Operations.map((operation) => {
		if (!isRecord(operation)) return operation;
		if (operation.path !== undefined && typeof operation.path !== "string") {
			return operation;
		}
		const value = canonicalizeValue(
			operation.path?.trim() || undefined,
			operation.value,
		);
		if (value === operation.value) return operation;
		changed = true;
		return { ...operation, value };
	});
	return changed ? { ...body, Operations: operations } : body;
}

/**
 * Rewrite the attribute keys of a User or Group resource, including extension
 * schema keys, without mutating it. Throws `invalidSyntax` when two keys name
 * the same attribute with different letter case.
 */
export function canonicalizeSCIMResourceAttributeNames(
	resourceType: SCIMResourceType,
	resource: unknown,
): unknown {
	if (!isRecord(resource)) return resource;
	return canonicalizeRecord(resource, readResourceAttributeNames(resourceType));
}
