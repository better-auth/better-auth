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

export const createAsyncContext = <T>() => {
	type Key = { id: symbol };

	const store = new WeakMap<Key, T>();
	const stack: Key[] = [];

	const getCurrentKey = (): Key | undefined => {
		return stack[stack.length - 1];
	};

	const cleanup = (key: Key) => {
		store.delete(key);
		const index = stack.lastIndexOf(key);
		if (index >= 0) {
			stack.splice(index, 1);
		}
	};

	return {
		run: <R>(value: T, callback: () => Promise<R> | R) => {
			const key: Key = { id: Symbol() };
			store.set(key, value);

			const result = Promise.resolve().then(() => {
				stack.push(key);
				return Promise.resolve(callback()).finally(() => {
					cleanup(key);
				});
			});

			return result;
		},
		get: (): T | undefined => {
			const key = getCurrentKey();
			return key ? store.get(key) : undefined;
		},
	};
};