export function isPromise(obj?: unknown): obj is Promise<unknown> {
	return (
		!!obj &&
		(typeof obj === "object" || typeof obj === "function") &&
		typeof (obj as Promise<unknown>).then === "function"
	);
}
