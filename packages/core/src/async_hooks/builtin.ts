export function getBuiltinAsyncLocalStorage() {
	try {
		return globalThis.process?.getBuiltinModule?.("node:async_hooks")
			?.AsyncLocalStorage;
	} catch {
		return undefined;
	}
}
