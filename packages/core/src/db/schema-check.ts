/**
 * Internal schema validation infrastructure for built-in adapters.
 *
 * Intended to become a public core extension point for community database
 * adapter authors once the registration and lifecycle contracts are stabilized.
 */

import type { InternalLogger } from "../env";
import { logger as defaultLogger } from "../env";
import type { Awaitable, BetterAuthOptions } from "../types";
import { EVICTION_TIMEOUT_MS, settleByDeadline } from "../utils/async";
import type { SchemaFinding, SchemaSource } from "./schema-diff";
import { SchemaMismatchError } from "./schema-diff";

type Verdict = {
	promise: Promise<void>;
	deadlineMs: number;
	settled: boolean;
	reported: boolean;
};

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
 *
 * A caller passes the Auth Instance logger, so a lookup it abandons is
 * reported there.
 */
export type SchemaCheck = ((
	logger?: InternalLogger | undefined,
) => Promise<void> | undefined) & {
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
 * The first call runs `find` and every concurrent call shares that promise. A
 * clean result is cached until invalidation. A mismatch is kept as one
 * {@link SchemaMismatchError} and rethrown on every later call without asking
 * the store again, until a migration invalidates it. When a database identity is supplied,
 * checks for that identity share its schema revision. Pending callers follow
 * the new check if their revision is invalidated. A failure to reach
 * the store is not kept, so the next call asks again.
 *
 * No caller waits on a lookup longer than {@link EVICTION_TIMEOUT_MS}. A
 * caller that reaches that bound resolves without a verdict, and the next call
 * asks the store again.
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
	let revision = database ? schemaRevisions.get(database) : undefined;
	if (database && !revision) {
		revision = { value: 0 };
		schemaRevisions.set(database, revision);
	}
	let checkedRevision = revision?.value;
	let clean = false;
	let verdict: Verdict | undefined;

	const reportAbandoned = (entry: Verdict, logger: InternalLogger) => {
		if (entry.reported) return;
		entry.reported = true;
		logger.warn(
			`Schema validation did not settle within ${EVICTION_TIMEOUT_MS}ms and was dropped. Database operations proceed without it. On a runtime that ends I/O with the request that started it, this happens when that request responded before the lookup finished.`,
		);
	};

	const start = (
		currentRevision: number | undefined,
		logger: InternalLogger,
	): Verdict => {
		const entry: Verdict = {
			deadlineMs: Date.now() + EVICTION_TIMEOUT_MS,
			settled: false,
			reported: false,
			promise: Promise.resolve()
				.then(find)
				.then(
					(findings) => {
						entry.settled = true;
						if (revision?.value !== currentRevision) return checkSchema(logger);
						if (findings.length)
							throw new SchemaMismatchError(findings, source);
						if (checkedRevision === currentRevision && verdict === entry) {
							clean = true;
						}
					},
					(error: unknown) => {
						entry.settled = true;
						if (revision?.value !== currentRevision) return checkSchema(logger);
						if (checkedRevision === currentRevision && verdict === entry) {
							verdict = undefined;
						}
						throw error;
					},
				),
		};
		return entry;
	};

	const checkSchema: SchemaCheck = function checkSchema(
		logger = defaultLogger,
	): Promise<void> | undefined {
		const currentRevision = revision?.value;
		if (checkedRevision !== currentRevision) {
			checkedRevision = currentRevision;
			clean = false;
			verdict = undefined;
		}
		if (clean) return;
		if (verdict && !verdict.settled && Date.now() >= verdict.deadlineMs) {
			reportAbandoned(verdict, logger);
			verdict = undefined;
		}
		const entry = (verdict ??= start(currentRevision, logger));
		if (entry.settled) return entry.promise;
		return settleByDeadline(entry.promise, entry.deadlineMs, () =>
			reportAbandoned(entry, logger),
		);
	};
	checkSchema.source = source;
	return checkSchema;
}
