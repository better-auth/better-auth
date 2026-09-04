import { stripSCIMCoreAttributePrefix } from "./resource-schema-registry";
import { SCIM_ENTERPRISE_USER_SCHEMA } from "./user-schemas";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Omit JSON `null` properties from a complex SCIM object (and nested objects
 * such as enterprise `manager`). Microsoft Entra serializes unassigned optional
 * complex subattributes as `null`; Zod optional strings reject that form.
 * Top-level User scalars are not passed through here.
 */
function omitNullProperties(
	value: Record<string, unknown>,
): Record<string, unknown> {
	let changed = false;
	const normalized: Record<string, unknown> = {};
	for (const [key, entry] of Object.entries(value)) {
		if (entry === null) {
			changed = true;
			continue;
		}
		if (isRecord(entry)) {
			const nested = omitNullProperties(entry);
			if (nested !== entry) changed = true;
			normalized[key] = nested;
			continue;
		}
		normalized[key] = entry;
	}
	return changed ? normalized : value;
}

/** Normalize the exact string Boolean forms accepted from SCIM providers. */
function normalizeSCIMStringBooleanValue(value: unknown): unknown {
	if (typeof value !== "string") return value;
	const normalized = value.toLowerCase();
	if (normalized === "true") return true;
	if (normalized === "false") return false;
	return value;
}

function normalizeActiveProperty(
	value: Record<string, unknown>,
): Record<string, unknown> {
	if (!Object.hasOwn(value, "active")) return value;
	const active = normalizeSCIMStringBooleanValue(value.active);
	return active === value.active ? value : { ...value, active };
}

const SCIM_MULTI_VALUED_PRIMARY_ATTRIBUTES = [
	"emails",
	"phoneNumbers",
	"addresses",
	"roles",
	"entitlements",
] as const;

function normalizeMultiValuedPrimaryEntry(entry: unknown): unknown {
	if (!isRecord(entry)) return entry;
	const withoutNulls = omitNullProperties(entry);
	if (!Object.hasOwn(withoutNulls, "primary")) return withoutNulls;
	const primary = normalizeSCIMStringBooleanValue(withoutNulls.primary);
	return primary === withoutNulls.primary
		? withoutNulls
		: { ...withoutNulls, primary };
}

function normalizeMultiValuedPrimaryValue(value: unknown): unknown {
	if (!Array.isArray(value)) return normalizeMultiValuedPrimaryEntry(value);
	let changed = false;
	const normalized = value.map((entry) => {
		const result = normalizeMultiValuedPrimaryEntry(entry);
		if (result !== entry) changed = true;
		return result;
	});
	return changed ? normalized : value;
}

function normalizeResourceMultiValuedPrimaries(
	value: Record<string, unknown>,
): Record<string, unknown> {
	const updates: Record<string, unknown> = {};
	for (const attribute of SCIM_MULTI_VALUED_PRIMARY_ATTRIBUTES) {
		if (!Object.hasOwn(value, attribute)) continue;
		const normalized = normalizeMultiValuedPrimaryValue(value[attribute]);
		if (normalized !== value[attribute]) updates[attribute] = normalized;
	}
	return Object.keys(updates).length === 0 ? value : { ...value, ...updates };
}

function normalizeUserResourceEntraCompatibility(
	value: Record<string, unknown>,
): Record<string, unknown> {
	const updates: Record<string, unknown> = {};
	if (isRecord(value.name)) {
		const name = omitNullProperties(value.name);
		if (name !== value.name) updates.name = name;
	}
	const enterpriseExtension = value[SCIM_ENTERPRISE_USER_SCHEMA];
	if (isRecord(enterpriseExtension)) {
		const enterprise = omitNullProperties(enterpriseExtension);
		if (enterprise !== enterpriseExtension) {
			updates[SCIM_ENTERPRISE_USER_SCHEMA] = enterprise;
		}
	}
	const resource =
		Object.keys(updates).length === 0 ? value : { ...value, ...updates };
	return normalizeResourceMultiValuedPrimaries(
		normalizeActiveProperty(resource),
	);
}

function isActivePath(path: unknown): boolean {
	return (
		typeof path === "string" &&
		stripSCIMCoreAttributePrefix("User", path.trim()).toLowerCase() === "active"
	);
}

// Whitespace tolerance must match user-patch.ts's SCIM_VALUE_PATH/SCIM_PRIMARY_VALUE_PATH,
// or a spaced-out filter bypasses normalization and fails boolean validation downstream.
const MULTI_VALUED_PRIMARY_PATH_PATTERN =
	/^(emails|phonenumbers|addresses|roles|entitlements)\s*(\[[^\]]*\])?(?:\s*\.\s*(primary))?$/i;

/**
 * Matches a path targeting one of the multi-valued `primary` attributes,
 * with or without a `[type eq "..."]` filter. `targetsPrimary` is true only
 * when the path ends in `.primary`, in which case the operation value is the
 * primary value itself rather than a container that holds it.
 */
function matchMultiValuedPrimaryPath(
	path: unknown,
): { targetsPrimary: boolean } | null {
	if (typeof path !== "string") return null;
	const stripped = stripSCIMCoreAttributePrefix("User", path.trim());
	const match = MULTI_VALUED_PRIMARY_PATH_PATTERN.exec(stripped);
	return match ? { targetsPrimary: Boolean(match[3]) } : null;
}

function isPathless(path: unknown): boolean {
	return (
		path === undefined || (typeof path === "string" && path.trim().length === 0)
	);
}

function isEnterpriseComplexPath(path: unknown): boolean {
	if (typeof path !== "string") return false;
	const trimmed = path.trim();
	return (
		trimmed === SCIM_ENTERPRISE_USER_SCHEMA ||
		trimmed
			.toLowerCase()
			.startsWith(`${SCIM_ENTERPRISE_USER_SCHEMA.toLowerCase()}:`)
	);
}

function normalizePatchOperation(operation: unknown): unknown {
	if (!isRecord(operation)) return operation;
	if (isActivePath(operation.path)) {
		const value = normalizeSCIMStringBooleanValue(operation.value);
		return value === operation.value ? operation : { ...operation, value };
	}
	const primaryMatch = matchMultiValuedPrimaryPath(operation.path);
	if (primaryMatch) {
		const value = primaryMatch.targetsPrimary
			? normalizeSCIMStringBooleanValue(operation.value)
			: normalizeMultiValuedPrimaryValue(operation.value);
		return value === operation.value ? operation : { ...operation, value };
	}
	if (isEnterpriseComplexPath(operation.path) && isRecord(operation.value)) {
		const value = omitNullProperties(operation.value);
		return value === operation.value ? operation : { ...operation, value };
	}
	if (isPathless(operation.path) && isRecord(operation.value)) {
		const value = normalizeUserResourceEntraCompatibility(operation.value);
		return value === operation.value ? operation : { ...operation, value };
	}
	return operation;
}

/**
 * Normalize provider-compatible User request shapes from Microsoft Entra:
 * string Boolean `active` / multi-valued `primary` values, and JSON `null`
 * optional complex subattributes. Does not widen endpoint schemas or mutate
 * the caller's request body object.
 */
export function normalizeSCIMUserEntraCompatibilityRequestBody(
	method: string,
	body: unknown,
): unknown {
	if (!isRecord(body)) return body;
	if (method === "POST" || method === "PUT") {
		return normalizeUserResourceEntraCompatibility(body);
	}
	if (method !== "PATCH" || !Array.isArray(body.Operations)) return body;

	let changed = false;
	const operations = body.Operations.map((operation) => {
		const normalized = normalizePatchOperation(operation);
		if (normalized !== operation) changed = true;
		return normalized;
	});
	return changed ? { ...body, Operations: operations } : body;
}
