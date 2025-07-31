import type { DetectionInfo } from "../types";
import { getVersionFromLocalPackageJson, readPackageJson } from "../utils";

const FRAMEWORKS: Record<string, string> = {
	next: "next",
	nuxt: "nuxt",
	"@remix-run/server-runtime": "remix",
	astro: "astro",
	"@sveltejs/kit": "sveltekit",
	"solid-start": "solid-start",
	"tanstack-start": "tanstack-start",
	hono: "hono",
	express: "express",
	elysia: "elysia",
	expo: "expo",
};

export async function detectFramework(): Promise<DetectionInfo | undefined> {
	for (const [pkg, name] of Object.entries(FRAMEWORKS)) {
		const version =
			(await readPackageJson(pkg)) ||
			(await getVersionFromLocalPackageJson(pkg));
		if (version) return { name, version };
	}

	return undefined;
}
