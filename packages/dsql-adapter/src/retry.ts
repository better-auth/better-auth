const MAX_DSQL_RETRIES = 3;

/** @internal Classify only confirmed SQL serialization aborts. */
export function isSerializationFailure(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		error.code === "40001"
	);
}

/** Retry only confirmed serialization aborts, never uncertain commit outcomes. */
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
