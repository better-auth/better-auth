/** Retry only confirmed serialization aborts, never uncertain commit outcomes. */
export async function withDsqlRetry<T>(
	operation: () => Promise<T>,
): Promise<T> {
	for (let attempt = 0; ; attempt++) {
		try {
			return await operation();
		} catch (error) {
			if (
				attempt >= 3 ||
				typeof error !== "object" ||
				error === null ||
				!("code" in error) ||
				error.code !== "40001"
			) {
				throw error;
			}
			await new Promise((resolve) =>
				setTimeout(resolve, 10 * 2 ** attempt + Math.random() * 10),
			);
		}
	}
}
