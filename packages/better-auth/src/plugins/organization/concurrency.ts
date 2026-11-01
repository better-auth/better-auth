const asyncLocks = new Map<string, Promise<void>>();

export async function withLock<T>(
	key: string,
	fn: () => Promise<T>,
): Promise<T> {
	const previous = asyncLocks.get(key) ?? Promise.resolve();
	let release!: () => void;
	const current = new Promise<void>((resolve) => {
		release = resolve;
	});
	const next = previous.catch(() => {}).then(() => current);
	asyncLocks.set(key, next);
	await previous.catch(() => {});
	try {
		return await fn();
	} finally {
		release();
		if (asyncLocks.get(key) === next) {
			asyncLocks.delete(key);
		}
	}
}
