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
	/duplicate|unique constraint|unique key|e11000/i;

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
	// Only the driver's own error is read as text. Wrappers such as Drizzle's
	// carry the SQL and its parameters in the message, which is user data.
	return (
		typeof message === "string" &&
		UNIQUE_VIOLATION_MESSAGE_PATTERN.test(message)
	);
}

/**
 * Whether a failed database write hit a unique constraint.
 *
 * Drivers report the violation through different fields, and ORMs such as
 * Drizzle keep the driver error on `cause`, so the chain is followed. The
 * depth bound also stops a `cause` cycle.
 */
export function isUniqueViolation(error: unknown): boolean {
	return hasUniqueViolation(error, 0);
}
