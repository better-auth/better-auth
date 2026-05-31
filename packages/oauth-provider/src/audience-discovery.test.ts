import type { AuthContext } from "@better-auth/core";
import { logger } from "@better-auth/core/env";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	invalidateAudienceCache,
	resetSeedStateForTests,
	seedAudiencesOnce,
} from "./audiences";
import { oauthProvider } from "./oauth";
import type { OAuthClientAudience, OAuthOptions, Scope } from "./types";

const silenceWarnings = {
	oauthAuthServerConfig: true,
	openidConfig: true,
} as const;

beforeEach(() => {
	vi.spyOn(logger, "warn").mockImplementation(() => undefined);
	vi.spyOn(logger, "info").mockImplementation(() => undefined);
});
afterEach(() => {
	vi.restoreAllMocks();
	invalidateAudienceCache();
});

const boot = async (options: Partial<OAuthOptions<Scope[]>> = {}) => {
	const opts = {
		loginPage: "/login",
		consentPage: "/consent",
		silenceWarnings,
		...options,
	} as OAuthOptions<Scope[]>;
	const instance = await getTestInstance({
		plugins: [jwt(), oauthProvider(opts)],
	});
	resetSeedStateForTests();
	const ctx = await instance.auth.$context;
	await seedAudiencesOnce(ctx as unknown as AuthContext, opts);
	return { ...instance, ctx, opts };
};

describe("DCR — audiences field (RFC 7591 §2 extension)", () => {
	it("registers a client with valid audiences and creates link rows", async () => {
		const instance = await boot({
			allowDynamicClientRegistration: true,
			allowUnauthenticatedClientRegistration: true,
			audiences: ["https://api.example.com/dcr-link"],
		});

		const result = (await instance.auth.api.registerOAuthClient({
			body: {
				redirect_uris: ["https://app.example.com/callback"],
				audiences: ["https://api.example.com/dcr-link"],
			},
		})) as { client_id: string; audiences?: string[] };

		expect(result.client_id).toBeDefined();
		expect(result.audiences).toEqual(["https://api.example.com/dcr-link"]);

		const links = await instance.ctx.adapter.findMany<OAuthClientAudience>({
			model: "oauthClientAudience",
			where: [{ field: "clientId", value: result.client_id }],
		});
		expect(links?.length).toBe(1);
		expect(links?.[0]?.audienceId).toBe("https://api.example.com/dcr-link");
	});

	it("rejects registration with an unknown audience", async () => {
		const instance = await boot({
			allowDynamicClientRegistration: true,
			allowUnauthenticatedClientRegistration: true,
			audiences: ["https://api.example.com/exists"],
		});
		await expect(
			instance.auth.api.registerOAuthClient({
				body: {
					redirect_uris: ["https://app.example.com/callback"],
					audiences: ["https://api.example.com/never-seeded"],
				},
			}),
		).rejects.toMatchObject({
			body: expect.objectContaining({ error: "invalid_target" }),
		});
	});

	it("rejects registration when one requested audience is disabled", async () => {
		const instance = await boot({
			allowDynamicClientRegistration: true,
			allowUnauthenticatedClientRegistration: true,
			audiences: ["https://api.example.com/disabled-test"],
		});
		await instance.ctx.adapter.update({
			model: "oauthAudience",
			where: [
				{ field: "identifier", value: "https://api.example.com/disabled-test" },
			],
			update: { disabled: true },
		});
		await expect(
			instance.auth.api.registerOAuthClient({
				body: {
					redirect_uris: ["https://app.example.com/callback"],
					audiences: ["https://api.example.com/disabled-test"],
				},
			}),
		).rejects.toMatchObject({
			body: expect.objectContaining({ error: "invalid_target" }),
		});
	});

	it("registration without audiences still works (no behavior change)", async () => {
		const instance = await boot({
			allowDynamicClientRegistration: true,
			allowUnauthenticatedClientRegistration: true,
		});
		const result = (await instance.auth.api.registerOAuthClient({
			body: {
				redirect_uris: ["https://app.example.com/callback"],
			},
		})) as { client_id: string; audiences?: string[] };
		expect(result.client_id).toBeDefined();
		expect(result.audiences).toBeUndefined();
	});
});

describe("RFC 9728 — protected resource metadata", () => {
	it("returns 404 when publishProtectedResourceMetadata is off", async () => {
		const instance = await boot({
			audiences: ["https://api.example.com/private"],
			// publishProtectedResourceMetadata defaults to false
		});
		await expect(
			instance.auth.api.getProtectedResourceMetadata({
				params: {
					identifier: encodeURIComponent("https://api.example.com/private"),
				},
			}),
		).rejects.toMatchObject({ status: "NOT_FOUND" });
	});

	it("returns metadata projection when publishing is enabled", async () => {
		const id = "https://api.example.com/published";
		const instance = await boot({
			audiences: [id],
			publishProtectedResourceMetadata: true,
		});
		// Set a scope allowlist and signing alg so the projection covers
		// non-trivial fields.
		await instance.ctx.adapter.update({
			model: "oauthAudience",
			where: [{ field: "identifier", value: id }],
			update: {
				allowedScopes: ["read", "write"],
				signingAlgorithm: "EdDSA",
			},
		});
		const meta = (await instance.auth.api.getProtectedResourceMetadata({
			params: { identifier: encodeURIComponent(id) },
		})) as {
			resource: string;
			authorization_servers?: string[];
			bearer_methods_supported?: string[];
			scopes_supported?: string[];
			resource_signing_alg_values_supported?: string[];
		};
		expect(meta.resource).toBe(id);
		expect(meta.authorization_servers?.length).toBeGreaterThan(0);
		expect(meta.bearer_methods_supported).toEqual(["header"]);
		expect(meta.scopes_supported).toEqual(["read", "write"]);
		expect(meta.resource_signing_alg_values_supported).toEqual(["EdDSA"]);
	});

	it("returns 404 for an unknown audience even when publishing is enabled", async () => {
		const instance = await boot({
			audiences: ["https://api.example.com/known"],
			publishProtectedResourceMetadata: true,
		});
		await expect(
			instance.auth.api.getProtectedResourceMetadata({
				params: {
					identifier: encodeURIComponent("https://api.example.com/unknown"),
				},
			}),
		).rejects.toMatchObject({ status: "NOT_FOUND" });
	});

	// Disabled audiences must NOT be advertised via RFC 9728 metadata.
	// A disabled row is no longer a valid resource-server target — the endpoint
	// should 404 with the same error shape as a missing row so external probes
	// can't distinguish "doesn't exist" from "disabled" (no lifecycle leak).
	it("returns 404 for a disabled audience even when publishing is enabled", async () => {
		const id = "https://api.example.com/disabled-publish";
		const instance = await boot({
			audiences: [id],
			publishProtectedResourceMetadata: true,
		});
		await instance.ctx.adapter.update({
			model: "oauthAudience",
			where: [{ field: "identifier", value: id }],
			update: { disabled: true },
		});
		await expect(
			instance.auth.api.getProtectedResourceMetadata({
				params: { identifier: encodeURIComponent(id) },
			}),
		).rejects.toMatchObject({
			status: "NOT_FOUND",
			body: expect.objectContaining({ error: "not_found" }),
		});
	});
});
