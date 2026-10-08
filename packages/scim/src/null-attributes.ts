import { createSCIMError } from "./scim-error";

/**
 * RFC 7643 Section 2.5 makes a JSON `null` equivalent to an unassigned
 * attribute. In POST and PUT bodies an unassigned attribute is simply omitted,
 * so nulls are stripped. In PATCH an omitted attribute is left unchanged, so a
 * null value has to become an explicit removal instead.
 */

/** Deeper values are left as-is for schema validation to reject. */
const SCIM_NULL_STRIP_MAX_DEPTH = 32;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Microsoft Entra may send a single complex value as a one-element array. */
function readSingleRecord(value: unknown): Record<string, unknown> | undefined {
	if (isRecord(value)) return value;
	return Array.isArray(value) && value.length === 1 && isRecord(value[0])
		? value[0]
		: undefined;
}

function stripNulls(value: unknown, depth: number): unknown {
	if (depth > SCIM_NULL_STRIP_MAX_DEPTH) return value;
	if (Array.isArray(value)) {
		let changed = false;
		const entries = value.map((entry) => {
			const stripped = stripNulls(entry, depth + 1);
			if (stripped !== entry) changed = true;
			return stripped;
		});
		return changed ? entries : value;
	}
	if (!isRecord(value)) return value;
	let changed = false;
	const record: Record<string, unknown> = {};
	for (const [key, entry] of Object.entries(value)) {
		if (entry === null) {
			changed = true;
			continue;
		}
		const stripped = stripNulls(entry, depth + 1);
		if (stripped === entry) {
			record[key] = entry;
			continue;
		}
		changed = true;
		// A complex attribute whose sub-attributes were all null is unassigned too.
		if (isRecord(stripped) && Object.keys(stripped).length === 0) continue;
		record[key] = stripped;
	}
	return changed ? record : value;
}

/**
 * Omit null attributes from a SCIM resource sent with POST or PUT, without
 * mutating it. A root `active: null` is kept so validation still rejects it:
 * an omitted `active` defaults to `true` and would reactivate the User.
 */
export function stripSCIMResourceNullAttributes(resource: unknown): unknown {
	if (!isRecord(resource)) return resource;
	const stripped = stripNulls(resource, 0);
	if (resource.active !== null || !isRecord(stripped)) return stripped;
	return { ...stripped, active: null };
}

export interface SCIMPatchOperation {
	op: "add" | "remove" | "replace";
	path?: string | undefined;
	value?: unknown;
}

/** How a PATCH value at a path applies to the stored resource. */
export type SCIMPatchValueTarget =
	/** A complex value merged into the current one; omitted keys are kept. */
	| { kind: "merge"; subPath: (attribute: string) => string }
	/** Multi-valued entries that are added or replaced whole. */
	| { kind: "entries" }
	/** A read-only attribute the service provider ignores. */
	| { kind: "readOnly" }
	/** An attribute where null is never a valid value. */
	| { kind: "notNullable" }
	/** A value the target applies as given; a null value removes the target. */
	| { kind: "value" };

/** The operations a null value at `path` becomes; throws when null is invalid. */
function nullValueOperations(
	path: string,
	target: SCIMPatchValueTarget,
): SCIMPatchOperation[] {
	if (target.kind === "readOnly") return [];
	if (target.kind === "notNullable") {
		throw createSCIMError("BAD_REQUEST", {
			detail: `${path} cannot be null`,
			scimType: "invalidValue",
		});
	}
	return [{ op: "remove", path }];
}

function splitNullAttributes(
	value: Record<string, unknown>,
	subPath: (attribute: string) => string,
	resolveTarget: (path: string) => SCIMPatchValueTarget,
): { value: Record<string, unknown>; removals: SCIMPatchOperation[] } {
	const kept: Record<string, unknown> = {};
	const removals: SCIMPatchOperation[] = [];
	for (const [attribute, entry] of Object.entries(value)) {
		if (entry !== null && !isRecord(entry) && !Array.isArray(entry)) {
			kept[attribute] = entry;
			continue;
		}
		const path = subPath(attribute);
		const target = resolveTarget(path);
		if (entry === null) {
			removals.push(...nullValueOperations(path, target));
			continue;
		}
		const record =
			target.kind === "merge" ? readSingleRecord(entry) : undefined;
		if (target.kind === "merge" && record) {
			const nested = splitNullAttributes(record, target.subPath, resolveTarget);
			removals.push(...nested.removals);
			const keepEntry =
				Object.keys(nested.value).length > 0 ||
				Object.keys(record).length === 0;
			if (keepEntry) {
				kept[attribute] = Array.isArray(entry) ? [nested.value] : nested.value;
			}
			continue;
		}
		kept[attribute] = target.kind === "entries" ? stripNulls(entry, 0) : entry;
	}
	return { value: kept, removals };
}

function expandOperationNullValues(
	operation: SCIMPatchOperation,
	resolveTarget: (path: string) => SCIMPatchValueTarget,
): SCIMPatchOperation[] {
	if (operation.op === "remove") return [operation];
	const path = operation.path?.trim();
	const target = path ? resolveTarget(path) : undefined;
	if (path && target && operation.value === null) {
		return nullValueOperations(path, target);
	}
	if (target?.kind === "entries") {
		return [{ ...operation, value: stripNulls(operation.value, 0) }];
	}
	if (path && target?.kind !== "merge") return [operation];
	const record =
		target?.kind === "merge"
			? readSingleRecord(operation.value)
			: isRecord(operation.value)
				? operation.value
				: undefined;
	if (!record) return [operation];
	const { value, removals } = splitNullAttributes(
		record,
		target?.kind === "merge" ? target.subPath : (attribute) => attribute,
		resolveTarget,
	);
	// Keep an operation whose value was empty to begin with, so it still fails or no-ops as before.
	const keepOperation =
		Object.keys(value).length > 0 || Object.keys(record).length === 0;
	const keptValue = Array.isArray(operation.value) ? [value] : value;
	return [
		...(keepOperation ? [{ ...operation, value: keptValue }] : []),
		...removals,
	];
}

/**
 * Rewrite add and replace operations so a null value removes its target, as
 * RFC 7643 Section 2.5 requires. Removals run after the operation's other
 * values, so derived values such as `name.formatted` see the update.
 */
export function expandSCIMPatchNullValues(
	operations: readonly SCIMPatchOperation[],
	resolveTarget: (path: string) => SCIMPatchValueTarget,
): SCIMPatchOperation[] {
	return operations.flatMap((operation) =>
		expandOperationNullValues(operation, resolveTarget),
	);
}
