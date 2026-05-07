import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { testWithTmpDir } from "../../../../test/test-utils";
import { FRAMEWORKS } from "../configs/frameworks.config";
import { detectFramework } from "./framework";

const { vol } = vi.hoisted(() => {
	const { vol } = require("memfs");
	return { vol };
});

vi.mock("node:fs", () => ({
	...vol,
	default: vol,
}));
vi.mock("node:fs/promises", () => ({
	...vol.promises,
	default: vol.promises,
}));
vi.mock("../../../utils/get-package-info", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("../../../utils/get-package-info")>();
	return {
		...actual,
		hasDependency: vi.fn((...args: Parameters<typeof actual.hasDependency>) =>
			actual.hasDependency(...args),
		),
	};
});

import { hasDependency } from "../../../utils/get-package-info";

const mockHasDependency = vi.mocked(hasDependency);

describe("Init CLI - framework utility", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	describe("autoDetectFramework", () => {
		testWithTmpDir(
			"should return null when no framework dependencies are found",
			async ({ tmp }) => {
				const result = await detectFramework(tmp, { dependencies: {} });

				expect(result).toBeNull();
				expect(mockHasDependency).toHaveBeenCalledTimes(FRAMEWORKS.length);
			},
		);

		testWithTmpDir(
			"should detect Next.js framework when 'next' dependency exists",
			async ({ tmp }) => {
				const packageJson = {
					dependencies: {
						next: "16.0.0",
					},
				};
				const result = await detectFramework(tmp, packageJson);

				expect(result).not.toBeNull();
				expect(result?.id).toBe("next");
				expect(result?.name).toBe("Next.js");
				expect(result?.dependency).toBe("next");
				expect(mockHasDependency).toHaveBeenCalledWith(packageJson, "next");
			},
		);

		testWithTmpDir(
			"should detect Astro framework when 'astro' dependency exists",
			async ({ tmp }) => {
				const result = await detectFramework(tmp, {
					dependencies: {
						astro: "1.0.0",
					},
				});

				expect(result).not.toBeNull();
				expect(result?.id).toBe("astro");
				expect(result?.name).toBe("Astro");
				expect(result?.dependency).toBe("astro");
			},
		);

		testWithTmpDir(
			"should detect React Router v7 framework when 'react-router' dependency exists",
			async ({ tmp }) => {
				const result = await detectFramework(tmp, {
					dependencies: {
						"react-router": "1.0.0",
					},
				});

				expect(result).not.toBeNull();
				expect(result?.id).toBe("react-router-v7");
				expect(result?.name).toBe("React Router v7");
				expect(result?.dependency).toBe("react-router");
			},
		);

		testWithTmpDir(
			"should detect Remix framework when '@remix-run/server-runtime' dependency exists",
			async ({ tmp }) => {
				const result = await detectFramework(tmp, {
					dependencies: {
						"@remix-run/server-runtime": "1.0.0",
					},
				});

				expect(result).not.toBeNull();
				expect(result?.id).toBe("remix");
				expect(result?.name).toBe("Remix");
				expect(result?.dependency).toBe("@remix-run/server-runtime");
			},
		);

		testWithTmpDir(
			"should detect Nuxt framework when 'nuxt' dependency exists",
			async ({ tmp }) => {
				const result = await detectFramework(tmp, {
					dependencies: {
						nuxt: "1.0.0",
					},
				});

				expect(result).not.toBeNull();
				expect(result?.id).toBe("nuxt");
				expect(result?.name).toBe("Nuxt");
				expect(result?.dependency).toBe("nuxt");
			},
		);

		testWithTmpDir(
			"should detect SvelteKit framework when '@sveltejs/kit' dependency exists",
			async ({ tmp }) => {
				const result = await detectFramework(tmp, {
					dependencies: {
						"@sveltejs/kit": "1.0.0",
					},
				});

				expect(result).not.toBeNull();
				expect(result?.id).toBe("sveltekit");
				expect(result?.name).toBe("SvelteKit");
				expect(result?.dependency).toBe("@sveltejs/kit");
			},
		);

		testWithTmpDir(
			"should detect Solid Start framework when 'solid-start' dependency exists",
			async ({ tmp }) => {
				const result = await detectFramework(tmp, {
					dependencies: {
						"solid-start": "1.0.0",
					},
				});

				expect(result).not.toBeNull();
				expect(result?.id).toBe("solid-start");
				expect(result?.name).toBe("Solid Start");
				expect(result?.dependency).toBe("solid-start");
			},
		);

		testWithTmpDir(
			"should detect Tanstack Start framework when 'tanstack-start' dependency exists",
			async ({ tmp }) => {
				const result = await detectFramework(tmp, {
					dependencies: {
						"tanstack-start": "1.0.0",
					},
				});

				expect(result).not.toBeNull();
				expect(result?.id).toBe("tanstack-start");
				expect(result?.name).toBe("Tanstack Start");
				expect(result?.dependency).toBe("tanstack-start");
			},
		);

		testWithTmpDir(
			"should detect Hono framework when 'hono' dependency exists",
			async ({ tmp }) => {
				const result = await detectFramework(tmp, {
					dependencies: {
						hono: "1.0.0",
					},
				});

				expect(result).not.toBeNull();
				expect(result?.id).toBe("hono");
				expect(result?.name).toBe("Hono");
				expect(result?.dependency).toBe("hono");
			},
		);

		testWithTmpDir(
			"should detect Fastify framework when 'fastify' dependency exists",
			async ({ tmp }) => {
				const result = await detectFramework(tmp, {
					dependencies: {
						fastify: "1.0.0",
					},
				});

				expect(result).not.toBeNull();
				expect(result?.id).toBe("fastify");
				expect(result?.name).toBe("Fastify");
				expect(result?.dependency).toBe("fastify");
			},
		);

		testWithTmpDir(
			"should detect Express framework when 'express' dependency exists",
			async ({ tmp }) => {
				const result = await detectFramework(tmp, {
					dependencies: {
						express: "1.0.0",
					},
				});

				expect(result).not.toBeNull();
				expect(result?.id).toBe("express");
				expect(result?.name).toBe("Express");
				expect(result?.dependency).toBe("express");
			},
		);

		testWithTmpDir(
			"should detect Elysia framework when 'elysia' dependency exists",
			async ({ tmp }) => {
				const result = await detectFramework(tmp, {
					dependencies: {
						elysia: "1.0.0",
					},
				});

				expect(result).not.toBeNull();
				expect(result?.id).toBe("elysia");
				expect(result?.name).toBe("Elysia");
				expect(result?.dependency).toBe("elysia");
			},
		);

		testWithTmpDir(
			"should detect Nitro framework when 'nitro' dependency exists",
			async ({ tmp }) => {
				const result = await detectFramework(tmp, {
					dependencies: {
						nitro: "1.0.0",
					},
				});

				expect(result).not.toBeNull();
				expect(result?.id).toBe("nitro");
				expect(result?.name).toBe("Nitro");
				expect(result?.dependency).toBe("nitro");
			},
		);

		testWithTmpDir(
			"should return the first matching framework when multiple dependencies exist",
			async ({ tmp }) => {
				const result = await detectFramework(tmp, {
					dependencies: {
						astro: "1.0.0",
						next: "1.0.0",
					},
				});

				expect(result).not.toBeNull();
				expect(result?.id).toBe("astro"); // Astro comes first in FRAMEWORKS array
				// Should stop checking after finding 'astro', so should not check all frameworks
				expect(mockHasDependency).toHaveBeenCalledTimes(1); // Only checks astro before returning
			},
		);

		testWithTmpDir("should check frameworks in order", async ({ tmp }) => {
			const callOrder: string[] = [];
			mockHasDependency.mockImplementation((_, dependency) => {
				callOrder.push(dependency);
				return false;
			});

			await detectFramework(tmp, {});

			// Verify that frameworks are checked in the order they appear in FRAMEWORKS
			expect(callOrder).toEqual(FRAMEWORKS.map((f) => f.dependency));
		});
	});

	describe("route handler paths", () => {
		testWithTmpDir(
			"should have correct route handler path for Next.js",
			async ({ tmp }) => {
				const result = await detectFramework(tmp, {
					dependencies: {
						next: "1.0.0",
					},
				});

				expect(result?.routeHandler).not.toBeNull();
				expect(result?.routeHandler?.path).toBe("api/auth/[...all]/route.ts");
			},
		);

		testWithTmpDir(
			"should have correct route handler path for Astro",
			async ({ tmp }) => {
				const result = await detectFramework(tmp, {
					dependencies: {
						astro: "1.0.0",
					},
				});

				expect(result?.routeHandler).not.toBeNull();
				expect(result?.routeHandler?.path).toBe("pages/api/auth/[...all].ts");
			},
		);

		testWithTmpDir(
			"should have correct route handler path for Remix",
			async ({ tmp }) => {
				const result = await detectFramework(tmp, {
					dependencies: {
						"@remix-run/server-runtime": "1.0.0",
					},
				});

				expect(result?.routeHandler).not.toBeNull();
				expect(result?.routeHandler?.path).toBe("app/lib/auth.server.ts");
			},
		);

		testWithTmpDir(
			"should have correct route handler path for Nuxt",
			async ({ tmp }) => {
				const result = await detectFramework(tmp, {
					dependencies: {
						nuxt: "1.0.0",
					},
				});

				expect(result?.routeHandler).not.toBeNull();
				expect(result?.routeHandler?.path).toBe("server/api/auth/[...all].ts");
			},
		);

		testWithTmpDir(
			"should have correct route handler path for SvelteKit",
			async ({ tmp }) => {
				const result = await detectFramework(tmp, {
					dependencies: {
						"@sveltejs/kit": "1.0.0",
					},
				});

				expect(result?.routeHandler).not.toBeNull();
				expect(result?.routeHandler?.path).toBe("hooks.server.ts");
			},
		);

		testWithTmpDir(
			"should have correct route handler path for Solid Start",
			async ({ tmp }) => {
				const result = await detectFramework(tmp, {
					dependencies: {
						"solid-start": "1.0.0",
					},
				});

				expect(result?.routeHandler).not.toBeNull();
				expect(result?.routeHandler?.path).toBe("routes/api/auth/*auth.ts");
			},
		);

		testWithTmpDir(
			"should have correct route handler path for Tanstack Start",
			async ({ tmp }) => {
				const result = await detectFramework(tmp, {
					dependencies: {
						"tanstack-start": "1.0.0",
					},
				});

				expect(result?.routeHandler).not.toBeNull();
				expect(result?.routeHandler?.path).toBe("src/routes/api/auth/$.ts");
			},
		);

		testWithTmpDir(
			"should have null route handler for Hono",
			async ({ tmp }) => {
				const result = await detectFramework(tmp, {
					dependencies: {
						hono: "1.0.0",
					},
				});

				expect(result?.routeHandler).toBeNull();
			},
		);

		testWithTmpDir(
			"should have null route handler for Fastify",
			async ({ tmp }) => {
				const result = await detectFramework(tmp, {
					dependencies: {
						fastify: "1.0.0",
					},
				});

				expect(result?.routeHandler).toBeNull();
			},
		);

		testWithTmpDir(
			"should have null route handler for Express",
			async ({ tmp }) => {
				const result = await detectFramework(tmp, {
					dependencies: {
						express: "1.0.0",
					},
				});

				expect(result?.routeHandler).toBeNull();
			},
		);

		testWithTmpDir(
			"should have null route handler for Elysia",
			async ({ tmp }) => {
				const result = await detectFramework(tmp, {
					dependencies: {
						elysia: "1.0.0",
					},
				});

				expect(result?.routeHandler).toBeNull();
			},
		);

		testWithTmpDir(
			"should have null route handler for Nitro",
			async ({ tmp }) => {
				const result = await detectFramework(tmp, {
					dependencies: {
						nitro: "1.0.0",
					},
				});

				expect(result?.routeHandler).toBeNull();
			},
		);

		testWithTmpDir(
			"should have route handler code for frameworks with route handlers",
			async ({ tmp }) => {
				const frameworksWithRoutes = FRAMEWORKS.filter(
					(f) => f.routeHandler !== null,
				);

				for (const framework of frameworksWithRoutes) {
					const result = await detectFramework(tmp, {
						dependencies: {
							[framework.dependency]: "1.0.0",
						},
					});

					expect(result?.routeHandler).not.toBeNull();
					expect(result?.routeHandler?.code).toBeDefined();
					expect(typeof result?.routeHandler?.code).toBe("string");
					expect(result?.routeHandler?.code.length).toBeGreaterThan(0);
				}
			},
		);

		// todo: run this test once remix is removed
		it.skip("should verify all route handler paths are unique", () => {
			const routeHandlerPaths = FRAMEWORKS.filter(
				(f) => f.routeHandler !== null,
			).map((f) => f.routeHandler!.path);

			const uniquePaths = new Set(routeHandlerPaths);
			expect(routeHandlerPaths.length).toBe(uniquePaths.size);
		});
	});

	describe("auth client import paths", () => {
		testWithTmpDir(
			"should have correct auth client import path for Next.js",
			async ({ tmp }) => {
				const result = await detectFramework(tmp, {
					dependencies: {
						next: "1.0.0",
					},
				});

				expect(result?.authClient).not.toBeNull();
				expect(result?.authClient?.importPath).toBe("better-auth/react");
			},
		);

		testWithTmpDir(
			"should have correct auth client import path for Astro",
			async ({ tmp }) => {
				const result = await detectFramework(tmp, {
					dependencies: {
						astro: "1.0.0",
					},
				});

				expect(result?.authClient).not.toBeNull();
				expect(result?.authClient?.importPath).toBe("better-auth/react");
			},
		);

		testWithTmpDir(
			"should have correct auth client import path for Nuxt",
			async ({ tmp }) => {
				const result = await detectFramework(tmp, {
					dependencies: {
						nuxt: "1.0.0",
					},
				});

				expect(result?.authClient).not.toBeNull();
				expect(result?.authClient?.importPath).toBe("better-auth/vue");
			},
		);

		testWithTmpDir(
			"should have correct auth client import path for SvelteKit",
			async ({ tmp }) => {
				const result = await detectFramework(tmp, {
					dependencies: {
						"@sveltejs/kit": "1.0.0",
					},
				});

				expect(result?.authClient).not.toBeNull();
				expect(result?.authClient?.importPath).toBe("better-auth/svelte");
			},
		);

		testWithTmpDir(
			"should have correct auth client import path for Solid Start",
			async ({ tmp }) => {
				const result = await detectFramework(tmp, {
					dependencies: {
						"solid-start": "1.0.0",
					},
				});

				expect(result?.authClient).not.toBeNull();
				expect(result?.authClient?.importPath).toBe("better-auth/solid");
			},
		);

		testWithTmpDir(
			"should have null auth client for server-only frameworks",
			async ({ tmp }) => {
				const serverFrameworks = [
					"hono",
					"fastify",
					"express",
					"elysia",
					"nitro",
				];

				for (const frameworkId of serverFrameworks) {
					const framework = FRAMEWORKS.find((f) => f.id === frameworkId);
					if (!framework) continue;

					const result = await detectFramework(tmp, {
						dependencies: {
							[framework.dependency]: "1.0.0",
						},
					});

					expect(result?.authClient).toBeNull();
				}
			},
		);
	});
});
