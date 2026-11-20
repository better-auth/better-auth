const UNIQUE_VIOLATION_CODES = new Set([
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

const UNIQUE_VIOLATION_MESSAGE_PATTERN =
	/unique(?: key)? constraint|duplicate (?:entry|key)|e11000/i;

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
		)
	) {
		return true;
	}
	if (typeof cause === "object" && cause !== null) {
		return hasUniqueViolation(cause, seen);
	}
	// Wrappers such as Drizzle's carry the query params in the message, so only the driver's is read.
	return (
		typeof message === "string" &&
		UNIQUE_VIOLATION_MESSAGE_PATTERN.test(message)
	);
}

/** Follows `cause`, where ORMs such as Drizzle keep the driver error. */
export function isUniqueViolation(error: unknown): boolean {
	return hasUniqueViolation(error, new Set());
}
