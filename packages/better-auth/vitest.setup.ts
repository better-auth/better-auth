if (
	typeof globalThis.localStorage !== "undefined" &&
	+process.versions.node.split(".")[0]! >= 25
) {
	// @ts-expect-error
	globalThis.localStorage = undefined;
}
