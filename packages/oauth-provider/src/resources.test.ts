import type { AuthContext } from "@better-auth/core";
import { logger } from "@better-auth/core/env";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { oauthProvider } from "./oauth";
import {
	collectResourceInputs,
	getResource,
	invalidateResourceCache,
	resetSeedStateForTests,
	resolveEnforcePerClientResources,
	seedResources,
	seedResourcesOnce,
} from "./resources";
import type { OAuthOptions, OAuthResource, Scope } from "./types";

const silenceWarnings = {
	oauthAuthServerConfig: true,
	openidConfig: true,
} as const;

describe("resolveEnforcePerClientResources", () => {
	it("returns explicit value when set to true", () => {
		expect(
			resolveEnforcePerClientResources({ enforcePerClientResources: true }),
		).toEqual({ value: true, source: "explicit" });
	});

	it("returns explicit value when set to false", () => {
		expect(
			resolveEnforcePerClientResources({ enforcePerClientResources: false }),
		).toEqual({ value: false, source: "explicit" });
	});

	it("defaults to true", () => {
		expect(resolveEnforcePerClientResources({})).toEqual({
			value: true,
			source: "default",
		});
	});

	it("explicit false beats the default", () => {
		expect(
			resolveEnforcePerClientResources({
				enforcePerClientResources: false,
			}),
		).toEqual({ value: false, source: "explicit" });
	});
});

describe("collectResourceInputs", () => {
	let warnSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
	});

	afterEach(() => {
		warnSpy.mockRestore();
	});

	it("does not warn when resources is used", () => {
		collectResourceInputs({ resources: ["https://api.example.com"] });
		expect(warnSpy).not.toHaveBeenCalled();
	});

	it("converts string entries in resources to identifier-only inputs", () => {
		const inputs = collectResourceInputs({
			resources: ["https://a", { identifier: "https://b", accessTokenTtl: 60 }],
		});
		expect(inputs).toEqual([
			{ identifier: "https://a" },
			{ identifier: "https://b", accessTokenTtl: 60 },
		]);
	});

	it("preserves configured resource order", () => {
		const inputs = collectResourceInputs({
			resources: [
				"https://first",
				{ identifier: "https://second", accessTokenTtl: 300 },
			],
		});
		expect(inputs).toEqual([
			{ identifier: "https://first" },
			{ identifier: "https://second", accessTokenTtl: 300 },
		]);
	});

	it("returns empty array when no resource config is provided", () => {
		expect(collectResourceInputs({})).toEqual([]);
	});
});

/**
 * Helper that boots a fresh in-memory auth instance with the given
 * `oauthProvider` options. Each test gets a clean DB. `loginPage` /
 * `consentPage` / `silenceWarnings` are filled with sensible defaults so
 * resource tests only state what's relevant.
 *
 * Better Auth's test harness runs `runMigrations()` AFTER plugin init,
 * so seeding at init silently defers (table doesn't exist yet). The helper
 * runs `seedResources()` explicitly post-migration to give tests the same
 * end state they'd see in production after the first resource request.
 */
type ResourceTestOptions = Partial<OAuthOptions<Scope[]>>;

const bootWithResourcesOption = async (options: ResourceTestOptions = {}) => {
	const resolvedOpts = {
		loginPage: "/login",
		consentPage: "/consent",
		silenceWarnings,
		...options,
	} as OAuthOptions<Scope[]>;
	const instance = await getTestInstance({
		plugins: [jwt(), oauthProvider(resolvedOpts)],
	});
	resetSeedStateForTests();
	const ctx = await instance.auth.$context;
	await seedResourcesOnce(ctx as unknown as AuthContext, resolvedOpts);
	return { ...instance, opts: resolvedOpts };
};

const readResource = async (
	auth: Awaited<ReturnType<typeof bootWithResourcesOption>>["auth"],
	identifier: string,
) =>
	auth.$context.then((ctx) =>
		ctx.adapter.findOne<OAuthResource>({
			model: "oauthResource",
			where: [{ field: "identifier", value: identifier }],
		}),
	);

describe("seedResources (integration via plugin init)", () => {
	let warnSpy: ReturnType<typeof vi.spyOn>;
	let infoSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
		infoSpy = vi.spyOn(logger, "info").mockImplementation(() => undefined);
	});

	afterEach(() => {
		warnSpy.mockRestore();
		infoSpy.mockRestore();
	});

	it("seeds nothing when no resource config is set", async () => {
		const { auth } = await bootWithResourcesOption({});
		const row = await readResource(auth, "https://nope.example.com");
		expect(row).toBeNull();
	});

	it("seeds string-form `resources` entries with plugin defaults", async () => {
		const { auth } = await bootWithResourcesOption({
			resources: ["https://api.example.com"],
		});
		const row = await readResource(auth, "https://api.example.com");
		expect(row).toMatchObject({
			identifier: "https://api.example.com",
			name: "https://api.example.com",
			disabled: false,
			policyVersion: 1,
			accessTokenTtl: null,
			signingAlgorithm: null,
			allowedScopes: null,
		});
	});

	it("seeds object-form `resources` entries with explicit policy", async () => {
		const { auth } = await bootWithResourcesOption({
			resources: [
				{
					identifier: "https://api.example.com/admin",
					name: "Admin API",
					accessTokenTtl: 300,
					allowedScopes: ["admin:read", "admin:write"],
					signingAlgorithm: "EdDSA",
				},
			],
		});
		const row = await readResource(auth, "https://api.example.com/admin");
		expect(row).toMatchObject({
			identifier: "https://api.example.com/admin",
			name: "Admin API",
			accessTokenTtl: 300,
			allowedScopes: ["admin:read", "admin:write"],
			signingAlgorithm: "EdDSA",
		});
	});

	it("logs the enforcePerClientResources resolution at init", async () => {
		await bootWithResourcesOption({
			resources: ["https://api.example.com"],
		});
		const allCalls = infoSpy.mock.calls
			.map((call: unknown[]) => String(call[0] ?? ""))
			.join("\n");
		expect(allCalls).toMatch(/enforcePerClientResources resolved to true/);
		expect(allCalls).toMatch(/default/);
	});

	it("insertOnly (default) preserves existing rows when re-seeded", async () => {
		const identifier = "https://api.example.com/insert-only";

		// First boot creates the row.
		const first = await bootWithResourcesOption({
			resources: [{ identifier, name: "Original" }],
		});
		const firstCtx = await first.auth.$context;
		await firstCtx.adapter.update({
			model: "oauthResource",
			where: [{ field: "identifier", value: identifier }],
			update: { name: "Admin edited" },
		});

		// Simulate a reboot by re-running seedResources against the same context
		// with a renamed value — insertOnly should leave the admin edit intact.
		await seedResources(
			firstCtx as unknown as AuthContext,
			{
				loginPage: "/login",
				consentPage: "/consent",
				resources: [{ identifier, name: "Config rename attempt" }],
			} as OAuthOptions<Scope[]>,
		);

		const row = await readResource(first.auth, identifier);
		expect(row?.name).toBe("Admin edited");
	});

	it("merge mode updates only specified fields on existing rows", async () => {
		const identifier = "https://api.example.com/merge";

		const first = await bootWithResourcesOption({
			resources: [
				{
					identifier,
					name: "Original",
					accessTokenTtl: 600,
					allowedScopes: ["a", "b"],
				},
			],
		});
		const firstCtx = await first.auth.$context;

		await seedResources(
			firstCtx as unknown as AuthContext,
			{
				loginPage: "/login",
				consentPage: "/consent",
				resources: [{ identifier, accessTokenTtl: 120 }],
				resourceSeedMode: "merge",
			} as OAuthOptions<Scope[]>,
		);

		const row = await readResource(first.auth, identifier);
		expect(row).toMatchObject({
			name: "Original", // untouched
			accessTokenTtl: 120, // updated
			allowedScopes: ["a", "b"], // untouched
		});
	});

	it("overwrite mode replaces every field on existing rows", async () => {
		const identifier = "https://api.example.com/overwrite";

		const first = await bootWithResourcesOption({
			resources: [
				{
					identifier,
					name: "Original",
					accessTokenTtl: 600,
					allowedScopes: ["a", "b"],
				},
			],
		});
		const firstCtx = await first.auth.$context;

		await seedResources(
			firstCtx as unknown as AuthContext,
			{
				loginPage: "/login",
				consentPage: "/consent",
				resources: [{ identifier, accessTokenTtl: 120 }],
				resourceSeedMode: "overwrite",
			} as OAuthOptions<Scope[]>,
		);

		const row = await readResource(first.auth, identifier);
		expect(row).toMatchObject({
			name: identifier, // overwrite uses identifier as default name
			accessTokenTtl: 120,
			allowedScopes: null, // cleared
		});
	});
});

describe("getResource + cache", () => {
	afterEach(() => {
		invalidateResourceCache();
	});

	it("returns the row from the DB when cache is not opt-in", async () => {
		const { auth } = await bootWithResourcesOption({
			resources: ["https://api.example.com/uncached"],
		});
		const ctx = await auth.$context;

		const row = await getResource(
			{ context: ctx } as never,
			{ resources: ["https://api.example.com/uncached"] } as never,
			"https://api.example.com/uncached",
		);
		expect(row?.identifier).toBe("https://api.example.com/uncached");
	});

	it("caches when identifier is in cachedResources", async () => {
		const identifier = "https://api.example.com/cached";
		const cachedResources = new Set([identifier]);
		const { auth } = await bootWithResourcesOption({
			resources: [identifier],
			cachedResources,
		});
		const ctx = await auth.$context;
		const opts = { resources: [identifier], cachedResources } as never;

		// First lookup populates the cache.
		const first = await getResource(
			{ context: ctx } as never,
			opts,
			identifier,
		);
		expect(first?.identifier).toBe(identifier);

		// Mutate the row directly in the DB.
		await ctx.adapter.update({
			model: "oauthResource",
			where: [{ field: "identifier", value: identifier }],
			update: { name: "Mutated externally" },
		});

		// Cached lookup still returns the old name (cache wins until invalidation).
		const second = await getResource(
			{ context: ctx } as never,
			opts,
			identifier,
		);
		expect(second?.name).toBe(identifier); // pre-mutation value

		// After invalidation the next lookup hits the DB.
		invalidateResourceCache(identifier);
		const third = await getResource(
			{ context: ctx } as never,
			opts,
			identifier,
		);
		expect(third?.name).toBe("Mutated externally");
	});
});
