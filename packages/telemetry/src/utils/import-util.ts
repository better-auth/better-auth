// This file is kept for backwards compatibility but should not be used.
// The node build (src/node.ts) uses static top-level imports instead.
// The default build does not import node built-ins.

export const importRuntime = <T>(_m: string): Promise<T> => {
	return Promise.reject(
		new Error(
			"importRuntime is not available in the default (non-node) build of @better-auth/telemetry",
		),
	);
};
