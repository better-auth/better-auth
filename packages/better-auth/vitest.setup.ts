import { beforeAll } from "vitest";

beforeAll(() => {
	// Issue with msw and node.js 25+
	// Backport for node.js 25+ localStorage global
	if (
		typeof globalThis.localStorage !== "undefined" &&
		+process.versions.node.split(".")[0]! >= 25
	) {
		// @ts-expect-error
		globalThis.localStorage = undefined;
	}
});
