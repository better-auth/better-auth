import { isWorkerd } from "@better-auth/core/env";

const asyncLocks = new Map<string, Promise<void>>();

/**
 * In-process promise-chain mutex for serializing operations per key.
 *
 * @note This provides in-process serialization only within a single Node.js/runtime instance.
 * In distributed or multi-instance deployments where requests are balanced across separate
 * processes or servers, durable serialization across instances requires database-level transactional
 * isolation or distributed locking (e.g. Redis / storage locks).
 */
export async function withLock<T>(
	key: string,
	fn: () => Promise<T>,
): Promise<T> {
	if (isWorkerd()) return fn();
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
