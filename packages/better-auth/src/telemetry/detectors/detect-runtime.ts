import { getEnvVar, isTest } from "../../utils/env";
import { isCI } from "./detect-system-info";

export function detectRuntime() {
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

	return { name: "node", version: process.versions.node ?? null };
}

export function detectEnvironment() {
	return getEnvVar("NODE_ENV") === "production"
		? "production"
		: isCI()
			? "ci"
			: isTest()
				? "test"
				: "development";
}
