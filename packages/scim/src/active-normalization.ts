import { stripSCIMCoreAttributePrefix } from "./resource-schema-registry";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
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
	if (!isRecord(entry) || !Object.hasOwn(entry, "primary")) return entry;
	const primary = normalizeSCIMStringBooleanValue(entry.primary);
	return primary === entry.primary ? entry : { ...entry, primary };
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
	return normalizeResourceMultiValuedPrimaries(normalizeActiveProperty(value));
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
	if (isPathless(operation.path) && isRecord(operation.value)) {
		const value = normalizeUserResourceEntraCompatibility(operation.value);
		return value === operation.value ? operation : { ...operation, value };
	}
	return operation;
}

/**
 * Normalize provider-compatible User `active` and multi-valued `primary`
 * string Boolean values (Microsoft Entra) without widening the endpoint
 * schemas or mutating the parsed request body.
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
