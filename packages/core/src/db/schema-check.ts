/**
 * Internal schema validation infrastructure for built-in adapters.
 *
 * Intended to become a public core extension point for community database
 * adapter authors once the registration and lifecycle contracts are stabilized.
 */

import { isWorkerd } from "../env";
import type { Awaitable, BetterAuthOptions } from "../types";
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
export type SchemaCheck = (() => Promise<void> | undefined) & {
	source?: SchemaSource;
};

const schemaChecks = new WeakMap<
	object,
	{ check: SchemaCheck; runtimeEnabled: boolean }
>();
const schemaRevisions = new WeakMap<object, { value: number }>();

type SchemaCheckRegistrationOptions = {
	runtimeEnabled?: boolean;
};

/** Invalidates cached checks after Better Auth changes this database's schema. */
export function invalidateSchemaChecks(database: object): void {
	const revision = schemaRevisions.get(database);
	if (revision) revision.value++;
}

/**
 * Attaches a check to the adapter it verifies. The adapter object itself is
 * left untouched, so this works for adapters Better Auth does not own.
 */
export function registerSchemaCheck(
	adapter: object,
	check: SchemaCheck,
	options: SchemaCheckRegistrationOptions = {},
): void {
	const runtimeEnabled = options.runtimeEnabled ?? true;
	schemaChecks.set(adapter, { check, runtimeEnabled });
}

/**
 * The registered check, regardless of whether runtime validation is enabled.
 */
export function schemaCheckFor(adapter: object): SchemaCheck | undefined {
	return schemaChecks.get(adapter)?.check;
}

/**
 * The check used by runtime paths, when runtime validation is enabled.
 */
export function runtimeSchemaCheckFor(
	adapter: object,
): SchemaCheck | undefined {
	const registration = schemaChecks.get(adapter);
	return registration?.runtimeEnabled ? registration.check : undefined;
}

/**
 * Turns a schema comparison into a check shared by one adapter instance.
 *
 * Concurrent calls share one `find` until a completed result is available. On
 * Cloudflare Workers each call runs its own, and a newer lookup's result
 * replaces an older one's. A
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
	find: () => Awaitable<SchemaFinding[]>,
	source: SchemaSource,
	database?: object,
): SchemaCheck {
	const revision = database
		? (schemaRevisions.get(database) ?? { value: 0 })
		: undefined;
	if (database && revision) schemaRevisions.set(database, revision);

	// Workers tie I/O to the request that started it, so a lookup begun by
	// another request may never settle there.
	// @see https://developers.cloudflare.com/workers/runtime-apis/request/#the-request-context
	const sharesLookups = !isWorkerd();

	let verdict:
		| {
				revision: number | undefined;
				sequence: number;
				error: SchemaMismatchError | undefined;
		  }
		| undefined;
	let pending:
		| {
				revision: number | undefined;
				lookup: Promise<void>;
		  }
		| undefined;
	let lookupSequence = 0;

	const runLookup = (currentRevision: number | undefined): Promise<void> => {
		const sequence = ++lookupSequence;

		return Promise.resolve()
			.then(find)
			.then(
				(findings) => {
					if (
						revision?.value !== currentRevision ||
						(verdict && sequence < verdict.sequence)
					) {
						return checkSchema();
					}

					const error = findings.length
						? new SchemaMismatchError(findings, source)
						: undefined;
					verdict = { revision: currentRevision, sequence, error };
					if (error) throw error;
				},
				(error: unknown) => {
					if (revision?.value !== currentRevision) return checkSchema();
					throw error;
				},
			);
	};

	const checkSchema: SchemaCheck = () => {
		const currentRevision = revision?.value;

		if (verdict && verdict.revision === currentRevision) {
			return verdict.error ? Promise.reject(verdict.error) : undefined;
		}

		if (!sharesLookups) return runLookup(currentRevision);
		if (pending && pending.revision === currentRevision) {
			return pending.lookup;
		}

		const lookup = runLookup(currentRevision).finally(() => {
			if (pending?.lookup === lookup) pending = undefined;
		});
		pending = {
			revision: currentRevision,
			lookup,
		};
		return lookup;
	};

	checkSchema.source = source;
	return checkSchema;
}
