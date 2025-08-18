export type AsyncContext<T = any> = {
	/**
	 * Run a callback within a given context value.
	 * Cleans up automatically after completion.
	 */
	run<R>(value: T, callback: () => Promise<R> | R): Promise<R>;
	/**
	 * Get the current context value, if any.
	 */
	get(): T | undefined;
};

export const createAsyncContext = <T>(): AsyncContext<T> => {
	type Key = { id: symbol };

	const store = new WeakMap<Key, T>();
	const stack: Key[] = [];

	let currentKey: Key | undefined;

	const cleanup = (key: Key) => {
		store.delete(key);
		const index = stack.lastIndexOf(key);
		if (index >= 0) {
			stack.splice(index, 1);
		}
		if (currentKey === key) {
			currentKey = stack[stack.length - 1];
		}
	};

	return {
		run: <R>(value: T, callback: () => Promise<R> | R) => {
			const key: Key = { id: Symbol() };
			store.set(key, value);
			stack.push(key);
			const prevKey = currentKey;
			currentKey = key;

			let result: Promise<R>;
			try {
				result = Promise.resolve().then(callback);
			} catch (error) {
				cleanup(key);
				currentKey = prevKey;
				throw error;
			}

			return result.finally(() => {
				cleanup(key);
				currentKey = prevKey;
			});
		},
		get: (): T | undefined => {
			return currentKey ? store.get(currentKey) : undefined;
		},
	};
};
