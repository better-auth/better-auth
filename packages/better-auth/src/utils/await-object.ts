export async function awaitObject<T extends Record<string, Promise<any>>>(
	promises: T,
): Promise<{ [K in keyof T]: Awaited<T[K]> }> {
	const entries = Object.entries(promises) as [keyof T, T[keyof T]][];
	const results = await Promise.all(entries.map(([, promise]) => promise));

	const resolved: Partial<{ [K in keyof T]: Awaited<T[K]> }> = {};
	entries.forEach(([key], index) => {
		resolved[key] = results[index];
	});

	return resolved as { [K in keyof T]: Awaited<T[K]> };
}
