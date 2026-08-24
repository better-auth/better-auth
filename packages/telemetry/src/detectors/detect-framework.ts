import { getPackageVersion } from "../utils/package-json";

const FRAMEWORKS: Record<string, string> = {
	next: "next",
	nuxt: "nuxt",
	"react-router": "react-router",
	astro: "astro",
	"@sveltejs/kit": "sveltekit",
	"solid-start": "solid-start",
	"tanstack-start": "tanstack-start",
	hono: "hono",
	express: "express",
	elysia: "elysia",
	expo: "expo",
};

export async function detectFramework() {
	for (const [pkg, name] of Object.entries(FRAMEWORKS)) {
		const version = await getPackageVersion(pkg);
		if (version) return { name, version };
	}
	return undefined;
}
