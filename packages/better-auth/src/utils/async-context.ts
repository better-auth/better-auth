export type AsyncContext<T = any> = {
	run<R>(value: T, callback: () => Promise<R> | R): Promise<R>;
	get(): T | undefined;
};

export const createAsyncContext = <T>(): AsyncContext<T> => {
	type Key = { id: symbol };

	const store = new WeakMap<Key, T>();
	const stack: Key[] = [];

	const cleanup = (key: Key) => {
		store.delete(key);
		const index = stack.lastIndexOf(key);
		if (index >= 0) {
			stack.splice(index, 1);
		}
	};

	return {
		run: (value, callback) => {
			const key: Key = { id: Symbol() };
			store.set(key, value);
			stack.push(key);

			try {
				const result = callback();
				if (result instanceof Promise) {
					return result.finally(() => cleanup(key));
				}
				return Promise.resolve(result).finally(() => cleanup(key));
			} catch (error) {
				cleanup(key);
				throw error;
			}
		},
		get: () => {
			if (!stack.length) {
				return undefined;
			}

			const key = stack[stack.length - 1];
			return store.get(key);
		},
	};
};
