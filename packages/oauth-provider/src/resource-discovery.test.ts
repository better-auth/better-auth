import type { AuthContext } from "@better-auth/core";
import { logger } from "@better-auth/core/env";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { oauthProvider } from "./oauth";
import {
	invalidateResourceCache,
	resetSeedStateForTests,
	seedResourcesOnce,
} from "./resources";
import type { OAuthClientResource, OAuthOptions, Scope } from "./types";

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
	invalidateResourceCache();
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
	await seedResourcesOnce(ctx as unknown as AuthContext, opts);
	return { ...instance, ctx, opts };
};

describe("DCR — resources field (RFC 7591 §2 extension)", () => {
	it("registers a client with valid resources and creates link rows", async () => {
		const instance = await boot({
			allowDynamicClientRegistration: true,
			allowUnauthenticatedClientRegistration: true,
			resources: ["https://api.example.com/dcr-link"],
		});

		const result = (await instance.auth.api.registerOAuthClient({
			body: {
				redirect_uris: ["https://app.example.com/callback"],
				resources: ["https://api.example.com/dcr-link"],
			},
		})) as { client_id: string; resources?: string[] };

		expect(result.client_id).toBeDefined();
		expect(result.resources).toEqual(["https://api.example.com/dcr-link"]);

		const links = await instance.ctx.adapter.findMany<OAuthClientResource>({
			model: "oauthClientResource",
			where: [{ field: "clientId", value: result.client_id }],
		});
		expect(links?.length).toBe(1);
		expect(links?.[0]?.resourceId).toBe("https://api.example.com/dcr-link");
	});

	it("rejects registration with an unknown resource", async () => {
		const instance = await boot({
			allowDynamicClientRegistration: true,
			allowUnauthenticatedClientRegistration: true,
			resources: ["https://api.example.com/exists"],
		});
		await expect(
			instance.auth.api.registerOAuthClient({
				body: {
					redirect_uris: ["https://app.example.com/callback"],
					resources: ["https://api.example.com/never-seeded"],
				},
			}),
		).rejects.toMatchObject({
			body: expect.objectContaining({ error: "invalid_target" }),
		});
	});

	it("rejects registration when one requested resource is disabled", async () => {
		const instance = await boot({
			allowDynamicClientRegistration: true,
			allowUnauthenticatedClientRegistration: true,
			resources: ["https://api.example.com/disabled-test"],
		});
		await instance.ctx.adapter.update({
			model: "oauthResource",
			where: [
				{ field: "identifier", value: "https://api.example.com/disabled-test" },
			],
			update: { disabled: true },
		});
		await expect(
			instance.auth.api.registerOAuthClient({
				body: {
					redirect_uris: ["https://app.example.com/callback"],
					resources: ["https://api.example.com/disabled-test"],
				},
			}),
		).rejects.toMatchObject({
			body: expect.objectContaining({ error: "invalid_target" }),
		});
	});

	it("registration without resources still works (no behavior change)", async () => {
		const instance = await boot({
			allowDynamicClientRegistration: true,
			allowUnauthenticatedClientRegistration: true,
		});
		const result = (await instance.auth.api.registerOAuthClient({
			body: {
				redirect_uris: ["https://app.example.com/callback"],
			},
		})) as { client_id: string; resources?: string[] };
		expect(result.client_id).toBeDefined();
		expect(result.resources).toBeUndefined();
	});
});
