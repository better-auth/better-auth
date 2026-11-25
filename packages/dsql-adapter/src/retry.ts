const MAX_DSQL_RETRIES = 3;

/**
 * DSQL reports a conflicting transaction as a serialization failure.
 *
 * @internal
 */
export function isSerializationFailure(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		error.code === "40001"
	);
}

/**
 * Retries serialization failures up to three times. Anything else, including
 * a commit whose outcome is unknown, is thrown right away.
 */
export async function withDsqlRetry<T>(
	operation: () => Promise<T>,
): Promise<T> {
	for (let attempt = 0; ; attempt++) {
		try {
			return await operation();
		} catch (error) {
			if (attempt >= MAX_DSQL_RETRIES || !isSerializationFailure(error)) {
				throw error;
			}
			await new Promise((resolve) =>
				setTimeout(resolve, 10 * 2 ** attempt + Math.random() * 10),
			);
		}
	}
}
