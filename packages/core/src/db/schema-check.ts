import { isProduction } from "../env";
import type { BetterAuthOptions } from "../types";
import type { SchemaFinding, SchemaSource } from "./schema-diff";
import { SchemaMismatchError } from "./schema-diff";

/**
 * Whether the schema is compared with this configuration before the first
 * request. On outside production unless the option decides either way, so
 * drift is caught in development and by `auth migrate`, not by the first
 * failed insert in production.
 */
export function checksSchema(options: BetterAuthOptions): boolean {
	return options.advanced?.database?.validateSchema ?? !isProduction;
}

/**
 * Resolves when the schema can hold what Better Auth writes. Returns nothing
 * once that is known, so a settled check costs the caller one property read.
 */
export type SchemaCheck = () => Promise<void> | undefined;

const schemaChecks = new WeakMap<object, SchemaCheck>();

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
 * Turns a schema comparison into a check that runs once per process.
 *
 * The first call runs `find` and every concurrent call shares that promise. A
 * clean result settles the check for good. A mismatch is kept as one
 * {@link SchemaMismatchError} and rethrown on every later call without asking
 * the store again, because the schema does not change underneath a running
 * process. A failure to reach the store is not kept, so the next call asks
 * again.
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
): SchemaCheck {
	let clean = false;
	let verdict: Promise<void> | undefined;
	return () => {
		if (clean) return;
		return (verdict ??= find().then(
			(findings) => {
				if (findings.length) throw new SchemaMismatchError(findings, source);
				clean = true;
			},
			(error: unknown) => {
				verdict = undefined;
				throw error;
			},
		));
	};
}
