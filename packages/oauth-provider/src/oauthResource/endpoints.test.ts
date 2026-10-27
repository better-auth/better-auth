import { logger } from "@better-auth/core/env";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { oauthProvider } from "../oauth";
import * as resourcesModule from "../resources";
import {
	getResource,
	invalidateResourceCache,
	isAudienceClaimAllowed,
	isResourceTombstoned,
} from "../resources";
import type {
	OAuthClientResource,
	OAuthOptions,
	OAuthResource,
	Scope,
} from "../types";
import { storeToken } from "../utils";

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
		...options,
	} as OAuthOptions<Scope[]>;
	const instance = await getTestInstance({
		plugins: [jwt(), oauthProvider(opts)],
	});
	const ctx = await instance.auth.$context;
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

	it.each([
		"https://api.example.com/x#",
		"javascript:alert(1)",
		"data:text/plain,hello",
		"vbscript:msgbox(1)",
	])(
		"rejects a resource identifier disallowed by the shared URI schema: %s",
		async (identifier) => {
			const instance = await boot();
			const headers = await signedInHeaders(instance);
			await expect(
				instance.auth.api.adminCreateOAuthResource({
					body: { identifier },
					headers,
				}),
			).rejects.toMatchObject({
				body: expect.objectContaining({ error: "invalid_target" }),
			});
		},
	);

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

	// Compound uniqueness on (clientId, resourceId) makes concurrent link
	// attempts for the same pair produce exactly one row.
	it("concurrent link attempts for the same pair produce exactly one row", async () => {
		const instance = await boot();
		const headers = await signedInHeaders(instance);
		await seedClient(instance, "race-client");
		await instance.auth.api.adminCreateOAuthResource({
			body: { identifier: "https://api.example.com/race" },
			headers,
		});

		// Fire many parallel link calls. With the compound unique index only
		// one insert wins; the rest catch the UNIQUE conflict and return
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

/**
 * @see https://github.com/better-auth/better-auth/issues/11725
 */
describe("lazy row creation and combined resources", () => {
	it("admin list includes config-only resources alongside database rows", async () => {
		const configId = "https://api.example.com/config-only-list";
		const dbId = "https://api.example.com/db-created-list";
		const instance = await boot({
			resources: [configId],
		});
		const headers = await signedInHeaders(instance);

		// Create a separate resource via admin POST
		await instance.auth.api.adminCreateOAuthResource({
			body: { identifier: dbId, name: "DB Created" },
			headers,
		});

		const listRes = (await instance.auth.api.adminListOAuthResources({
			headers,
		})) as OAuthResource[];

		const identifiers = listRes.map((r) => r.identifier);
		expect(identifiers).toContain(configId);
		expect(identifiers).toContain(dbId);

		// DB table should only have the 1 row created via admin POST
		const rowsInDb = await instance.ctx.adapter.findMany<OAuthResource>({
			model: "oauthResource",
		});
		expect(rowsInDb).toHaveLength(1);
		expect(rowsInDb[0]?.identifier).toBe(dbId);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11725
	 */
	it("admin list returns combined resource values when a database row exists under resourceSeedMode overwrite", async () => {
		const configId = "https://api.example.com/combined-list-resource";
		const instance = await boot({
			resources: [
				{
					identifier: configId,
					name: "Configured Overwrite Name",
					accessTokenTtl: 300,
				},
			],
			resourceSeedMode: "overwrite",
		});
		const headers = await signedInHeaders(instance);

		await instance.ctx.adapter.create({
			model: "oauthResource",
			data: {
				identifier: configId,
				name: "Stale DB Name",
				accessTokenTtl: 9999,
				createdAt: new Date(),
				updatedAt: new Date(),
			} as never,
		});

		const listRes = (await instance.auth.api.adminListOAuthResources({
			headers,
		})) as OAuthResource[];

		const found = listRes.find((r) => r.identifier === configId);
		expect(found).toBeDefined();
		expect(found?.name).toBe("Configured Overwrite Name");
		expect(found?.accessTokenTtl).toBe(300);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11725
	 */
	it("admin GET returns config-only resource, and admin update creates row and applies patch", async () => {
		const configId = "https://api.example.com/config-only-get-update";
		const instance = await boot({
			resources: [{ identifier: configId, accessTokenTtl: 500 }],
		});
		const headers = await signedInHeaders(instance);

		// 1. GET returns config-only resource without creating DB row
		const getRes = (await instance.auth.api.adminGetOAuthResource({
			params: { identifier: encodeURIComponent(configId) },
			headers,
		})) as OAuthResource;
		expect(getRes).toMatchObject({
			identifier: configId,
			accessTokenTtl: 500,
		});

		const rowsBefore = await instance.ctx.adapter.findMany({
			model: "oauthResource",
		});
		expect(rowsBefore).toHaveLength(0);

		// 2. PATCH creates row and applies patch
		const patchRes = (await instance.auth.api.adminUpdateOAuthResource({
			params: { identifier: encodeURIComponent(configId) },
			body: { name: "Updated Name", accessTokenTtl: 600 },
			headers,
		})) as OAuthResource;
		expect(patchRes).toMatchObject({
			identifier: configId,
			name: "Updated Name",
			accessTokenTtl: 600,
		});

		// 3. Second GET returns patched row
		const getRes2 = (await instance.auth.api.adminGetOAuthResource({
			params: { identifier: encodeURIComponent(configId) },
			headers,
		})) as OAuthResource;
		expect(getRes2.name).toBe("Updated Name");
		expect(getRes2.accessTokenTtl).toBe(600);

		const rowsAfter = await instance.ctx.adapter.findMany({
			model: "oauthResource",
		});
		expect(rowsAfter).toHaveLength(1);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11725
	 */
	it("admin update returns combined resource values under resourceSeedMode overwrite and merge", async () => {
		const overwriteId = "https://api.example.com/combined-update-overwrite";
		const overwriteInstance = await boot({
			resources: [
				{
					identifier: overwriteId,
					name: "Configured Overwrite Name",
					accessTokenTtl: 300,
				},
			],
			resourceSeedMode: "overwrite",
		});
		const overwriteHeaders = await signedInHeaders(overwriteInstance);

		const patchRes = (await overwriteInstance.auth.api.adminUpdateOAuthResource(
			{
				params: { identifier: encodeURIComponent(overwriteId) },
				body: { name: "DB Patch Name" },
				headers: overwriteHeaders,
			},
		)) as OAuthResource;

		// Under overwrite mode, configured `name` and `accessTokenTtl` win over DB values
		expect(patchRes.name).toBe("Configured Overwrite Name");
		expect(patchRes.accessTokenTtl).toBe(300);

		// Verify GET returns the exact same representation
		const getRes = (await overwriteInstance.auth.api.adminGetOAuthResource({
			params: { identifier: encodeURIComponent(overwriteId) },
			headers: overwriteHeaders,
		})) as OAuthResource;
		expect(getRes.name).toBe("Configured Overwrite Name");
		expect(getRes.accessTokenTtl).toBe(300);

		const mergeId = "https://api.example.com/combined-update-merge";
		const mergeInstance = await boot({
			resources: [
				{
					identifier: mergeId,
					accessTokenTtl: 400,
				},
			],
			resourceSeedMode: "merge",
		});
		const mergeHeaders = await signedInHeaders(mergeInstance);

		const mergePatchRes =
			(await mergeInstance.auth.api.adminUpdateOAuthResource({
				params: { identifier: encodeURIComponent(mergeId) },
				body: { name: "Merged Admin Name", accessTokenTtl: 999 },
				headers: mergeHeaders,
			})) as OAuthResource;

		// Under merge mode, configured `accessTokenTtl` overlays DB value, but admin's `name` survives
		expect(mergePatchRes.name).toBe("Merged Admin Name");
		expect(mergePatchRes.accessTokenTtl).toBe(400);

		// Verify GET returns the exact same representation
		const mergeGetRes = (await mergeInstance.auth.api.adminGetOAuthResource({
			params: { identifier: encodeURIComponent(mergeId) },
			headers: mergeHeaders,
		})) as OAuthResource;
		expect(mergeGetRes.name).toBe("Merged Admin Name");
		expect(mergeGetRes.accessTokenTtl).toBe(400);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11725
	 */
	it("linking a config-only resource creates resource row and join row idempotently and concurrency-safely", async () => {
		const configId = "https://api.example.com/config-only-link";
		const instance = await boot({
			resources: [configId],
		});
		const headers = await signedInHeaders(instance);

		const client = await instance.auth.api.adminCreateOAuthClient({
			body: {
				client_name: "Link Test Client",
				redirect_uris: ["https://client.example.com/callback"],
			},
			headers,
		});

		// Initially, 0 resource rows in DB
		expect(
			await instance.ctx.adapter.findMany({ model: "oauthResource" }),
		).toHaveLength(0);

		// 1. Link creates resource row + join row
		const linkRes = await instance.auth.api.adminLinkClientResource({
			params: {
				identifier: encodeURIComponent(configId),
				client_id: client.client_id,
			},
			headers,
		});
		expect(linkRes).toEqual({ linked: true });

		// Both rows exist
		expect(
			await instance.ctx.adapter.findMany({
				model: "oauthResource",
				where: [{ field: "identifier", value: configId }],
			}),
		).toHaveLength(1);
		expect(
			await instance.ctx.adapter.findMany({
				model: "oauthClientResource",
				where: [
					{ field: "clientId", value: client.client_id },
					{ field: "resourceId", value: configId },
				],
			}),
		).toHaveLength(1);

		// 2. Repeat link is idempotent
		const repeatLink = await instance.auth.api.adminLinkClientResource({
			params: {
				identifier: encodeURIComponent(configId),
				client_id: client.client_id,
			},
			headers,
		});
		expect(repeatLink).toEqual({ linked: true, alreadyLinked: true });

		// 3. 5 concurrent links produce 1 join row
		const client2 = await instance.auth.api.adminCreateOAuthClient({
			body: {
				client_name: "Link Test Client 2",
				redirect_uris: ["https://client2.example.com/callback"],
			},
			headers,
		});

		const concurrentResults = await Promise.all([
			instance.auth.api.adminLinkClientResource({
				params: {
					identifier: encodeURIComponent(configId),
					client_id: client2.client_id,
				},
				headers,
			}),
			instance.auth.api.adminLinkClientResource({
				params: {
					identifier: encodeURIComponent(configId),
					client_id: client2.client_id,
				},
				headers,
			}),
			instance.auth.api.adminLinkClientResource({
				params: {
					identifier: encodeURIComponent(configId),
					client_id: client2.client_id,
				},
				headers,
			}),
			instance.auth.api.adminLinkClientResource({
				params: {
					identifier: encodeURIComponent(configId),
					client_id: client2.client_id,
				},
				headers,
			}),
			instance.auth.api.adminLinkClientResource({
				params: {
					identifier: encodeURIComponent(configId),
					client_id: client2.client_id,
				},
				headers,
			}),
		]);

		const joinRows = await instance.ctx.adapter.findMany({
			model: "oauthClientResource",
			where: [
				{ field: "clientId", value: client2.client_id },
				{ field: "resourceId", value: configId },
			],
		});
		expect(joinRows).toHaveLength(1);
		expect(
			concurrentResults.filter(
				(r: unknown) =>
					(r as { linked?: boolean; alreadyLinked?: boolean }).alreadyLinked ===
					true,
			).length,
		).toBe(4);
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/11725
 */
describe("durable deletion tombstone for configured and dynamic resources", () => {
	it("deleting a configured resource without a prior DB row creates durable tombstone and suppresses fallback", async () => {
		const configId = "https://api.example.com/tombstone-test-no-row";
		const instance = await boot({
			resources: [{ identifier: configId, name: "Configured Name" }],
		});
		const headers = await signedInHeaders(instance);

		// Before delete: no DB row, getResource returns configured baseline
		const beforeDbRow = await instance.ctx.adapter.findOne<OAuthResource>({
			model: "oauthResource",
			where: [{ field: "identifier", value: configId }],
		});
		expect(beforeDbRow).toBeNull();

		const beforeResource = await getResource(
			{ context: instance.ctx } as never,
			instance.opts,
			configId,
		);
		expect(beforeResource?.identifier).toBe(configId);
		expect(beforeResource?.name).toBe("Configured Name");

		// Delete via admin endpoint
		const deleteRes = await instance.auth.api.adminDeleteOAuthResource({
			params: { identifier: encodeURIComponent(configId) },
			headers,
		});
		expect(deleteRes).toEqual({ deleted: true });

		// DB row must now exist as a tombstone
		const tombstoneRow = await instance.ctx.adapter.findOne<OAuthResource>({
			model: "oauthResource",
			where: [{ field: "identifier", value: configId }],
		});
		expect(tombstoneRow).not.toBeNull();
		expect(isResourceTombstoned(tombstoneRow)).toBe(true);
		expect(tombstoneRow?.disabled).toBe(true);
		expect((tombstoneRow?.metadata as Record<string, unknown>)?.__deleted).toBe(
			true,
		);

		// getResource must return null (NOT fall back to configured baseline)
		const afterResource = await getResource(
			{ context: instance.ctx } as never,
			instance.opts,
			configId,
		);
		expect(afterResource).toBeNull();

		// admin GET returns 404
		await expect(
			instance.auth.api.adminGetOAuthResource({
				params: { identifier: encodeURIComponent(configId) },
				headers,
			}),
		).rejects.toMatchObject({
			body: expect.objectContaining({ error: "not_found" }),
		});

		// Subsequent DELETE returns 404
		await expect(
			instance.auth.api.adminDeleteOAuthResource({
				params: { identifier: encodeURIComponent(configId) },
				headers,
			}),
		).rejects.toMatchObject({
			body: expect.objectContaining({ error: "not_found" }),
		});
	});

	it("deleting a configured resource with an existing DB row updates it to a tombstone and removes client links", async () => {
		const configId = "https://api.example.com/tombstone-test-with-row";
		const instance = await boot({
			resources: [{ identifier: configId, name: "Initial Config Name" }],
		});
		const headers = await signedInHeaders(instance);

		// Create a client and link it to the resource
		const client = await instance.auth.api.adminCreateOAuthClient({
			body: {
				client_name: "Link Client",
				redirect_uris: ["https://client.example.com/cb"],
			},
			headers,
		});

		await instance.auth.api.adminLinkClientResource({
			params: {
				identifier: encodeURIComponent(configId),
				client_id: client.client_id,
			},
			headers,
		});

		// Both oauthResource row and oauthClientResource link row exist
		const existingRow = await instance.ctx.adapter.findOne<OAuthResource>({
			model: "oauthResource",
			where: [{ field: "identifier", value: configId }],
		});
		expect(existingRow).not.toBeNull();
		expect(isResourceTombstoned(existingRow)).toBe(false);

		const linksBefore =
			await instance.ctx.adapter.findMany<OAuthClientResource>({
				model: "oauthClientResource",
				where: [{ field: "resourceId", value: configId }],
			});
		expect(linksBefore?.length).toBe(1);

		// Delete via admin endpoint
		const deleteRes = await instance.auth.api.adminDeleteOAuthResource({
			params: { identifier: encodeURIComponent(configId) },
			headers,
		});
		expect(deleteRes).toEqual({ deleted: true });

		// Row is updated to a tombstone
		const updatedRow = await instance.ctx.adapter.findOne<OAuthResource>({
			model: "oauthResource",
			where: [{ field: "identifier", value: configId }],
		});
		expect(isResourceTombstoned(updatedRow)).toBe(true);
		expect(updatedRow?.disabled).toBe(true);

		// Client links are removed
		const linksAfter = await instance.ctx.adapter.findMany<OAuthClientResource>(
			{
				model: "oauthClientResource",
				where: [{ field: "resourceId", value: configId }],
			},
		);
		expect(linksAfter?.length ?? 0).toBe(0);

		// getResource returns null
		expect(
			await getResource(
				{ context: instance.ctx } as never,
				instance.opts,
				configId,
			),
		).toBeNull();

		// Update on tombstoned resource returns 404
		await expect(
			instance.auth.api.adminUpdateOAuthResource({
				params: { identifier: encodeURIComponent(configId) },
				body: { name: "Should Fail" },
				headers,
			}),
		).rejects.toMatchObject({
			body: expect.objectContaining({ error: "not_found" }),
		});
	});

	it("listResources excludes tombstoned configured and dynamic resources", async () => {
		const configActive = "https://api.example.com/list-active";
		const configDeleted = "https://api.example.com/list-deleted";
		const dynamicDeleted = "https://api.example.com/list-dynamic-deleted";

		const instance = await boot({
			resources: [configActive, configDeleted],
		});
		const headers = await signedInHeaders(instance);

		// Create dynamic resource
		await instance.auth.api.adminCreateOAuthResource({
			body: { identifier: dynamicDeleted, name: "Dynamic" },
			headers,
		});

		// Verify list has all three before deletion
		const listBefore = (await instance.auth.api.adminListOAuthResources({
			headers,
		})) as OAuthResource[];
		const idsBefore = listBefore.map((r) => r.identifier);
		expect(idsBefore).toContain(configActive);
		expect(idsBefore).toContain(configDeleted);
		expect(idsBefore).toContain(dynamicDeleted);

		// Delete configured and dynamic resources
		await instance.auth.api.adminDeleteOAuthResource({
			params: { identifier: encodeURIComponent(configDeleted) },
			headers,
		});
		await instance.auth.api.adminDeleteOAuthResource({
			params: { identifier: encodeURIComponent(dynamicDeleted) },
			headers,
		});

		// List after deletion must only contain the active one
		const listAfter = (await instance.auth.api.adminListOAuthResources({
			headers,
		})) as OAuthResource[];
		const idsAfter = listAfter.map((r) => r.identifier);
		expect(idsAfter).toContain(configActive);
		expect(idsAfter).not.toContain(configDeleted);
		expect(idsAfter).not.toContain(dynamicDeleted);
	});

	it("token introspection returns active: false for tokens with deleted resource audience", async () => {
		const configId = "https://api.example.com/introspect-cascade-revocation";
		const instance = await boot({
			resources: [configId],
			enforcePerClientResources: false,
		});
		const headers = await signedInHeaders(instance);

		const client = await instance.auth.api.adminCreateOAuthClient({
			body: {
				client_name: "Introspect Client",
				redirect_uris: ["https://client.example.com/cb"],
				token_endpoint_auth_method: "client_secret_post",
			},
			headers,
		});

		// Store an active access token with the configured resource audience
		const token = "active-test-access-token-123";
		const hashedToken = await storeToken(
			instance.opts.storeTokens,
			token,
			"access_token",
		);
		await instance.ctx.adapter.create({
			model: "oauthAccessToken",
			data: {
				token: hashedToken,
				clientId: client.client_id,
				scopes: ["openid"],
				resources: [configId],
				expiresAt: new Date(Date.now() + 3600_000),
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});

		// Introspection before delete: active = true
		const introspectBefore = (await instance.auth.api.oauth2Introspect({
			body: {
				token,
				client_id: client.client_id,
				client_secret: client.client_secret,
			},
			headers: new Headers({
				"content-type": "application/x-www-form-urlencoded",
			}),
		})) as { active: boolean };
		expect(introspectBefore.active).toBe(true);

		// isAudienceClaimAllowed before delete: true
		expect(
			await isAudienceClaimAllowed(
				{ context: instance.ctx } as never,
				instance.opts,
				configId,
			),
		).toBe(true);

		// Delete the configured resource
		await instance.auth.api.adminDeleteOAuthResource({
			params: { identifier: encodeURIComponent(configId) },
			headers,
		});

		// isAudienceClaimAllowed after delete: false
		expect(
			await isAudienceClaimAllowed(
				{ context: instance.ctx } as never,
				instance.opts,
				configId,
			),
		).toBe(false);

		// Introspection after delete: cascade revocation -> active = false
		const introspectAfter = (await instance.auth.api.oauth2Introspect({
			body: {
				token,
				client_id: client.client_id,
				client_secret: client.client_secret,
			},
			headers: new Headers({
				"content-type": "application/x-www-form-urlencoded",
			}),
		})) as { active: boolean };
		expect(introspectAfter.active).toBe(false);
	});

	it("recreating a tombstoned resource via createResourceEndpoint succeeds, clears tombstone, and restores active status", async () => {
		const configId = "https://api.example.com/resurrect-me";
		const instance = await boot({
			resources: [{ identifier: configId, name: "Initial Name" }],
			enforcePerClientResources: false,
		});
		const headers = await signedInHeaders(instance);

		const client = await instance.auth.api.adminCreateOAuthClient({
			body: {
				client_name: "Introspect Client 2",
				redirect_uris: ["https://client2.example.com/cb"],
				token_endpoint_auth_method: "client_secret_post",
			},
			headers,
		});

		const token = "resurrect-test-token-456";
		const hashedToken = await storeToken(
			instance.opts.storeTokens,
			token,
			"access_token",
		);
		await instance.ctx.adapter.create({
			model: "oauthAccessToken",
			data: {
				token: hashedToken,
				clientId: client.client_id,
				scopes: ["openid"],
				resources: [configId],
				expiresAt: new Date(Date.now() + 3600_000),
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});

		// Delete the resource
		await instance.auth.api.adminDeleteOAuthResource({
			params: { identifier: encodeURIComponent(configId) },
			headers,
		});

		expect(
			await getResource(
				{ context: instance.ctx } as never,
				instance.opts,
				configId,
			),
		).toBeNull();
		const introspectDeleted = (await instance.auth.api.oauth2Introspect({
			body: {
				token,
				client_id: client.client_id,
				client_secret: client.client_secret,
			},
			headers: new Headers({
				"content-type": "application/x-www-form-urlencoded",
			}),
		})) as { active: boolean };
		expect(introspectDeleted.active).toBe(false);

		// Recreate the resource via admin create
		const resurrected = (await instance.auth.api.adminCreateOAuthResource({
			body: {
				identifier: configId,
				name: "Resurrected Resource",
				accessTokenTtl: 500,
			},
			headers,
		})) as OAuthResource;
		expect(resurrected.identifier).toBe(configId);
		expect(resurrected.name).toBe("Resurrected Resource");

		// DB row must not be tombstoned
		const dbRow = await instance.ctx.adapter.findOne<OAuthResource>({
			model: "oauthResource",
			where: [{ field: "identifier", value: configId }],
		});
		expect(isResourceTombstoned(dbRow)).toBe(false);
		expect(dbRow?.disabled).toBe(false);

		// getResource returns the active resource
		const fetched = await getResource(
			{ context: instance.ctx } as never,
			instance.opts,
			configId,
		);
		expect(fetched).not.toBeNull();
		expect(fetched?.identifier).toBe(configId);
		expect(fetched?.name).toBe("Resurrected Resource");

		// Introspection is active again
		const introspectRestored = (await instance.auth.api.oauth2Introspect({
			body: {
				token,
				client_id: client.client_id,
				client_secret: client.client_secret,
			},
			headers: new Headers({
				"content-type": "application/x-www-form-urlencoded",
			}),
		})) as { active: boolean };
		expect(introspectRestored.active).toBe(true);

		// Subsequent duplicate create now throws conflict/invalid_request
		await expect(
			instance.auth.api.adminCreateOAuthResource({
				body: { identifier: configId },
				headers,
			}),
		).rejects.toMatchObject({
			body: expect.objectContaining({ error: "invalid_request" }),
		});
	});

	it("adminCreateOAuthResource and adminUpdateOAuthResource strip caller-supplied __deleted in metadata", async () => {
		const resourceId = "https://api.example.com/strip-deleted-metadata";
		const instance = await boot({});
		const headers = await signedInHeaders(instance);

		// Create with __deleted: true in metadata
		const created = (await instance.auth.api.adminCreateOAuthResource({
			body: {
				identifier: resourceId,
				name: "Strip Deleted Test",
				metadata: { __deleted: true, customKey: "customValue" },
			},
			headers,
		})) as OAuthResource;

		expect(created.identifier).toBe(resourceId);
		expect(isResourceTombstoned(created)).toBe(false);
		expect(created.disabled).toBe(false);

		const dbRowAfterCreate = await instance.ctx.adapter.findOne<OAuthResource>({
			model: "oauthResource",
			where: [{ field: "identifier", value: resourceId }],
		});
		expect(dbRowAfterCreate).not.toBeNull();
		expect(isResourceTombstoned(dbRowAfterCreate)).toBe(false);
		expect(
			(dbRowAfterCreate?.metadata as Record<string, unknown>)?.__deleted,
		).toBeUndefined();
		expect(
			(dbRowAfterCreate?.metadata as Record<string, unknown>)?.customKey,
		).toBe("customValue");

		// Update with __deleted: true in metadata
		const updated = (await instance.auth.api.adminUpdateOAuthResource({
			params: { identifier: encodeURIComponent(resourceId) },
			body: {
				metadata: { __deleted: true, anotherKey: "anotherValue" },
			},
			headers,
		})) as OAuthResource;

		expect(isResourceTombstoned(updated)).toBe(false);

		const dbRowAfterUpdate = await instance.ctx.adapter.findOne<OAuthResource>({
			model: "oauthResource",
			where: [{ field: "identifier", value: resourceId }],
		});
		expect(dbRowAfterUpdate).not.toBeNull();
		expect(isResourceTombstoned(dbRowAfterUpdate)).toBe(false);
		expect(
			(dbRowAfterUpdate?.metadata as Record<string, unknown>)?.__deleted,
		).toBeUndefined();
		expect(
			(dbRowAfterUpdate?.metadata as Record<string, unknown>)?.anotherKey,
		).toBe("anotherValue");
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11725
	 */
	it("invalidates resource cache on successful delete", async () => {
		const resourceId = "https://api.example.com/cache-invalidate-success";
		const cachedResources = new Set([resourceId]);
		const instance = await boot({
			cachedResources,
		});
		const headers = await signedInHeaders(instance);

		await instance.auth.api.adminCreateOAuthResource({
			body: {
				identifier: resourceId,
				name: "Cache Delete Success Test",
			},
			headers,
		});

		// Read to populate row into cache
		const initial = await getResource(
			{ context: instance.ctx } as never,
			instance.opts,
			resourceId,
		);
		expect(initial?.name).toBe("Cache Delete Success Test");

		const res = await instance.auth.api.adminDeleteOAuthResource({
			params: { identifier: encodeURIComponent(resourceId) },
			headers,
		});
		expect(res).toEqual({ deleted: true });

		// Cache is invalidated after delete succeeds
		const afterDelete = await getResource(
			{ context: instance.ctx } as never,
			instance.opts,
			resourceId,
		);
		expect(afterDelete).toBeNull();
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11725
	 */
	it("PATCH on a tombstoned resource returns 404 and does not un-tombstone", async () => {
		const configId = "https://api.example.com/patch-tombstone-test";
		const instance = await boot({
			resources: [{ identifier: configId, name: "Tombstone Patch Target" }],
		});
		const headers = await signedInHeaders(instance);

		await instance.auth.api.adminDeleteOAuthResource({
			params: { identifier: encodeURIComponent(configId) },
			headers,
		});

		const tombstoneRow = await instance.ctx.adapter.findOne<OAuthResource>({
			model: "oauthResource",
			where: [{ field: "identifier", value: configId }],
		});
		expect(isResourceTombstoned(tombstoneRow)).toBe(true);

		await expect(
			instance.auth.api.adminUpdateOAuthResource({
				params: { identifier: encodeURIComponent(configId) },
				body: { name: "Attempted Resuscitation" },
				headers,
			}),
		).rejects.toMatchObject({
			status: "NOT_FOUND",
			statusCode: 404,
			body: expect.objectContaining({ error: "not_found" }),
		});

		const afterPatchRow = await instance.ctx.adapter.findOne<OAuthResource>({
			model: "oauthResource",
			where: [{ field: "identifier", value: configId }],
		});
		expect(isResourceTombstoned(afterPatchRow)).toBe(true);
		expect(afterPatchRow?.disabled).toBe(true);
		expect(afterPatchRow?.name).not.toBe("Attempted Resuscitation");
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11725
	 */
	it("linking a client to a tombstoned resource fails with 404", async () => {
		const configId = "https://api.example.com/link-tombstone-test";
		const instance = await boot({
			resources: [{ identifier: configId, name: "Tombstone Link Target" }],
			enforcePerClientResources: true,
		});
		const headers = await signedInHeaders(instance);

		const client = await instance.auth.api.adminCreateOAuthClient({
			body: {
				client_name: "Link Client",
				redirect_uris: ["https://client.example.com/cb"],
			},
			headers,
		});

		await instance.auth.api.adminDeleteOAuthResource({
			params: { identifier: encodeURIComponent(configId) },
			headers,
		});

		await expect(
			instance.auth.api.adminLinkClientResource({
				params: {
					identifier: encodeURIComponent(configId),
					client_id: client.client_id,
				},
				headers,
			}),
		).rejects.toMatchObject({
			status: "NOT_FOUND",
			statusCode: 404,
			body: expect.objectContaining({ error: "not_found" }),
		});

		const link = await instance.ctx.adapter.findOne<OAuthClientResource>({
			model: "oauthClientResource",
			where: [
				{ field: "clientId", value: client.client_id },
				{ field: "resourceId", value: configId },
			],
		});
		expect(link).toBeNull();
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11725
	 */
	it("configured resource with __deleted: true in metadata does not create tombstone on first link or PATCH", async () => {
		const configId = "https://api.example.com/config-with-deleted-flag";
		const instance = await boot({
			resources: [
				{
					identifier: configId,
					name: "Config With Deleted Flag",
					metadata: { __deleted: true, keepMe: "yes" },
				},
			],
			enforcePerClientResources: true,
		});
		const headers = await signedInHeaders(instance);

		const client = await instance.auth.api.adminCreateOAuthClient({
			body: {
				client_name: "Link Client",
				redirect_uris: ["https://client.example.com/cb"],
			},
			headers,
		});

		// First link creates the row via ensureResourceRow. Must not 404!
		await expect(
			instance.auth.api.adminLinkClientResource({
				params: {
					identifier: encodeURIComponent(configId),
					client_id: client.client_id,
				},
				headers,
			}),
		).resolves.toMatchObject({ linked: true });

		const row = await instance.ctx.adapter.findOne<OAuthResource>({
			model: "oauthResource",
			where: [{ field: "identifier", value: configId }],
		});
		expect(row).not.toBeNull();
		expect(isResourceTombstoned(row)).toBe(false);
		expect(row?.metadata).toEqual({ keepMe: "yes" });

		// PATCH on row must succeed (not 404)
		const updated = (await instance.auth.api.adminUpdateOAuthResource({
			params: { identifier: encodeURIComponent(configId) },
			body: { name: "Updated Name" },
			headers,
		})) as OAuthResource;
		expect(updated.name).toBe("Updated Name");
		expect(isResourceTombstoned(updated)).toBe(false);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11725
	 */
	it("creating a tombstone row includes allowedScopes: [] by default", async () => {
		const configId = "https://api.example.com/tombstone-default-scopes";
		const instance = await boot({
			resources: [{ identifier: configId, name: "No Scopes Resource" }],
		});
		const headers = await signedInHeaders(instance);

		const beforeDelete = await instance.ctx.adapter.findOne<OAuthResource>({
			model: "oauthResource",
			where: [{ field: "identifier", value: configId }],
		});
		expect(beforeDelete).toBeNull();

		await instance.auth.api.adminDeleteOAuthResource({
			params: { identifier: encodeURIComponent(configId) },
			headers,
		});

		const tombstone = await instance.ctx.adapter.findOne<OAuthResource>({
			model: "oauthResource",
			where: [{ field: "identifier", value: configId }],
		});
		expect(tombstone).not.toBeNull();
		expect(tombstone?.allowedScopes).toEqual([]);
		expect(isResourceTombstoned(tombstone)).toBe(true);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11725
	 */
	it("PATCH handles null metadata safely without throwing TypeError", async () => {
		const resourceId = "https://api.example.com/patch-null-metadata-test";
		const instance = await boot();
		const headers = await signedInHeaders(instance);

		await instance.auth.api.adminCreateOAuthResource({
			body: {
				identifier: resourceId,
				name: "Null Meta Test",
			},
			headers,
		});

		// Directly inject string "null" as metadata in DB
		await instance.ctx.adapter.update<OAuthResource>({
			model: "oauthResource",
			where: [{ field: "identifier", value: resourceId }],
			update: {
				metadata: "null" as never,
			},
		});

		// Update should succeed and not throw TypeError on latestMeta.__deleted
		const updated = await instance.auth.api.adminUpdateOAuthResource({
			params: { identifier: encodeURIComponent(resourceId) },
			body: { name: "Updated Null Meta Name" },
			headers,
		});

		expect(updated.name).toBe("Updated Null Meta Name");
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11725
	 */
	it("PATCH cleanly throws 404 without mutating when row is tombstoned concurrently", async () => {
		const resourceId =
			"https://api.example.com/patch-concurrent-tombstone-test";
		const instance = await boot();
		const headers = await signedInHeaders(instance);

		await instance.auth.api.adminCreateOAuthResource({
			body: {
				identifier: resourceId,
				name: "Concurrent Tombstone Target",
			},
			headers,
		});

		// Simulate concurrent delete right after update: findOne for refreshed returns tombstoned row.
		// Inside updateResourceEndpoint, findOne on ctx.context.adapter is called:
		// 1st: initial `existing` row check
		// 2nd: post-update `refreshed` row check (since `latestRow` uses txAdapter in transaction)
		const origFindOne = instance.ctx.adapter.findOne.bind(instance.ctx.adapter);
		let findOneCount = 0;
		const findOneSpy = vi
			.spyOn(instance.ctx.adapter, "findOne")
			.mockImplementation(async (args: any) => {
				const row = await origFindOne(args);
				if (args.where?.some((w: any) => w.value === resourceId)) {
					findOneCount++;
					// The post-update `refreshed` lookup observes a tombstoned snapshot
					if (findOneCount === 2 && row) {
						return {
							...row,
							disabled: true,
							metadata: { __deleted: true },
						};
					}
				}
				return row;
			});

		await expect(
			instance.auth.api.adminUpdateOAuthResource({
				params: { identifier: encodeURIComponent(resourceId) },
				body: { name: "Attempt While Concurrently Deleted" },
				headers,
			}),
		).rejects.toMatchObject({
			status: "NOT_FOUND",
			statusCode: 404,
		});

		findOneSpy.mockRestore();

		// Verify findOne was invoked twice (initial read + refreshed read)
		expect(findOneCount).toBe(2);

		// Verify the underlying row remains non-tombstoned (an in-flight PATCH must never re-tombstone)
		const currentRow = await instance.ctx.adapter.findOne<OAuthResource>({
			model: "oauthResource",
			where: [{ field: "identifier", value: resourceId }],
		});
		expect(currentRow?.disabled).toBe(false);
		expect(isResourceTombstoned(currentRow)).toBe(false);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11725
	 */
	it("PATCH uses adapter.transaction when available", async () => {
		const resourceId = "https://api.example.com/patch-tx-test";
		const instance = await boot();
		const headers = await signedInHeaders(instance);

		await instance.auth.api.adminCreateOAuthResource({
			body: {
				identifier: resourceId,
				name: "Transaction Test",
			},
			headers,
		});

		let txCalled = false;
		const origTx = instance.ctx.adapter.transaction;
		expect(origTx).toBeTypeOf("function");

		const txSpy = vi
			.spyOn(instance.ctx.adapter, "transaction")
			.mockImplementation(async (cb: any) => {
				txCalled = true;
				return origTx!(cb);
			});

		await instance.auth.api.adminUpdateOAuthResource({
			params: { identifier: encodeURIComponent(resourceId) },
			body: { name: "Updated in Tx" },
			headers,
		});

		expect(txCalled).toBe(true);
		txSpy.mockRestore();
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11725
	 */
	it("delete cleans up client links for dynamic resources", async () => {
		const resourceId = "https://api.example.com/delete-links-dynamic";
		const instance = await boot();
		const headers = await signedInHeaders(instance);

		await instance.auth.api.adminCreateOAuthResource({
			body: { identifier: resourceId, name: "Dynamic Resource" },
			headers,
		});

		const client = await instance.auth.api.adminCreateOAuthClient({
			body: {
				client_name: "Dynamic Client",
				redirect_uris: ["https://client.example.com/cb"],
			},
			headers,
		});

		await instance.auth.api.adminLinkClientResource({
			params: {
				identifier: encodeURIComponent(resourceId),
				client_id: client.client_id,
			},
			headers,
		});

		const linksBefore =
			await instance.ctx.adapter.findMany<OAuthClientResource>({
				model: "oauthClientResource",
				where: [{ field: "resourceId", value: resourceId }],
			});
		expect(linksBefore?.length).toBe(1);

		const deleteRes = await instance.auth.api.adminDeleteOAuthResource({
			params: { identifier: encodeURIComponent(resourceId) },
			headers,
		});
		expect(deleteRes).toEqual({ deleted: true });

		const linksAfter = await instance.ctx.adapter.findMany<OAuthClientResource>(
			{
				model: "oauthClientResource",
				where: [{ field: "resourceId", value: resourceId }],
			},
		);
		expect(linksAfter?.length ?? 0).toBe(0);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11725
	 */
	it("transaction rollback on deleteMany failure prevents tombstoning the resource (allowing retry)", async () => {
		const configId = "https://api.example.com/tx-delete-rollback";
		const instance = await boot({
			resources: [{ identifier: configId, name: "Rollback Test" }],
		});
		const headers = await signedInHeaders(instance);

		const client = await instance.auth.api.adminCreateOAuthClient({
			body: {
				client_name: "Rollback Client",
				redirect_uris: ["https://client.example.com/cb"],
			},
			headers,
		});

		await instance.auth.api.adminLinkClientResource({
			params: {
				identifier: encodeURIComponent(configId),
				client_id: client.client_id,
			},
			headers,
		});

		let shouldFail = true;
		const origTx = instance.ctx.adapter.transaction;
		expect(origTx).toBeTypeOf("function");

		const txSpy = vi
			.spyOn(instance.ctx.adapter, "transaction")
			.mockImplementation(async (cb: any) => {
				return origTx!(async (txAdapter: any) => {
					const origDeleteMany = txAdapter.deleteMany.bind(txAdapter);
					txAdapter.deleteMany = async (args: any) => {
						if (shouldFail && args.model === "oauthClientResource") {
							throw new Error("Simulated link cleanup failure");
						}
						return origDeleteMany(args);
					};
					return cb(txAdapter);
				});
			});

		// First delete attempt fails due to link cleanup failure
		await expect(
			instance.auth.api.adminDeleteOAuthResource({
				params: { identifier: encodeURIComponent(configId) },
				headers,
			}),
		).rejects.toThrow("Simulated link cleanup failure");

		// Resource must NOT be tombstoned after rollback
		const resourceRow = await instance.ctx.adapter.findOne<OAuthResource>({
			model: "oauthResource",
			where: [{ field: "identifier", value: configId }],
		});
		expect(resourceRow).not.toBeNull();
		expect(isResourceTombstoned(resourceRow)).toBe(false);
		expect(resourceRow?.disabled).toBe(false);

		// Client link must still be present
		const linksAfterFail =
			await instance.ctx.adapter.findMany<OAuthClientResource>({
				model: "oauthClientResource",
				where: [{ field: "resourceId", value: configId }],
			});
		expect(linksAfterFail?.length).toBe(1);

		// Now allow deleteMany to succeed and retry the delete
		shouldFail = false;
		const retryRes = await instance.auth.api.adminDeleteOAuthResource({
			params: { identifier: encodeURIComponent(configId) },
			headers,
		});
		expect(retryRes).toEqual({ deleted: true });

		// After successful retry, resource is tombstoned
		const tombstonedRow = await instance.ctx.adapter.findOne<OAuthResource>({
			model: "oauthResource",
			where: [{ field: "identifier", value: configId }],
		});
		expect(tombstonedRow).not.toBeNull();
		expect(isResourceTombstoned(tombstonedRow)).toBe(true);

		// And client link is cleaned up
		const linksAfterSuccess =
			await instance.ctx.adapter.findMany<OAuthClientResource>({
				model: "oauthClientResource",
				where: [{ field: "resourceId", value: configId }],
			});
		expect(linksAfterSuccess?.length ?? 0).toBe(0);

		txSpy.mockRestore();
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11725
	 */
	it("non-transactional delete: deleteMany failure keeps resource non-tombstoned and allows retry", async () => {
		const configId = "https://api.example.com/nontx-delete-retry";
		const instance = await boot({
			resources: [{ identifier: configId, name: "Non-Tx Retry Test" }],
		});
		const headers = await signedInHeaders(instance);

		const client = await instance.auth.api.adminCreateOAuthClient({
			body: {
				client_name: "Non-Tx Client",
				redirect_uris: ["https://client.example.com/cb"],
			},
			headers,
		});

		await instance.auth.api.adminLinkClientResource({
			params: {
				identifier: encodeURIComponent(configId),
				client_id: client.client_id,
			},
			headers,
		});

		// Remove transaction method to simulate non-transactional adapter
		(instance.ctx.adapter as any).transaction = undefined;

		let shouldFail = true;
		const origDeleteMany = instance.ctx.adapter.deleteMany.bind(
			instance.ctx.adapter,
		);
		const deleteManySpy = vi
			.spyOn(instance.ctx.adapter, "deleteMany")
			.mockImplementation(async (args: any) => {
				if (shouldFail && args.model === "oauthClientResource") {
					throw new Error("Simulated non-tx deleteMany failure");
				}
				return origDeleteMany(args);
			});

		// First delete attempt fails
		await expect(
			instance.auth.api.adminDeleteOAuthResource({
				params: { identifier: encodeURIComponent(configId) },
				headers,
			}),
		).rejects.toThrow("Simulated non-tx deleteMany failure");

		// Resource must NOT be tombstoned because deleteMany ran before tombstoning
		const resourceRow = await instance.ctx.adapter.findOne<OAuthResource>({
			model: "oauthResource",
			where: [{ field: "identifier", value: configId }],
		});
		expect(resourceRow).not.toBeNull();
		expect(isResourceTombstoned(resourceRow)).toBe(false);
		expect(resourceRow?.disabled).toBe(false);

		// Client link must still be present
		const linksAfterFail =
			await instance.ctx.adapter.findMany<OAuthClientResource>({
				model: "oauthClientResource",
				where: [{ field: "resourceId", value: configId }],
			});
		expect(linksAfterFail?.length).toBe(1);

		// Retry succeeds
		shouldFail = false;
		const retryRes = await instance.auth.api.adminDeleteOAuthResource({
			params: { identifier: encodeURIComponent(configId) },
			headers,
		});
		expect(retryRes).toEqual({ deleted: true });

		const tombstonedRow = await instance.ctx.adapter.findOne<OAuthResource>({
			model: "oauthResource",
			where: [{ field: "identifier", value: configId }],
		});
		expect(tombstonedRow).not.toBeNull();
		expect(isResourceTombstoned(tombstonedRow)).toBe(true);

		const linksAfterSuccess =
			await instance.ctx.adapter.findMany<OAuthClientResource>({
				model: "oauthClientResource",
				where: [{ field: "resourceId", value: configId }],
			});
		expect(linksAfterSuccess?.length ?? 0).toBe(0);

		deleteManySpy.mockRestore();
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11725
	 */
	it("concurrent deletes on a configured resource with no initial DB row succeed cleanly without error", async () => {
		const configId = "https://api.example.com/concurrent-delete-no-row";
		const instance = await boot({
			resources: [{ identifier: configId, name: "Concurrent Delete Test" }],
		});
		const headers = await signedInHeaders(instance);

		const beforeDbRow = await instance.ctx.adapter.findOne<OAuthResource>({
			model: "oauthResource",
			where: [{ field: "identifier", value: configId }],
		});
		expect(beforeDbRow).toBeNull();

		// Run concurrent deletes simultaneously
		const results = await Promise.allSettled([
			instance.auth.api.adminDeleteOAuthResource({
				params: { identifier: encodeURIComponent(configId) },
				headers,
			}),
			instance.auth.api.adminDeleteOAuthResource({
				params: { identifier: encodeURIComponent(configId) },
				headers,
			}),
			instance.auth.api.adminDeleteOAuthResource({
				params: { identifier: encodeURIComponent(configId) },
				headers,
			}),
		]);

		// At least one delete must succeed
		const succeeded = results.filter(
			(r) => r.status === "fulfilled" && (r.value as any)?.deleted === true,
		);
		expect(succeeded.length).toBeGreaterThanOrEqual(1);

		// Any rejected call must only be a 404 not_found, never an unhandled DB error or aborted transaction
		const rejected = results.filter((r) => r.status === "rejected");
		for (const r of rejected) {
			expect((r as PromiseRejectedResult).reason).toMatchObject({
				body: expect.objectContaining({ error: "not_found" }),
			});
		}

		// Row must now exist as a tombstone
		const tombstoneRow = await instance.ctx.adapter.findOne<OAuthResource>({
			model: "oauthResource",
			where: [{ field: "identifier", value: configId }],
		});
		expect(tombstoneRow).not.toBeNull();
		expect(isResourceTombstoned(tombstoneRow)).toBe(true);
		expect(tombstoneRow?.disabled).toBe(true);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11725
	 */
	it("deleting an unseeded configured resource with omitted allowedScopes writes empty array and succeeds without throwing null list error", async () => {
		const configId = "https://api.example.com/delete-omitted-scopes-prisma";
		const instance = await boot({
			resources: [{ identifier: configId, name: "Omitted Scopes Resource" }],
		});
		const headers = await signedInHeaders(instance);

		const beforeDbRow = await instance.ctx.adapter.findOne<OAuthResource>({
			model: "oauthResource",
			where: [{ field: "identifier", value: configId }],
		});
		expect(beforeDbRow).toBeNull();

		// Simulate Prisma rejecting null for string list columns
		const origCreate = instance.ctx.adapter.create.bind(instance.ctx.adapter);
		const createSpy = vi
			.spyOn(instance.ctx.adapter, "create")
			.mockImplementation(async (args: any) => {
				if (
					args.model === "oauthResource" &&
					args.data?.allowedScopes === null
				) {
					throw new Error(
						"PrismaClientKnownRequestError: Value null is not valid for list column allowedScopes",
					);
				}
				return origCreate(args);
			});

		const res = await instance.auth.api.adminDeleteOAuthResource({
			params: { identifier: encodeURIComponent(configId) },
			headers,
		});
		expect(res).toEqual({ deleted: true });

		const tombstoneRow = await instance.ctx.adapter.findOne<OAuthResource>({
			model: "oauthResource",
			where: [{ field: "identifier", value: configId }],
		});
		expect(tombstoneRow).not.toBeNull();
		expect(isResourceTombstoned(tombstoneRow)).toBe(true);
		expect(tombstoneRow?.allowedScopes).toEqual([]);
		expect(tombstoneRow?.disabled).toBe(true);

		createSpy.mockRestore();
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11725
	 */
	it("row-less configured resource deletion executes link cleanup and tombstone creation atomically within a transaction", async () => {
		const configId = "https://api.example.com/rowless-tx-atomic";
		const instance = await boot({
			resources: [{ identifier: configId, name: "Rowless Tx Atomic" }],
		});
		const headers = await signedInHeaders(instance);

		const beforeDbRow = await instance.ctx.adapter.findOne<OAuthResource>({
			model: "oauthResource",
			where: [{ field: "identifier", value: configId }],
		});
		expect(beforeDbRow).toBeNull();

		const origTx = instance.ctx.adapter.transaction;
		expect(origTx).toBeTypeOf("function");

		const operations: string[] = [];
		const txSpy = vi
			.spyOn(instance.ctx.adapter, "transaction")
			.mockImplementation(async (cb: any) => {
				return origTx!(async (txAdapter: any) => {
					const origDeleteMany = txAdapter.deleteMany.bind(txAdapter);
					const origCreate = txAdapter.create.bind(txAdapter);
					txAdapter.deleteMany = async (args: any) => {
						operations.push(`deleteMany:${args.model}`);
						return origDeleteMany(args);
					};
					txAdapter.create = async (args: any) => {
						operations.push(`create:${args.model}`);
						return origCreate(args);
					};
					return cb(txAdapter);
				});
			});

		const res = await instance.auth.api.adminDeleteOAuthResource({
			params: { identifier: encodeURIComponent(configId) },
			headers,
		});
		expect(res).toEqual({ deleted: true });

		// Both deleteMany on client links and create of tombstone must happen inside the transaction
		expect(operations).toEqual([
			"deleteMany:oauthClientResource",
			"create:oauthResource",
		]);

		const tombstoneRow = await instance.ctx.adapter.findOne<OAuthResource>({
			model: "oauthResource",
			where: [{ field: "identifier", value: configId }],
		});
		expect(tombstoneRow).not.toBeNull();
		expect(isResourceTombstoned(tombstoneRow)).toBe(true);

		txSpy.mockRestore();
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11725
	 */
	it("delete resource uses custom resource model name in withResourceInsertLock key", async () => {
		const configId = "https://api.example.com/custom-model-lock";
		const customModel = "customOAuthResource";
		const instance = await boot({
			schema: { oauthResource: { modelName: customModel } },
			resources: [{ identifier: configId, name: "Custom Model Lock Test" }],
		});
		const headers = await signedInHeaders(instance);

		const lockSpy = vi.spyOn(resourcesModule, "withResourceInsertLock");

		const res = await instance.auth.api.adminDeleteOAuthResource({
			params: { identifier: encodeURIComponent(configId) },
			headers,
		});
		expect(res).toEqual({ deleted: true });

		expect(lockSpy).toHaveBeenCalledWith(
			expect.anything(),
			`${customModel}:${configId}`,
			expect.any(Function),
		);

		lockSpy.mockRestore();
	});
});
