/**
 * Adapter error classification.
 *
 * Adapters wrap driver errors rather than rethrowing them. `drizzle-orm`, for
 * example, throws an `Error` whose `message` is the failed SQL text and whose
 * `cause` is the driver error carrying the SQLSTATE. Matching only the
 * top-level `message` therefore misses real unique violations and missing
 * tables (better-auth#11034), so every predicate here walks the `cause` chain.
 *
 * @internal
 */

/**
 * Driver identifiers denoting a unique-constraint violation, matched against
 * `code`, `errno`, `errcode`, and `number`.
 *
 * `23505` Postgres, `1062`/`ER_DUP_ENTRY` MySQL, `11000` MongoDB,
 * `2067`/`SQLITE_CONSTRAINT_UNIQUE` SQLite, `2601`/`2627` SQL Server,
 * `P2002` Prisma.
 */
const UNIQUE_CONSTRAINT_ERROR_IDENTIFIERS = new Set([
	"11000",
	"1062",
	"2067",
	"23505",
	"2601",
	"2627",
	"ER_DUP_ENTRY",
	"P2002",
	"SQLITE_CONSTRAINT_UNIQUE",
]);

/**
 * Message fallback for adapters that surface no machine-readable code.
 * Wording differs per engine, hence the alternation — SQLite says "UNIQUE
 * constraint failed", MySQL/MongoDB say "Duplicate entry"/"duplicate key".
 *
 * Deliberately narrower than a bare `unique`/`duplicate` match: an
 * unconstrained "unique" (e.g. "could not uniquely identify row") would
 * misclassify an unrelated failure as a lost insert race and swallow it.
 */
const UNIQUE_CONSTRAINT_MESSAGE_PATTERN = /duplicate|unique constraint|unique key/i;

/**
 * Matched against adapter errors to detect the "table not yet created" case —
 * i.e. migrations haven't been run.
 *
 * Covers SQLite ("no such table"), Postgres ("relation X does not exist"),
 * and MySQL ("Table X does not exist" / contracted form).
 */
// cspell:ignore-next-line doesn
const MISSING_TABLE_PATTERN =
	/no such table|relation.*does not exist|table.*does(?: not|n[''']?t) exist/i;

/**
 * Bounds the `cause` walk. Chains can be cyclic, and a pathologically deep
 * chain should not become a hot loop.
 */
const MAX_CAUSE_DEPTH = 8;

/**
 * Yields each link of an error's `cause` chain, starting with the error
 * itself. Terminates on a repeat (cycle) or at {@link MAX_CAUSE_DEPTH}.
 */
function* causeChain(error: unknown): Generator<unknown> {
	const seen = new Set<unknown>();
	let current = error;
	for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
		if (current == null) return;
		if (typeof current === "object") {
			if (seen.has(current)) return;
			seen.add(current);
		}
		yield current;
		if (typeof current !== "object") return;
		current = (current as { cause?: unknown }).cause;
	}
}

/** Reads the error's message as a string, whatever the throwable's shape. */
function messageOf(error: unknown): string {
	if (typeof error === "string") return error;
	if (typeof error === "object" && error !== null) {
		const { message } = error as { message?: unknown };
		if (typeof message === "string") return message;
	}
	return "";
}

/**
 * True when `error`, or anything in its `cause` chain, is a unique-constraint
 * violation. Checks driver identifiers first, then falls back to message text
 * so adapters exposing no code keep working.
 */
export function isUniqueConstraintError(error: unknown): boolean {
	for (const link of causeChain(error)) {
		if (typeof link === "object" && link !== null) {
			const details = link as Record<string, unknown>;
			const identifiers = [
				details.code,
				details.errcode,
				details.errno,
				details.number,
			];
			if (
				identifiers.some(
					(identifier) =>
						identifier != null &&
						UNIQUE_CONSTRAINT_ERROR_IDENTIFIERS.has(String(identifier)),
				)
			) {
				return true;
			}
		}
		if (UNIQUE_CONSTRAINT_MESSAGE_PATTERN.test(messageOf(link))) return true;
	}
	return false;
}

/**
 * True when `error`, or anything in its `cause` chain, reports that the target
 * table does not exist yet — i.e. migrations have not run.
 */
export function isMissingTableError(error: unknown): boolean {
	for (const link of causeChain(error)) {
		if (MISSING_TABLE_PATTERN.test(messageOf(link))) return true;
	}
	return false;
}
