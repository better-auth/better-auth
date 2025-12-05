import { beforeEach, describe, expect, it, vi } from "vitest";
import { FRAMEWORKS } from "../configs/frameworks.config";
import { autoDetectFramework } from "./framework";

// Mock the hasDependency function
vi.mock("../../../utils/get-package-json", () => ({
	hasDependency: vi.fn(),
}));

import { hasDependency } from "../../../utils/get-package-json";

describe("Init CLI - framework utility", () => {
	const mockHasDependency = vi.mocked(hasDependency);
	const cwd = "/test/project";

	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("autoDetectFramework", () => {
		it("should return null when no framework dependencies are found", async () => {
			mockHasDependency.mockResolvedValue(false);

			const result = await autoDetectFramework(cwd);

			expect(result).toBeNull();
			expect(mockHasDependency).toHaveBeenCalledTimes(FRAMEWORKS.length);
		});

		it("should detect Next.js framework when 'next' dependency exists", async () => {
			mockHasDependency.mockImplementation(async (_, dependency) => {
				return dependency === "next";
			});

			const result = await autoDetectFramework(cwd);

			expect(result).not.toBeNull();
			expect(result?.id).toBe("next");
			expect(result?.name).toBe("Next.js");
			expect(result?.dependency).toBe("next");
			expect(mockHasDependency).toHaveBeenCalledWith(cwd, "next");
		});

		it("should detect Astro framework when 'astro' dependency exists", async () => {
			mockHasDependency.mockImplementation(async (_, dependency) => {
				return dependency === "astro";
			});

			const result = await autoDetectFramework(cwd);

			expect(result).not.toBeNull();
			expect(result?.id).toBe("astro");
			expect(result?.name).toBe("Astro");
			expect(result?.dependency).toBe("astro");
		});

		it("should detect Remix framework when '@remix-run/server-runtime' dependency exists", async () => {
			mockHasDependency.mockImplementation(async (_, dependency) => {
				return dependency === "@remix-run/server-runtime";
			});

			const result = await autoDetectFramework(cwd);

			expect(result).not.toBeNull();
			expect(result?.id).toBe("remix");
			expect(result?.name).toBe("Remix");
			expect(result?.dependency).toBe("@remix-run/server-runtime");
		});

		it("should detect Nuxt framework when 'nuxt' dependency exists", async () => {
			mockHasDependency.mockImplementation(async (_, dependency) => {
				return dependency === "nuxt";
			});

			const result = await autoDetectFramework(cwd);

			expect(result).not.toBeNull();
			expect(result?.id).toBe("nuxt");
			expect(result?.name).toBe("Nuxt");
			expect(result?.dependency).toBe("nuxt");
		});

		it("should detect SvelteKit framework when '@sveltejs/kit' dependency exists", async () => {
			mockHasDependency.mockImplementation(async (_, dependency) => {
				return dependency === "@sveltejs/kit";
			});

			const result = await autoDetectFramework(cwd);

			expect(result).not.toBeNull();
			expect(result?.id).toBe("sveltekit");
			expect(result?.name).toBe("SvelteKit");
			expect(result?.dependency).toBe("@sveltejs/kit");
		});

		it("should detect Solid Start framework when 'solid-start' dependency exists", async () => {
			mockHasDependency.mockImplementation(async (_, dependency) => {
				return dependency === "solid-start";
			});

			const result = await autoDetectFramework(cwd);

			expect(result).not.toBeNull();
			expect(result?.id).toBe("solid-start");
			expect(result?.name).toBe("Solid Start");
			expect(result?.dependency).toBe("solid-start");
		});

		it("should detect Tanstack Start framework when 'tanstack-start' dependency exists", async () => {
			mockHasDependency.mockImplementation(async (_, dependency) => {
				return dependency === "tanstack-start";
			});

			const result = await autoDetectFramework(cwd);

			expect(result).not.toBeNull();
			expect(result?.id).toBe("tanstack-start");
			expect(result?.name).toBe("Tanstack Start");
			expect(result?.dependency).toBe("tanstack-start");
		});

		it("should detect Hono framework when 'hono' dependency exists", async () => {
			mockHasDependency.mockImplementation(async (_, dependency) => {
				return dependency === "hono";
			});

			const result = await autoDetectFramework(cwd);

			expect(result).not.toBeNull();
			expect(result?.id).toBe("hono");
			expect(result?.name).toBe("Hono");
			expect(result?.dependency).toBe("hono");
		});

		it("should detect Fastify framework when 'fastify' dependency exists", async () => {
			mockHasDependency.mockImplementation(async (_, dependency) => {
				return dependency === "fastify";
			});

			const result = await autoDetectFramework(cwd);

			expect(result).not.toBeNull();
			expect(result?.id).toBe("fastify");
			expect(result?.name).toBe("Fastify");
			expect(result?.dependency).toBe("fastify");
		});

		it("should detect Express framework when 'express' dependency exists", async () => {
			mockHasDependency.mockImplementation(async (_, dependency) => {
				return dependency === "express";
			});

			const result = await autoDetectFramework(cwd);

			expect(result).not.toBeNull();
			expect(result?.id).toBe("express");
			expect(result?.name).toBe("Express");
			expect(result?.dependency).toBe("express");
		});

		it("should detect Elysia framework when 'elysia' dependency exists", async () => {
			mockHasDependency.mockImplementation(async (_, dependency) => {
				return dependency === "elysia";
			});

			const result = await autoDetectFramework(cwd);

			expect(result).not.toBeNull();
			expect(result?.id).toBe("elysia");
			expect(result?.name).toBe("Elysia");
			expect(result?.dependency).toBe("elysia");
		});

		it("should detect Nitro framework when 'nitro' dependency exists", async () => {
			mockHasDependency.mockImplementation(async (_, dependency) => {
				return dependency === "nitro";
			});

			const result = await autoDetectFramework(cwd);

			expect(result).not.toBeNull();
			expect(result?.id).toBe("nitro");
			expect(result?.name).toBe("Nitro");
			expect(result?.dependency).toBe("nitro");
		});

		it("should return the first matching framework when multiple dependencies exist", async () => {
			// Simulate that both 'astro' and 'next' exist, but 'astro' comes first in FRAMEWORKS
			mockHasDependency.mockImplementation(async (_, dependency) => {
				// Return true for 'astro' (first match), but also true for 'next' to test early return
				return dependency === "astro" || dependency === "next";
			});

			const result = await autoDetectFramework(cwd);

			expect(result).not.toBeNull();
			expect(result?.id).toBe("astro"); // Astro comes first in FRAMEWORKS array
			// Should stop checking after finding 'astro', so should not check all frameworks
			expect(mockHasDependency).toHaveBeenCalledTimes(1); // Only checks astro before returning
		});

		it("should check frameworks in order", async () => {
			const callOrder: string[] = [];
			mockHasDependency.mockImplementation(async (_, dependency) => {
				callOrder.push(dependency);
				return false;
			});

			await autoDetectFramework(cwd);

			// Verify that frameworks are checked in the order they appear in FRAMEWORKS
			expect(callOrder).toEqual(FRAMEWORKS.map((f) => f.dependency));
		});
	});

	describe("route handler paths", () => {
		it("should have correct route handler path for Next.js", async () => {
			mockHasDependency.mockImplementation(async (_, dependency) => {
				return dependency === "next";
			});

			const result = await autoDetectFramework(cwd);

			expect(result?.routeHandler).not.toBeNull();
			expect(result?.routeHandler?.path).toBe("api/auth/[...all]/route.ts");
		});

		it("should have correct route handler path for Astro", async () => {
			mockHasDependency.mockImplementation(async (_, dependency) => {
				return dependency === "astro";
			});

			const result = await autoDetectFramework(cwd);

			expect(result?.routeHandler).not.toBeNull();
			expect(result?.routeHandler?.path).toBe("pages/api/auth/[...all].ts");
		});

		it("should have correct route handler path for Remix", async () => {
			mockHasDependency.mockImplementation(async (_, dependency) => {
				return dependency === "@remix-run/server-runtime";
			});

			const result = await autoDetectFramework(cwd);

			expect(result?.routeHandler).not.toBeNull();
			expect(result?.routeHandler?.path).toBe("app/lib/auth.server.ts");
		});

		it("should have correct route handler path for Nuxt", async () => {
			mockHasDependency.mockImplementation(async (_, dependency) => {
				return dependency === "nuxt";
			});

			const result = await autoDetectFramework(cwd);

			expect(result?.routeHandler).not.toBeNull();
			expect(result?.routeHandler?.path).toBe("server/api/auth/[...all].ts");
		});

		it("should have correct route handler path for SvelteKit", async () => {
			mockHasDependency.mockImplementation(async (_, dependency) => {
				return dependency === "@sveltejs/kit";
			});

			const result = await autoDetectFramework(cwd);

			expect(result?.routeHandler).not.toBeNull();
			expect(result?.routeHandler?.path).toBe("hooks.server.ts");
		});

		it("should have correct route handler path for Solid Start", async () => {
			mockHasDependency.mockImplementation(async (_, dependency) => {
				return dependency === "solid-start";
			});

			const result = await autoDetectFramework(cwd);

			expect(result?.routeHandler).not.toBeNull();
			expect(result?.routeHandler?.path).toBe("routes/api/auth/*auth.ts");
		});

		it("should have correct route handler path for Tanstack Start", async () => {
			mockHasDependency.mockImplementation(async (_, dependency) => {
				return dependency === "tanstack-start";
			});

			const result = await autoDetectFramework(cwd);

			expect(result?.routeHandler).not.toBeNull();
			expect(result?.routeHandler?.path).toBe("src/routes/api/auth/$.ts");
		});

		it("should have null route handler for Hono", async () => {
			mockHasDependency.mockImplementation(async (_, dependency) => {
				return dependency === "hono";
			});

			const result = await autoDetectFramework(cwd);

			expect(result?.routeHandler).toBeNull();
		});

		it("should have null route handler for Fastify", async () => {
			mockHasDependency.mockImplementation(async (_, dependency) => {
				return dependency === "fastify";
			});

			const result = await autoDetectFramework(cwd);

			expect(result?.routeHandler).toBeNull();
		});

		it("should have null route handler for Express", async () => {
			mockHasDependency.mockImplementation(async (_, dependency) => {
				return dependency === "express";
			});

			const result = await autoDetectFramework(cwd);

			expect(result?.routeHandler).toBeNull();
		});

		it("should have null route handler for Elysia", async () => {
			mockHasDependency.mockImplementation(async (_, dependency) => {
				return dependency === "elysia";
			});

			const result = await autoDetectFramework(cwd);

			expect(result?.routeHandler).toBeNull();
		});

		it("should have null route handler for Nitro", async () => {
			mockHasDependency.mockImplementation(async (_, dependency) => {
				return dependency === "nitro";
			});

			const result = await autoDetectFramework(cwd);

			expect(result?.routeHandler).toBeNull();
		});

		it("should have route handler code for frameworks with route handlers", async () => {
			const frameworksWithRoutes = FRAMEWORKS.filter(
				(f) => f.routeHandler !== null,
			);

			for (const framework of frameworksWithRoutes) {
				mockHasDependency.mockImplementation(async (_, dependency) => {
					return dependency === framework.dependency;
				});

				const result = await autoDetectFramework(cwd);

				expect(result?.routeHandler).not.toBeNull();
				expect(result?.routeHandler?.code).toBeDefined();
				expect(typeof result?.routeHandler?.code).toBe("string");
				expect(result?.routeHandler?.code.length).toBeGreaterThan(0);
			}
		});

		it("should verify all route handler paths are unique", () => {
			const routeHandlerPaths = FRAMEWORKS.filter(
				(f) => f.routeHandler !== null,
			).map((f) => f.routeHandler!.path);

			const uniquePaths = new Set(routeHandlerPaths);
			expect(routeHandlerPaths.length).toBe(uniquePaths.size);
		});
	});

	describe("auth client import paths", () => {
		it("should have correct auth client import path for Next.js", async () => {
			mockHasDependency.mockImplementation(async (_, dependency) => {
				return dependency === "next";
			});

			const result = await autoDetectFramework(cwd);

			expect(result?.authClient).not.toBeNull();
			expect(result?.authClient?.importPath).toBe("better-auth/react");
		});

		it("should have correct auth client import path for Astro", async () => {
			mockHasDependency.mockImplementation(async (_, dependency) => {
				return dependency === "astro";
			});

			const result = await autoDetectFramework(cwd);

			expect(result?.authClient).not.toBeNull();
			expect(result?.authClient?.importPath).toBe("better-auth/react");
		});

		it("should have correct auth client import path for Nuxt", async () => {
			mockHasDependency.mockImplementation(async (_, dependency) => {
				return dependency === "nuxt";
			});

			const result = await autoDetectFramework(cwd);

			expect(result?.authClient).not.toBeNull();
			expect(result?.authClient?.importPath).toBe("better-auth/vue");
		});

		it("should have correct auth client import path for SvelteKit", async () => {
			mockHasDependency.mockImplementation(async (_, dependency) => {
				return dependency === "@sveltejs/kit";
			});

			const result = await autoDetectFramework(cwd);

			expect(result?.authClient).not.toBeNull();
			expect(result?.authClient?.importPath).toBe("better-auth/svelte");
		});

		it("should have correct auth client import path for Solid Start", async () => {
			mockHasDependency.mockImplementation(async (_, dependency) => {
				return dependency === "solid-start";
			});

			const result = await autoDetectFramework(cwd);

			expect(result?.authClient).not.toBeNull();
			expect(result?.authClient?.importPath).toBe("better-auth/solid");
		});

		it("should have null auth client for server-only frameworks", async () => {
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

				mockHasDependency.mockImplementation(async (_, dependency) => {
					return dependency === framework.dependency;
				});

				const result = await autoDetectFramework(cwd);

				expect(result?.authClient).toBeNull();
			}
		});
	});
});
