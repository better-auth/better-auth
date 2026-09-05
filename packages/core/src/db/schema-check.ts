/**
 * Internal schema validation infrastructure for built-in adapters.
 *
 * Intended to become a public core extension point for community database
 * adapter authors once the registration and lifecycle contracts are stabilized.
 */

import type { BetterAuthOptions } from "../types";
import type { SchemaFinding, SchemaSource } from "./schema-diff";
import { SchemaMismatchError } from "./schema-diff";

/**
 * Whether the adapter validates its schema. Enabled in every environment
 * unless explicitly disabled.
 */
export function checksSchema(options: BetterAuthOptions): boolean {
	return options.advanced?.database?.validateSchema !== false;
}

/**
 * Resolves when the schema can hold what Better Auth writes. Returns nothing
 * once that is known and the database schema revision is unchanged.
 */
export type SchemaCheck = () => Promise<void> | undefined;

const schemaChecks = new WeakMap<object, SchemaCheck>();
const schemaRevisions = new WeakMap<object, { value: number }>();

/** Invalidates cached checks after Better Auth changes this database's schema. */
export function invalidateSchemaChecks(database: object): void {
	const revision = schemaRevisions.get(database);
	if (revision) revision.value++;
}

/**
 * Attaches a check to the adapter it verifies. The adapter object itself is
 * left untouched, so this works for adapters Better Auth does not own.
 */
export function registerSchemaCheck(adapter: object, check: SchemaCheck): void {
	schemaChecks.set(adapter, check);
}

/**
 * The check registered for an adapter, if its store is checked at all.
 */
export function schemaCheckFor(adapter: object): SchemaCheck | undefined {
	return schemaChecks.get(adapter);
}

/**
 * Turns a schema comparison into a check shared by one adapter instance.
 *
 * The first call runs `find` and every concurrent call shares that promise. A
 * clean result is cached until invalidation. A mismatch is kept as one
 * {@link SchemaMismatchError} and rethrown on every later call without asking
 * the store again, until a migration invalidates it. When a database identity is supplied,
 * checks for that identity share its schema revision. Pending callers follow
 * the new check if their revision is invalidated. A failure to reach
 * the store is not kept, so the next call asks again.
 *
 * @example
 * ```ts
 * const checkSchema = createSchemaCheck(
 *   () => findSchemaProblems(db, "postgres", expected),
 *   "database",
 * );
 * const pending = checkSchema();
 * if (pending) await pending;
 * ```
 */
export function createSchemaCheck(
	find: () => Promise<SchemaFinding[]>,
	source: SchemaSource,
	database?: object,
): SchemaCheck {
	let revision = database ? schemaRevisions.get(database) : undefined;
	if (database && !revision) {
		revision = { value: 0 };
		schemaRevisions.set(database, revision);
	}
	let checkedRevision = revision?.value;
	let clean = false;
	let verdict: Promise<void> | undefined;
	return function checkSchema(): Promise<void> | undefined {
		const currentRevision = revision?.value;
		if (checkedRevision !== currentRevision) {
			checkedRevision = currentRevision;
			clean = false;
			verdict = undefined;
		}
		if (clean) return;
		return (verdict ??= Promise.resolve()
			.then(find)
			.then(
				(findings) => {
					if (revision?.value !== currentRevision) return checkSchema();
					if (findings.length) throw new SchemaMismatchError(findings, source);
					if (checkedRevision === currentRevision) clean = true;
				},
				(error: unknown) => {
					if (revision?.value !== currentRevision) return checkSchema();
					if (checkedRevision === currentRevision) verdict = undefined;
					throw error;
				},
			));
	};
}
