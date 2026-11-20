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
	/unique constraint|duplicate (?:entry|key)|e11000/i;

const MAX_CAUSE_DEPTH = 5;

function hasUniqueViolation(error: unknown, depth: number): boolean {
	if (typeof error !== "object" || error === null || depth >= MAX_CAUSE_DEPTH) {
		return false;
	}
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
		return hasUniqueViolation(cause, depth + 1);
	}
	// Wrappers such as Drizzle's carry the query params in the message, so only the driver's is read.
	return (
		typeof message === "string" &&
		UNIQUE_VIOLATION_MESSAGE_PATTERN.test(message)
	);
}

/** Follows `cause`, where ORMs such as Drizzle keep the driver error. */
export function isUniqueViolation(error: unknown): boolean {
	return hasUniqueViolation(error, 0);
}
