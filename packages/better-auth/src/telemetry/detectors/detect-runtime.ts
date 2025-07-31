import type { DetectionInfo } from "../types";

function detectRuntime(): DetectionInfo | undefined {
	// @ts-expect-error: TS doesn't know about Deno global
	if (typeof Deno !== "undefined") {
		// @ts-expect-error: TS doesn't know about Deno global
		const denoVersion = Deno?.version?.deno;
		if (denoVersion) {
			return { name: "deno", version: denoVersion };
		} else {
			return { name: "deno" };
		}
	}

	if (typeof Bun !== "undefined") {
		const bunVersion = Bun?.version;
		if (bunVersion) {
			return { name: "bun", version: Bun.version };
		} else {
			return { name: "bun" };
		}
	}

	if (typeof process !== "undefined" && typeof process.versions === "object") {
		const nodeVersion = process.versions.node;
		if (nodeVersion) {
			return { name: "node", version: nodeVersion };
		} else {
			return { name: "node" };
		}
	}

	return undefined;
}
