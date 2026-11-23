import { getEnvVar, getRuntimeName, isTest } from "@better-auth/core/env";
import { isCI } from "./detect-system-info";

export function detectRuntime() {
	const name = getRuntimeName();
	if (name === "deno") {
		// @ts-expect-error: TS doesn't know about Deno global
		const denoVersion = Deno?.version?.deno ?? null;
		return { name, version: denoVersion };
	}

	if (name === "bun") {
		const bunVersion = Bun?.version ?? null;
		return { name, version: bunVersion };
	}

	if (name === "node") {
		return { name, version: process.versions.node ?? null };
	}
	return { name: name ?? "edge", version: null };
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
