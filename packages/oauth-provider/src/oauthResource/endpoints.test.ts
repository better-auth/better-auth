import type { AuthContext } from "@better-auth/core";
import { logger } from "@better-auth/core/env";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { oauthProvider } from "../oauth";
import {
	invalidateResourceCache,
	resetSeedStateForTests,
	seedResourcesOnce,
} from "../resources";
import type {
	OAuthClientResource,
	OAuthOptions,
	OAuthResource,
	Scope,
} from "../types";

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

const signedInHeaders = async (
	instance: Awaited<ReturnType<typeof boot>>,
): Promise<Headers> => {
	const { headers } = await instance.signInWithTestUser();
	return headers;
};

describe("resource admin CRUD", () => {
	it("create + read round-trips", async () => {
		const instance = await boot();
		const headers = await signedInHeaders(instance);
		const created = await instance.auth.api.adminCreateOAuthResource({
			body: {
				identifier: "https://api.example.com/created",
				name: "Created Resource",
				accessTokenTtl: 300,
			},
			headers,
		});
		expect((created as OAuthResource).identifier).toBe(
			"https://api.example.com/created",
		);

		const fetched = await instance.auth.api.adminGetOAuthResource({
			params: { identifier: "https://api.example.com/created" },
			headers,
		});
		expect((fetched as OAuthResource).name).toBe("Created Resource");
		expect((fetched as OAuthResource).accessTokenTtl).toBe(300);
	});

	it("rejects identifiers that aren't absolute URIs", async () => {
		const instance = await boot();
		const headers = await signedInHeaders(instance);
		await expect(
			instance.auth.api.adminCreateOAuthResource({
				body: { identifier: "not-a-uri" },
				headers,
			}),
		).rejects.toMatchObject({
			body: expect.objectContaining({ error: "invalid_target" }),
		});
	});

	it("rejects identifiers with a fragment", async () => {
		const instance = await boot();
		const headers = await signedInHeaders(instance);
		await expect(
			instance.auth.api.adminCreateOAuthResource({
				body: { identifier: "https://api.example.com/x#fragment" },
				headers,
			}),
		).rejects.toMatchObject({
			body: expect.objectContaining({ error: "invalid_target" }),
		});
	});

	it("rejects duplicate identifiers", async () => {
		const instance = await boot();
		const headers = await signedInHeaders(instance);
		await instance.auth.api.adminCreateOAuthResource({
			body: { identifier: "https://api.example.com/dup" },
			headers,
		});
		await expect(
			instance.auth.api.adminCreateOAuthResource({
				body: { identifier: "https://api.example.com/dup" },
				headers,
			}),
		).rejects.toMatchObject({
			body: expect.objectContaining({ error: "invalid_request" }),
		});
	});

	it("update only touches specified fields", async () => {
		const instance = await boot();
		const headers = await signedInHeaders(instance);
		await instance.auth.api.adminCreateOAuthResource({
			body: {
				identifier: "https://api.example.com/update-me",
				name: "Original",
				accessTokenTtl: 600,
				allowedScopes: ["read"],
			},
			headers,
		});
		// The update endpoint re-fetches after `adapter.update` (which may
		// return null/non-fresh data), so its response body must reflect the
		// persisted row rather than a null body.
		const updated = (await instance.auth.api.adminUpdateOAuthResource({
			params: { identifier: "https://api.example.com/update-me" },
			body: { accessTokenTtl: 60 },
			headers,
		})) as OAuthResource;
		expect(updated).not.toBeNull();
		expect(updated.accessTokenTtl).toBe(60);
		const fetched = (await instance.auth.api.adminGetOAuthResource({
			params: { identifier: "https://api.example.com/update-me" },
			headers,
		})) as OAuthResource;
		expect(fetched.accessTokenTtl).toBe(60);
		expect(fetched.name).toBe("Original"); // untouched
		expect(fetched.allowedScopes).toEqual(["read"]); // untouched
	});

	it("update on a missing identifier returns 404", async () => {
		const instance = await boot();
		const headers = await signedInHeaders(instance);
		await expect(
			instance.auth.api.adminUpdateOAuthResource({
				params: { identifier: "https://api.example.com/missing" },
				body: { accessTokenTtl: 120 },
				headers,
			}),
		).rejects.toMatchObject({
			body: expect.objectContaining({ error: "not_found" }),
		});
	});

	it("delete removes the row and 404s on subsequent reads", async () => {
		const instance = await boot();
		const headers = await signedInHeaders(instance);
		await instance.auth.api.adminCreateOAuthResource({
			body: { identifier: "https://api.example.com/delete-me" },
			headers,
		});
		await instance.auth.api.adminDeleteOAuthResource({
			params: { identifier: "https://api.example.com/delete-me" },
			headers,
		});
		await expect(
			instance.auth.api.adminGetOAuthResource({
				params: { identifier: "https://api.example.com/delete-me" },
				headers,
			}),
		).rejects.toMatchObject({
			body: expect.objectContaining({ error: "not_found" }),
		});
	});

	it("list returns all resources", async () => {
		const instance = await boot();
		const headers = await signedInHeaders(instance);
		await instance.auth.api.adminCreateOAuthResource({
			body: { identifier: "https://api.example.com/a" },
			headers,
		});
		await instance.auth.api.adminCreateOAuthResource({
			body: { identifier: "https://api.example.com/b" },
			headers,
		});
		const list = (await instance.auth.api.adminListOAuthResources({
			headers,
		})) as OAuthResource[];
		const ids = list.map((a) => a.identifier).sort();
		expect(ids).toContain("https://api.example.com/a");
		expect(ids).toContain("https://api.example.com/b");
	});
});

describe("resourcePrivileges gate", () => {
	it("blocks create when resourcePrivileges returns false", async () => {
		const instance = await boot({
			resourcePrivileges: async ({ action }) => action !== "create",
		});
		const headers = await signedInHeaders(instance);
		await expect(
			instance.auth.api.adminCreateOAuthResource({
				body: { identifier: "https://api.example.com/gated" },
				headers,
			}),
		).rejects.toMatchObject({ status: "UNAUTHORIZED" });
	});

	it("allows actions the callback approves", async () => {
		const instance = await boot({
			resourcePrivileges: async ({ action }) =>
				action === "create" || action === "read",
		});
		const headers = await signedInHeaders(instance);
		await instance.auth.api.adminCreateOAuthResource({
			body: { identifier: "https://api.example.com/approved" },
			headers,
		});
		await expect(
			instance.auth.api.adminGetOAuthResource({
				params: { identifier: "https://api.example.com/approved" },
				headers,
			}),
		).resolves.toBeDefined();
	});

	it("blocks list independently of read", async () => {
		const instance = await boot({
			resourcePrivileges: async ({ action }) => action !== "list",
		});
		const headers = await signedInHeaders(instance);
		await expect(
			instance.auth.api.adminListOAuthResources({ headers }),
		).rejects.toMatchObject({ status: "UNAUTHORIZED" });
	});
});

describe("client/resource linking", () => {
	const seedClient = async (
		instance: Awaited<ReturnType<typeof boot>>,
		clientId: string,
	) => {
		await instance.ctx.adapter.create({
			model: instance.opts.schema?.oauthClient?.modelName ?? "oauthClient",
			data: {
				clientId,
				redirectUris: ["https://example.com/callback"],
				createdAt: new Date(),
				updatedAt: new Date(),
			} as never,
		});
	};

	it("link creates the join row and unlink removes it", async () => {
		const instance = await boot();
		const headers = await signedInHeaders(instance);
		await seedClient(instance, "test-client");
		await instance.auth.api.adminCreateOAuthResource({
			body: { identifier: "https://api.example.com/linked" },
			headers,
		});

		await instance.auth.api.adminLinkClientResource({
			params: {
				identifier: "https://api.example.com/linked",
				client_id: "test-client",
			},
			headers,
		});
		const links = await instance.ctx.adapter.findMany<OAuthClientResource>({
			model: "oauthClientResource",
			where: [{ field: "clientId", value: "test-client" }],
		});
		expect(links?.length).toBe(1);
		expect(links?.[0]?.resourceId).toBe("https://api.example.com/linked");

		await instance.auth.api.adminUnlinkClientResource({
			params: {
				identifier: "https://api.example.com/linked",
				client_id: "test-client",
			},
			headers,
		});
		const afterUnlink =
			await instance.ctx.adapter.findMany<OAuthClientResource>({
				model: "oauthClientResource",
				where: [{ field: "clientId", value: "test-client" }],
			});
		expect(afterUnlink?.length ?? 0).toBe(0);
	});

	it("link is idempotent on repeat calls", async () => {
		const instance = await boot();
		const headers = await signedInHeaders(instance);
		await seedClient(instance, "idempotent-client");
		await instance.auth.api.adminCreateOAuthResource({
			body: { identifier: "https://api.example.com/idempotent" },
			headers,
		});
		await instance.auth.api.adminLinkClientResource({
			params: {
				identifier: "https://api.example.com/idempotent",
				client_id: "idempotent-client",
			},
			headers,
		});
		const second = await instance.auth.api.adminLinkClientResource({
			params: {
				identifier: "https://api.example.com/idempotent",
				client_id: "idempotent-client",
			},
			headers,
		});
		expect((second as { alreadyLinked?: boolean }).alreadyLinked).toBe(true);
	});

	it("link rejects an unknown resource", async () => {
		const instance = await boot();
		const headers = await signedInHeaders(instance);
		await seedClient(instance, "client-x");
		await expect(
			instance.auth.api.adminLinkClientResource({
				params: {
					identifier: "https://api.example.com/nope",
					client_id: "client-x",
				},
				headers,
			}),
		).rejects.toMatchObject({
			body: expect.objectContaining({ error: "not_found" }),
		});
	});

	it("link rejects an unknown client", async () => {
		const instance = await boot();
		const headers = await signedInHeaders(instance);
		await instance.auth.api.adminCreateOAuthResource({
			body: { identifier: "https://api.example.com/orphan" },
			headers,
		});
		await expect(
			instance.auth.api.adminLinkClientResource({
				params: {
					identifier: "https://api.example.com/orphan",
					client_id: "no-such-client",
				},
				headers,
			}),
		).rejects.toMatchObject({
			body: expect.objectContaining({ error: "not_found" }),
		});
	});

	// Composite uniqueness on (clientId, resourceId).
	//
	// The schema layer can't declare `UNIQUE(clientId, resourceId)` directly;
	// the row's `id` is a deterministic `${clientId}::${resourceId}` so the
	// PK uniqueness constraint enforces composite uniqueness. Two concurrent
	// link attempts for the same pair MUST result in exactly one row.
	it("concurrent link attempts for the same pair produce exactly one row", async () => {
		const instance = await boot();
		const headers = await signedInHeaders(instance);
		await seedClient(instance, "race-client");
		await instance.auth.api.adminCreateOAuthResource({
			body: { identifier: "https://api.example.com/race" },
			headers,
		});

		// Fire many parallel link calls. With the deterministic-id strategy
		// only one insert wins; the rest catch the UNIQUE conflict and return
		// `alreadyLinked: true`.
		const results = await Promise.all(
			Array.from({ length: 5 }).map(() =>
				instance.auth.api.adminLinkClientResource({
					params: {
						identifier: "https://api.example.com/race",
						client_id: "race-client",
					},
					headers,
				}),
			),
		);
		// At least one should have succeeded as "first" link, and all calls
		// must have returned a non-error response.
		expect(results.length).toBe(5);

		const links = await instance.ctx.adapter.findMany<OAuthClientResource>({
			model: "oauthClientResource",
			where: [{ field: "clientId", value: "race-client" }],
		});
		expect(links?.length).toBe(1);
		expect(links?.[0]?.resourceId).toBe("https://api.example.com/race");
	});

	// The link endpoint's client lookup must resolve through the configured
	// `schema.oauthClient.modelName` (like the shared `getClient` helper and the
	// resource/link model helpers) rather than assuming a fixed model name, so a
	// deployment that remaps the client model can still link resources.
	it("link resolves the client through a custom oauthClient model name", async () => {
		const instance = await boot({
			schema: { oauthClient: { modelName: "customOauthClient" } },
		});
		const headers = await signedInHeaders(instance);
		await seedClient(instance, "remapped-client");
		await instance.auth.api.adminCreateOAuthResource({
			body: { identifier: "https://api.example.com/remapped" },
			headers,
		});

		await instance.auth.api.adminLinkClientResource({
			params: {
				identifier: "https://api.example.com/remapped",
				client_id: "remapped-client",
			},
			headers,
		});

		const links = await instance.ctx.adapter.findMany<OAuthClientResource>({
			model: "oauthClientResource",
			where: [{ field: "clientId", value: "remapped-client" }],
		});
		expect(links?.length).toBe(1);
		expect(links?.[0]?.resourceId).toBe("https://api.example.com/remapped");
	});
});

describe("resource admin CRUD — signingAlgorithm validation (bug #10)", () => {
	it("rejects bad signingAlgorithm at create time, not at sign time", async () => {
		const instance = await boot();
		const headers = await signedInHeaders(instance);
		await expect(
			instance.auth.api.adminCreateOAuthResource({
				body: {
					identifier: "https://api.example.com/bad-alg",
					// HS256 is symmetric and not a supported JWS asymmetric alg
					// for the JWT plugin — must be rejected at admin-CRUD time
					// before the row is persisted.
					signingAlgorithm: "HS256",
				} as never,
				headers,
			}),
		).rejects.toBeDefined();
	});

	it("rejects unknown signingAlgorithm at create time", async () => {
		const instance = await boot();
		const headers = await signedInHeaders(instance);
		await expect(
			instance.auth.api.adminCreateOAuthResource({
				body: {
					identifier: "https://api.example.com/bogus-alg",
					signingAlgorithm: "not-an-alg",
				} as never,
				headers,
			}),
		).rejects.toBeDefined();
	});

	it("accepts every supported JWS asymmetric algorithm", async () => {
		const instance = await boot();
		const headers = await signedInHeaders(instance);
		const algs = ["EdDSA", "ES256", "ES512", "PS256", "RS256"] as const;
		for (const alg of algs) {
			const id = `https://api.example.com/alg-${alg.toLowerCase()}`;
			await expect(
				instance.auth.api.adminCreateOAuthResource({
					body: { identifier: id, signingAlgorithm: alg },
					headers,
				}),
			).resolves.toBeDefined();
		}
	});

	it("rejects bad signingAlgorithm at update time too", async () => {
		const instance = await boot();
		const headers = await signedInHeaders(instance);
		await instance.auth.api.adminCreateOAuthResource({
			body: { identifier: "https://api.example.com/upd-alg" },
			headers,
		});
		await expect(
			instance.auth.api.adminUpdateOAuthResource({
				params: { identifier: "https://api.example.com/upd-alg" },
				body: { signingAlgorithm: "HS256" } as never,
				headers,
			}),
		).rejects.toBeDefined();
	});
});

describe("path-param decoding for URI-valued identifiers", () => {
	// better-call 1.3.5 does NOT decode URL path params (tryDecode is only
	// wired into cookie parsing). Even though the admin endpoints are
	// SERVER_ONLY today, callers that wrap them (for example a hand-rolled
	// HTTP exposure that forwards raw URL segments, or a UI router that
	// pre-encodes) should not lose rows just because the identifier traveled
	// through a percent-encoded path. We drive auth.api.* with explicitly
	// encoded params to exercise the handler-side decode without depending
	// on the HTTP router.

	const raw = "https://api.example.com/path-decode";

	it("read endpoint decodes a percent-encoded URI identifier", async () => {
		const instance = await boot();
		const headers = await signedInHeaders(instance);
		await instance.auth.api.adminCreateOAuthResource({
			body: { identifier: raw, name: "Path Decode" },
			headers,
		});

		const fetched = (await instance.auth.api.adminGetOAuthResource({
			params: { identifier: encodeURIComponent(raw) },
			headers,
		})) as OAuthResource;
		expect(fetched.identifier).toBe(raw);
		expect(fetched.name).toBe("Path Decode");
	});

	it("update endpoint decodes a percent-encoded URI identifier", async () => {
		const instance = await boot();
		const headers = await signedInHeaders(instance);
		await instance.auth.api.adminCreateOAuthResource({
			body: { identifier: raw, accessTokenTtl: 600 },
			headers,
		});

		await instance.auth.api.adminUpdateOAuthResource({
			params: { identifier: encodeURIComponent(raw) },
			body: { accessTokenTtl: 90 },
			headers,
		});

		const fetched = (await instance.auth.api.adminGetOAuthResource({
			params: { identifier: raw },
			headers,
		})) as OAuthResource;
		expect(fetched.accessTokenTtl).toBe(90);
	});

	it("delete endpoint decodes a percent-encoded URI identifier", async () => {
		const instance = await boot();
		const headers = await signedInHeaders(instance);
		await instance.auth.api.adminCreateOAuthResource({
			body: { identifier: raw },
			headers,
		});

		await instance.auth.api.adminDeleteOAuthResource({
			params: { identifier: encodeURIComponent(raw) },
			headers,
		});

		await expect(
			instance.auth.api.adminGetOAuthResource({
				params: { identifier: raw },
				headers,
			}),
		).rejects.toMatchObject({
			body: expect.objectContaining({ error: "not_found" }),
		});
	});

	it("link / unlink endpoints decode both percent-encoded path segments", async () => {
		const instance = await boot();
		const headers = await signedInHeaders(instance);
		await instance.auth.api.adminCreateOAuthResource({
			body: { identifier: raw },
			headers,
		});
		const client = (await instance.auth.api.adminCreateOAuthClient({
			body: { redirect_uris: ["https://app.example.com/cb"] },
			headers,
		})) as { client_id: string };

		await instance.auth.api.adminLinkClientResource({
			params: {
				identifier: encodeURIComponent(raw),
				client_id: encodeURIComponent(client.client_id),
			},
			headers,
		});

		const ctx = await instance.auth.$context;
		const after = await ctx.adapter.findMany<OAuthClientResource>({
			model: "oauthClientResource",
			where: [{ field: "resourceId", value: raw }],
		});
		expect(after.length).toBe(1);
		expect(after[0]?.clientId).toBe(client.client_id);

		await instance.auth.api.adminUnlinkClientResource({
			params: {
				identifier: encodeURIComponent(raw),
				client_id: encodeURIComponent(client.client_id),
			},
			headers,
		});

		const afterUnlink = await ctx.adapter.findMany<OAuthClientResource>({
			model: "oauthClientResource",
			where: [{ field: "resourceId", value: raw }],
		});
		expect(afterUnlink.length).toBe(0);
	});

	it("falls back to raw identifier when decodeURIComponent throws (malformed escape)", async () => {
		// A malformed percent-escape (single %25 → %, %ZZ → URIError) should
		// not 500. The handler swallows the URIError and treats the input
		// as-is; the row lookup then returns NOT_FOUND. This pins the
		// fallback so the next refactor doesn't accidentally rethrow.
		const instance = await boot();
		const headers = await signedInHeaders(instance);
		await expect(
			instance.auth.api.adminGetOAuthResource({
				params: { identifier: "%ZZ-not-valid" },
				headers,
			}),
		).rejects.toMatchObject({
			body: expect.objectContaining({ error: "not_found" }),
		});
	});
});
