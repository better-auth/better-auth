const UNIQUE_VIOLATION_CODES = new Set([
	"11000",
	"11001",
	"1062",
	"2067",
	"23505",
	"2601",
	"2627",
	"ER_DUP_ENTRY",
	"ER_DUP_ENTRY_WITH_KEY_NAME",
	"ER_DUP_UNIQUE",
	"P2002",
	"SQLITE_CONSTRAINT_PRIMARYKEY",
	"SQLITE_CONSTRAINT_ROWID",
	"SQLITE_CONSTRAINT_UNIQUE",
]);

// node:sqlite reports every failure as ERR_SQLITE_ERROR with the extended result code in `errcode`.
// Its primary key and rowid codes are matched only there, because MySQL uses errno 1555 for another error.
const NODE_SQLITE_KEY_ERRCODES = new Set([1555, 2579]);

const UNIQUE_VIOLATION_MESSAGE_PATTERN =
	/unique(?: key)? constraint|duplicate (?:entry|key)|e11000/i;

// These codes cover unique, check, and not-null failures alike, so SQLite's wording decides.
// libSQL servers report PROXY_ERROR, with the primary's message, for a write sent to a replica.
const SQLITE_CONSTRAINT_MESSAGE_CODES = new Set([
	"SQLITE_CONSTRAINT",
	"PROXY_ERROR",
]);
const SQLITE_UNIQUE_MESSAGE_PATTERN = /UNIQUE constraint failed/;

function hasUniqueViolation(error: unknown, seen: Set<object>): boolean {
	if (typeof error !== "object" || error === null || seen.has(error)) {
		return false;
	}
	seen.add(error);
	const { code, errcode, errno, number, message, cause } = error as Record<
		string,
		unknown
	>;
	if (
		[code, errcode, errno, number].some((identifier) =>
			UNIQUE_VIOLATION_CODES.has(String(identifier)),
		) ||
		(code === "ERR_SQLITE_ERROR" &&
			typeof errcode === "number" &&
			NODE_SQLITE_KEY_ERRCODES.has(errcode))
	) {
		return true;
	}
	// A wrapper such as Drizzle's carries the query params in its message, so its cause is read instead.
	if (typeof cause === "object" && cause !== null) {
		return hasUniqueViolation(cause, seen);
	}
	if (typeof message !== "string") return false;
	if (typeof code === "string" && SQLITE_CONSTRAINT_MESSAGE_CODES.has(code)) {
		return SQLITE_UNIQUE_MESSAGE_PATTERN.test(message);
	}
	// Any other driver code names the failure, and its message can echo user input.
	if (code !== undefined && code !== null) return false;
	return UNIQUE_VIOLATION_MESSAGE_PATTERN.test(message);
}

/** Follows `cause`, where ORMs such as Drizzle keep the driver error. */
export function isUniqueViolation(error: unknown): boolean {
	return hasUniqueViolation(error, new Set());
}
