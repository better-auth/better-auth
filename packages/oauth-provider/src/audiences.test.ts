import type { AuthContext } from "@better-auth/core";
import { logger } from "@better-auth/core/env";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	collectAudienceInputs,
	getAudience,
	invalidateAudienceCache,
	resetSeedStateForTests,
	resolveEnforcePerClientAudiences,
	seedAudiences,
	seedAudiencesOnce,
} from "./audiences";
import { oauthProvider } from "./oauth";
import type { OAuthAudience, OAuthOptions, Scope } from "./types";

const silenceWarnings = {
	oauthAuthServerConfig: true,
	openidConfig: true,
} as const;

describe("resolveEnforcePerClientAudiences", () => {
	it("returns explicit value when set to true", () => {
		expect(
			resolveEnforcePerClientAudiences({ enforcePerClientAudiences: true }),
		).toEqual({ value: true, source: "explicit" });
	});

	it("returns explicit value when set to false", () => {
		expect(
			resolveEnforcePerClientAudiences({ enforcePerClientAudiences: false }),
		).toEqual({ value: false, source: "explicit" });
	});

	it("legacy path (validAudiences only) resolves to false", () => {
		expect(
			resolveEnforcePerClientAudiences({
				validAudiences: ["https://api.example.com"],
			}),
		).toEqual({ value: false, source: "smart-default-legacy" });
	});

	it("new path (audiences only) resolves to true", () => {
		expect(
			resolveEnforcePerClientAudiences({
				audiences: ["https://api.example.com"],
			}),
		).toEqual({ value: true, source: "smart-default-new" });
	});

	it("no audience config at all resolves to true (secure default)", () => {
		expect(resolveEnforcePerClientAudiences({})).toEqual({
			value: true,
			source: "smart-default-new",
		});
	});

	it("both validAudiences and audiences set resolves to true (new path wins)", () => {
		expect(
			resolveEnforcePerClientAudiences({
				validAudiences: ["https://legacy"],
				audiences: ["https://new"],
			}),
		).toEqual({ value: true, source: "smart-default-new" });
	});

	it("empty validAudiences array is treated as unset", () => {
		expect(resolveEnforcePerClientAudiences({ validAudiences: [] })).toEqual({
			value: true,
			source: "smart-default-new",
		});
	});

	it("explicit false beats the smart default when audiences is set", () => {
		expect(
			resolveEnforcePerClientAudiences({
				enforcePerClientAudiences: false,
				audiences: ["https://api"],
			}),
		).toEqual({ value: false, source: "explicit" });
	});
});

describe("collectAudienceInputs", () => {
	let warnSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
	});

	afterEach(() => {
		warnSpy.mockRestore();
	});

	it("logs a deprecation warning when validAudiences is used", () => {
		collectAudienceInputs({ validAudiences: ["https://api.example.com"] });
		expect(warnSpy).toHaveBeenCalledOnce();
		const [message] = warnSpy.mock.calls[0] ?? [];
		expect(String(message)).toMatch(/validAudiences.*deprecated/i);
	});

	it("does not warn when only audiences is used", () => {
		collectAudienceInputs({ audiences: ["https://api.example.com"] });
		expect(warnSpy).not.toHaveBeenCalled();
	});

	it("converts string entries in audiences to identifier-only inputs", () => {
		const inputs = collectAudienceInputs({
			audiences: ["https://a", { identifier: "https://b", accessTokenTtl: 60 }],
		});
		expect(inputs).toEqual([
			{ identifier: "https://a" },
			{ identifier: "https://b", accessTokenTtl: 60 },
		]);
	});

	it("concatenates legacy + new audiences in order", () => {
		const inputs = collectAudienceInputs({
			validAudiences: ["https://legacy"],
			audiences: [{ identifier: "https://new", accessTokenTtl: 300 }],
		});
		expect(inputs).toEqual([
			{ identifier: "https://legacy" },
			{ identifier: "https://new", accessTokenTtl: 300 },
		]);
	});

	it("returns empty array when no audience config is provided", () => {
		expect(collectAudienceInputs({})).toEqual([]);
	});
});

/**
 * Helper that boots a fresh in-memory auth instance with the given
 * `oauthProvider` options. Each test gets a clean DB. `loginPage` /
 * `consentPage` / `silenceWarnings` are filled with sensible defaults so
 * audience tests only state what's relevant.
 *
 * Better Auth's test harness runs `runMigrations()` AFTER plugin init,
 * so seeding at init silently defers (table doesn't exist yet). The helper
 * runs `seedAudiences()` explicitly post-migration to give tests the same
 * end state they'd see in production after the first audience request.
 */
type AudienceTestOptions = Partial<OAuthOptions<Scope[]>>;

const bootWithAudiencesOption = async (options: AudienceTestOptions = {}) => {
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
	await seedAudiencesOnce(ctx as unknown as AuthContext, resolvedOpts);
	return { ...instance, opts: resolvedOpts };
};

const readAudience = async (
	auth: Awaited<ReturnType<typeof bootWithAudiencesOption>>["auth"],
	identifier: string,
) =>
	auth.$context.then((ctx) =>
		ctx.adapter.findOne<OAuthAudience>({
			model: "oauthAudience",
			where: [{ field: "identifier", value: identifier }],
		}),
	);

describe("seedAudiences (integration via plugin init)", () => {
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

	it("seeds nothing when no audience config is set", async () => {
		const { auth } = await bootWithAudiencesOption({});
		const row = await readAudience(auth, "https://nope.example.com");
		expect(row).toBeNull();
	});

	it("seeds string-form `audiences` entries with plugin defaults", async () => {
		const { auth } = await bootWithAudiencesOption({
			audiences: ["https://api.example.com"],
		});
		const row = await readAudience(auth, "https://api.example.com");
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

	it("seeds object-form `audiences` entries with explicit policy", async () => {
		const { auth } = await bootWithAudiencesOption({
			audiences: [
				{
					identifier: "https://api.example.com/admin",
					name: "Admin API",
					accessTokenTtl: 300,
					allowedScopes: ["admin:read", "admin:write"],
					signingAlgorithm: "EdDSA",
				},
			],
		});
		const row = await readAudience(auth, "https://api.example.com/admin");
		expect(row).toMatchObject({
			identifier: "https://api.example.com/admin",
			name: "Admin API",
			accessTokenTtl: 300,
			allowedScopes: ["admin:read", "admin:write"],
			signingAlgorithm: "EdDSA",
		});
	});

	it("seeds legacy validAudiences and emits a deprecation warning", async () => {
		await bootWithAudiencesOption({
			validAudiences: ["https://legacy.example.com"],
		});
		expect(warnSpy).toHaveBeenCalled();
		const allCalls = warnSpy.mock.calls
			.map((call: unknown[]) => String(call[0] ?? ""))
			.join("\n");
		expect(allCalls).toMatch(/validAudiences.*deprecated/i);
	});

	it("logs the enforcePerClientAudiences resolution at init", async () => {
		await bootWithAudiencesOption({
			audiences: ["https://api.example.com"],
		});
		const allCalls = infoSpy.mock.calls
			.map((call: unknown[]) => String(call[0] ?? ""))
			.join("\n");
		expect(allCalls).toMatch(/enforcePerClientAudiences resolved to true/);
		expect(allCalls).toMatch(/smart-default-new/);
	});

	it("insertOnly (default) preserves existing rows when re-seeded", async () => {
		const identifier = "https://api.example.com/insert-only";

		// First boot creates the row.
		const first = await bootWithAudiencesOption({
			audiences: [{ identifier, name: "Original" }],
		});
		const firstCtx = await first.auth.$context;
		await firstCtx.adapter.update({
			model: "oauthAudience",
			where: [{ field: "identifier", value: identifier }],
			update: { name: "Admin edited" },
		});

		// Simulate a reboot by re-running seedAudiences against the same context
		// with a renamed value — insertOnly should leave the admin edit intact.
		await seedAudiences(
			firstCtx as unknown as AuthContext,
			{
				loginPage: "/login",
				consentPage: "/consent",
				audiences: [{ identifier, name: "Config rename attempt" }],
			} as OAuthOptions<Scope[]>,
		);

		const row = await readAudience(first.auth, identifier);
		expect(row?.name).toBe("Admin edited");
	});

	it("merge mode updates only specified fields on existing rows", async () => {
		const identifier = "https://api.example.com/merge";

		const first = await bootWithAudiencesOption({
			audiences: [
				{
					identifier,
					name: "Original",
					accessTokenTtl: 600,
					allowedScopes: ["a", "b"],
				},
			],
		});
		const firstCtx = await first.auth.$context;

		await seedAudiences(
			firstCtx as unknown as AuthContext,
			{
				loginPage: "/login",
				consentPage: "/consent",
				audiences: [{ identifier, accessTokenTtl: 120 }],
				audienceSeedMode: "merge",
			} as OAuthOptions<Scope[]>,
		);

		const row = await readAudience(first.auth, identifier);
		expect(row).toMatchObject({
			name: "Original", // untouched
			accessTokenTtl: 120, // updated
			allowedScopes: ["a", "b"], // untouched
		});
	});

	it("overwrite mode replaces every field on existing rows", async () => {
		const identifier = "https://api.example.com/overwrite";

		const first = await bootWithAudiencesOption({
			audiences: [
				{
					identifier,
					name: "Original",
					accessTokenTtl: 600,
					allowedScopes: ["a", "b"],
				},
			],
		});
		const firstCtx = await first.auth.$context;

		await seedAudiences(
			firstCtx as unknown as AuthContext,
			{
				loginPage: "/login",
				consentPage: "/consent",
				audiences: [{ identifier, accessTokenTtl: 120 }],
				audienceSeedMode: "overwrite",
			} as OAuthOptions<Scope[]>,
		);

		const row = await readAudience(first.auth, identifier);
		expect(row).toMatchObject({
			name: identifier, // overwrite uses identifier as default name
			accessTokenTtl: 120,
			allowedScopes: null, // cleared
		});
	});
});

describe("getAudience + cache", () => {
	afterEach(() => {
		invalidateAudienceCache();
	});

	it("returns the row from the DB when cache is not opt-in", async () => {
		const { auth } = await bootWithAudiencesOption({
			audiences: ["https://api.example.com/uncached"],
		});
		const ctx = await auth.$context;

		const row = await getAudience(
			{ context: ctx } as never,
			{ audiences: ["https://api.example.com/uncached"] } as never,
			"https://api.example.com/uncached",
		);
		expect(row?.identifier).toBe("https://api.example.com/uncached");
	});

	it("caches when identifier is in cachedAudiences", async () => {
		const identifier = "https://api.example.com/cached";
		const cachedAudiences = new Set([identifier]);
		const { auth } = await bootWithAudiencesOption({
			audiences: [identifier],
			cachedAudiences,
		});
		const ctx = await auth.$context;
		const opts = { audiences: [identifier], cachedAudiences } as never;

		// First lookup populates the cache.
		const first = await getAudience(
			{ context: ctx } as never,
			opts,
			identifier,
		);
		expect(first?.identifier).toBe(identifier);

		// Mutate the row directly in the DB.
		await ctx.adapter.update({
			model: "oauthAudience",
			where: [{ field: "identifier", value: identifier }],
			update: { name: "Mutated externally" },
		});

		// Cached lookup still returns the old name (cache wins until invalidation).
		const second = await getAudience(
			{ context: ctx } as never,
			opts,
			identifier,
		);
		expect(second?.name).toBe(identifier); // pre-mutation value

		// After invalidation the next lookup hits the DB.
		invalidateAudienceCache(identifier);
		const third = await getAudience(
			{ context: ctx } as never,
			opts,
			identifier,
		);
		expect(third?.name).toBe("Mutated externally");
	});
});
