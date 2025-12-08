/**
 * Safely parses a value that might be a JSON string or already a parsed object.
 * This handles cases where ORMs like Drizzle might return already parsed objects
 * instead of JSON strings from TEXT/JSON columns.
 *
 * @param value - The value to parse (string, object, null, or undefined)
 * @returns The parsed object or null
 * @throws Error if string parsing fails
 */
export function safeJsonParse<T>(
	value: string | T | null | undefined,
): T | null {
	if (!value) return null;

	if (typeof value === "object") {
		return value as T;
	}

	if (typeof value === "string") {
		try {
			return JSON.parse(value) as T;
		} catch (error) {
			throw new Error(
				`Failed to parse JSON: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}

	return null;
}

export const validateEmailDomain = (email: string, domain: string) => {
	const emailDomain = email.split("@")[1]?.toLowerCase();
	const providerDomain = domain.toLowerCase();
	if (!emailDomain || !providerDomain) {
		return false;
	}
	return (
		emailDomain === providerDomain || emailDomain.endsWith(`.${providerDomain}`)
	);
};
