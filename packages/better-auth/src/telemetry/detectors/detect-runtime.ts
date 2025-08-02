import type { DetectionInfo } from "../types";

export async function detectRuntime(): Promise<DetectionInfo | undefined> {
	// @ts-expect-error: TS doesn't know about Deno global
	if (typeof Deno !== "undefined") {
		// @ts-expect-error: TS doesn't know about Deno global
		const denoVersion = Deno?.version?.deno ?? null;
		return { name: "deno", version: denoVersion };
	}

	if (typeof Bun !== "undefined") {
		const bunVersion = Bun?.version ?? null;
		return { name: "bun", version: bunVersion };
	}

	if (typeof process !== "undefined" && typeof process.versions === "object") {
		const nodeVersion = process.versions.node ?? null;
		return { name: "node", version: nodeVersion };
	}

	return undefined;
}
