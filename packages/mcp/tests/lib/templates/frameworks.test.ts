import { describe, expect, it } from "vitest";
import {
	FRAMEWORK_CONFIGS,
	getDefaultApiPath,
	getDefaultAuthPath,
} from "../../../src/lib/templates/frameworks";

describe("FRAMEWORK_CONFIGS", () => {
	it("should have config for all supported frameworks", () => {
		const frameworks = [
			"next-app-router",
			"next-pages-router",
			"sveltekit",
			"astro",
			"react-router",
			"nuxt",
			"solid-start",
			"hono",
			"express",
			"fastify",
			"elysia",
			"tanstack-start",
			"expo",
		];

		for (const framework of frameworks) {
			expect(
				FRAMEWORK_CONFIGS[framework as keyof typeof FRAMEWORK_CONFIGS],
			).toBeDefined();
		}
	});
});

describe("getDefaultAuthPath", () => {
	it("should return base path when srcDir is false", () => {
		const result = getDefaultAuthPath("next-app-router", false);
		expect(result).toBe("lib/auth");
	});

	it("should return src-prefixed path when srcDir is true", () => {
		const result = getDefaultAuthPath("next-app-router", true);
		expect(result).toBe("src/lib/auth");
	});

	it("should work for different frameworks", () => {
		expect(getDefaultAuthPath("sveltekit", false)).toBe("lib/auth");
		expect(getDefaultAuthPath("sveltekit", true)).toBe("src/lib/auth");
		expect(getDefaultAuthPath("react-router", true)).toBe("src/lib/auth");
	});
});

describe("getDefaultApiPath", () => {
	it("should return base path when srcDir is false", () => {
		const result = getDefaultApiPath("next-app-router", false);
		expect(result).toBe("app/api/auth/[...all]");
	});

	it("should return src-prefixed path when srcDir is true", () => {
		const result = getDefaultApiPath("next-app-router", true);
		expect(result).toBe("src/app/api/auth/[...all]");
	});

	it("should return empty string for frameworks without API path", () => {
		expect(getDefaultApiPath("hono", false)).toBe("");
		expect(getDefaultApiPath("express", true)).toBe("");
		expect(getDefaultApiPath("expo", false)).toBe("");
	});

	it("should handle framework-specific paths", () => {
		expect(getDefaultApiPath("sveltekit", true)).toBe(
			"src/routes/api/auth/[...all]",
		);
		expect(getDefaultApiPath("nuxt", false)).toBe("server/api/auth/[...all]");
		expect(getDefaultApiPath("react-router", true)).toBe(
			"src/routes/api.auth.$",
		);
	});
});
