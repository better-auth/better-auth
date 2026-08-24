import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * `nodeENV` / `isProduction` are evaluated at module load time, so each scenario
 * stubs the global env source, resets the module registry, and re-imports a fresh
 * copy of the module.
 */
async function loadEnvModule() {
	vi.resetModules();
	return import("./env-impl");
}

describe("cross-runtime production detection", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.resetModules();
	});

	it("detects production from process.env (Node/Bun)", async () => {
		vi.stubGlobal("process", { env: { NODE_ENV: "production" } });
		const { nodeENV, isProduction } = await loadEnvModule();
		expect(nodeENV).toBe("production");
		expect(isProduction).toBe(true);
	});

	/**
	 * Regression: a non-Node runtime exposing NODE_ENV via Deno's env API (with no
	 * usable `process.env`) must still resolve `isProduction`, otherwise
	 * development-mode defaults (default secret acceptance, no rate limiting,
	 * non-Secure cookies) would carry over into production.
	 */
	it("detects production from Deno env when process.env is unavailable", async () => {
		// process exists but without a usable env, mirroring a stripped runtime
		vi.stubGlobal("process", { env: undefined });
		vi.stubGlobal("Deno", {
			env: {
				toObject: () => ({ NODE_ENV: "production" }),
				get: (key: string) => (key === "NODE_ENV" ? "production" : undefined),
			},
		});
		const { nodeENV, isProduction } = await loadEnvModule();
		expect(nodeENV).toBe("production");
		expect(isProduction).toBe(true);
	});

	it("detects production from a shimmed __env__ source", async () => {
		vi.stubGlobal("process", { env: undefined });
		vi.stubGlobal("__env__", { NODE_ENV: "production" });
		const { nodeENV, isProduction } = await loadEnvModule();
		expect(nodeENV).toBe("production");
		expect(isProduction).toBe(true);
	});

	it("is not production when no env source reports production", async () => {
		vi.stubGlobal("process", { env: {} });
		const { nodeENV, isProduction, isDevelopment } = await loadEnvModule();
		expect(nodeENV).toBe("");
		expect(isProduction).toBe(false);
		expect(isDevelopment()).toBe(false);
	});
});
