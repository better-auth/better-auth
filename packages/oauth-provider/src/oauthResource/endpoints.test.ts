import { logger } from "@better-auth/core/env";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { oauthProvider } from "../oauth";
import { ensureResourceRow, invalidateResourceCache } from "../resources";
import type {
	OAuthClientResource,
	OAuthOptions,
	OAuthResource,
	Scope,
} from "../types";

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

	it("list returns configured resources without DB rows and combines with existing rows", async () => {
		const configuredId = "https://api.example.com/configured-only";
		const mergedId = "https://api.example.com/merged";
		const instance = await boot({
			resources: [
				configuredId,
				{ identifier: mergedId, name: "Configured Name", accessTokenTtl: 300 },
			],
			resourceSeedMode: "merge",
		});
		const headers = await signedInHeaders(instance);

		await instance.ctx.adapter.create({
			model: "oauthResource",
			data: {
				identifier: mergedId,
				name: "DB Name",
				accessTokenTtl: 600,
				createdAt: new Date(),
				updatedAt: new Date(),
			} as never,
		});

		const list = (await instance.auth.api.adminListOAuthResources({
			headers,
		})) as OAuthResource[];
		expect(list).toHaveLength(2);
		const ids = list.map((r) => r.identifier);
		expect(new Set(ids).size).toBe(2);
		expect(ids).toContain(configuredId);
		expect(ids).toContain(mergedId);

		const merged = list.find((r) => r.identifier === mergedId);
		expect(merged?.accessTokenTtl).toBe(300);
		expect(merged?.name).toBe("Configured Name");

		const configuredOnly = list.find((r) => r.identifier === configuredId);
		expect(configuredOnly?.identifier).toBe(configuredId);
	});

	it("list honors default insertOnly mode by preserving DB row properties", async () => {
		const configuredId = "https://api.example.com/configured-default";
		const existingId = "https://api.example.com/existing-default";
		const instance = await boot({
			resources: [
				configuredId,
				{
					identifier: existingId,
					name: "Configured Name",
					accessTokenTtl: 300,
				},
			],
		});
		const headers = await signedInHeaders(instance);

		await instance.ctx.adapter.create({
			model: "oauthResource",
			data: {
				identifier: existingId,
				name: "DB Name",
				accessTokenTtl: 600,
				createdAt: new Date(),
				updatedAt: new Date(),
			} as never,
		});

		const list = (await instance.auth.api.adminListOAuthResources({
			headers,
		})) as OAuthResource[];
		expect(list).toHaveLength(2);
		const ids = list.map((r) => r.identifier);
		expect(new Set(ids).size).toBe(2);
		expect(ids).toContain(configuredId);
		expect(ids).toContain(existingId);

		const existing = list.find((r) => r.identifier === existingId);
		expect(existing?.name).toBe("DB Name");
		expect(existing?.accessTokenTtl).toBe(600);

		const configuredOnly = list.find((r) => r.identifier === configuredId);
		expect(configuredOnly?.identifier).toBe(configuredId);
	});

	it("skips invalid configured resource identifier", async () => {
		const validIdentifier = "https://api.example.com/valid";
		const invalidIdentifier = "not-a-valid-uri";
		const instance = await boot({
			resources: [validIdentifier, invalidIdentifier],
		});
		const headers = await signedInHeaders(instance);

		const list = (await instance.auth.api.adminListOAuthResources({
			headers,
		})) as OAuthResource[];

		expect(list.some((r) => r.identifier === validIdentifier)).toBe(true);
		expect(list.some((r) => r.identifier === invalidIdentifier)).toBe(false);
	});

	it("read returns configured resource when no DB row exists yet", async () => {
		const identifier = "https://api.example.com/configured-get";
		const instance = await boot({
			resources: [{ identifier, name: "Lazy Get", accessTokenTtl: 120 }],
		});
		const headers = await signedInHeaders(instance);
		const resource = (await instance.auth.api.adminGetOAuthResource({
			params: { identifier },
			headers,
		})) as OAuthResource;
		expect(resource.identifier).toBe(identifier);
		expect(resource.name).toBe("Lazy Get");
		expect(resource.accessTokenTtl).toBe(120);

		const dbRow = await instance.ctx.adapter.findOne({
			model: "oauthResource",
			where: [{ field: "identifier", value: identifier }],
		});
		expect(dbRow).toBeNull();
	});

	it("update lazily creates DB row for configured resource", async () => {
		const identifier = "https://api.example.com/lazy-update";
		const instance = await boot({
			resources: [{ identifier, name: "Initial Config", accessTokenTtl: 120 }],
		});
		const headers = await signedInHeaders(instance);

		const dbBefore = await instance.ctx.adapter.findOne({
			model: "oauthResource",
			where: [{ field: "identifier", value: identifier }],
		});
		expect(dbBefore).toBeNull();

		const updated = (await instance.auth.api.adminUpdateOAuthResource({
			params: { identifier },
			body: { accessTokenTtl: 500 },
			headers,
		})) as OAuthResource;
		expect(updated.accessTokenTtl).toBe(500);

		const dbAfter = await instance.ctx.adapter.findOne<OAuthResource>({
			model: "oauthResource",
			where: [{ field: "identifier", value: identifier }],
		});
		expect(dbAfter).not.toBeNull();
		expect(dbAfter?.accessTokenTtl).toBe(500);
		expect(dbAfter?.name).toBe("Initial Config");
	});

	it("delete rejects code-configured resource even when DB row exists from prior update", async () => {
		const identifier = "https://api.example.com/configured-with-row";
		const instance = await boot({
			resources: [identifier],
		});
		const headers = await signedInHeaders(instance);

		await instance.auth.api.adminUpdateOAuthResource({
			params: { identifier },
			body: { accessTokenTtl: 300 },
			headers,
		});

		await expect(
			instance.auth.api.adminDeleteOAuthResource({
				params: { identifier },
				headers,
			}),
		).rejects.toMatchObject({
			body: expect.objectContaining({
				error: "invalid_request",
				error_description: `cannot delete code-configured resource ${identifier}`,
			}),
		});

		const dbAfter = await instance.ctx.adapter.findOne({
			model: "oauthResource",
			where: [{ field: "identifier", value: identifier }],
		});
		expect(dbAfter).not.toBeNull();
	});

	it("create rejects identifier that is already declared in code-configured resources", async () => {
		const identifier = "https://api.example.com/already-configured";
		const instance = await boot({
			resources: [identifier],
		});
		const headers = await signedInHeaders(instance);

		await expect(
			instance.auth.api.adminCreateOAuthResource({
				body: { identifier },
				headers,
			}),
		).rejects.toMatchObject({
			body: expect.objectContaining({
				error: "invalid_request",
				error_description: `resource ${identifier} already exists`,
			}),
		});
	});

	it("update returns combined resource matching getResource response", async () => {
		const identifier = "https://api.example.com/combined-update";
		const instance = await boot({
			resources: [
				{
					identifier,
					name: "Configured Static Name",
					accessTokenTtl: 120,
				},
			],
			resourceSeedMode: "merge",
		});
		const headers = await signedInHeaders(instance);

		const updated = (await instance.auth.api.adminUpdateOAuthResource({
			params: { identifier },
			body: { name: "DB Dynamic Name", refreshTokenTtl: 3600 },
			headers,
		})) as OAuthResource;

		const fetched = (await instance.auth.api.adminGetOAuthResource({
			params: { identifier },
			headers,
		})) as OAuthResource;

		expect(updated).toEqual(fetched);
		expect(updated.name).toBe("Configured Static Name");
		expect(updated.refreshTokenTtl).toBe(3600);
	});

	it("delete removes DB row and associated client links", async () => {
		const instance = await boot();
		const headers = await signedInHeaders(instance);
		const identifier = "https://api.example.com/delete-with-links";
		await instance.auth.api.adminCreateOAuthResource({
			body: { identifier },
			headers,
		});
		await seedClient(instance, "linked-client");
		await instance.auth.api.adminLinkClientResource({
			params: { identifier, client_id: "linked-client" },
			headers,
		});
		const linksBefore = await instance.ctx.adapter.findMany({
			model: "oauthClientResource",
			where: [{ field: "resourceId", value: identifier }],
		});
		expect(linksBefore.length).toBe(1);

		await instance.auth.api.adminDeleteOAuthResource({
			params: { identifier },
			headers,
		});
		const linksAfter = await instance.ctx.adapter.findMany({
			model: "oauthClientResource",
			where: [{ field: "resourceId", value: identifier }],
		});
		expect(linksAfter.length).toBe(0);
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

	it("link lazily creates DB row for code-configured resource", async () => {
		const identifier = "https://api.example.com/lazy-link";
		const instance = await boot({
			resources: [identifier],
		});
		const headers = await signedInHeaders(instance);
		await seedClient(instance, "lazy-client");

		const dbBefore = await instance.ctx.adapter.findOne({
			model: "oauthResource",
			where: [{ field: "identifier", value: identifier }],
		});
		expect(dbBefore).toBeNull();

		await instance.auth.api.adminLinkClientResource({
			params: { identifier, client_id: "lazy-client" },
			headers,
		});

		const dbAfter = await instance.ctx.adapter.findOne<OAuthResource>({
			model: "oauthResource",
			where: [{ field: "identifier", value: identifier }],
		});
		expect(dbAfter).not.toBeNull();
		expect(dbAfter?.identifier).toBe(identifier);

		const link = await instance.ctx.adapter.findOne<OAuthClientResource>({
			model: "oauthClientResource",
			where: [
				{ field: "clientId", value: "lazy-client" },
				{ field: "resourceId", value: identifier },
			],
		});
		expect(link).not.toBeNull();
		expect(link?.resourceId).toBe(identifier);
		expect(link?.clientId).toBe("lazy-client");
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

	it("unknown client 404 does not create resource row in linkClientResourceEndpoint", async () => {
		const identifier = "https://api.example.com/lazy-no-client";
		const instance = await boot({
			resources: [identifier],
		});
		const headers = await signedInHeaders(instance);

		await expect(
			instance.auth.api.adminLinkClientResource({
				params: {
					identifier,
					client_id: "nonexistent-client",
				},
				headers,
			}),
		).rejects.toMatchObject({
			body: expect.objectContaining({ error: "not_found" }),
		});

		const dbRow = await instance.ctx.adapter.findOne({
			model: "oauthResource",
			where: [{ field: "identifier", value: identifier }],
		});
		expect(dbRow).toBeNull();
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

describe("resource admin list consistency", () => {
	it("excludes configured rows rejected by the async identifierValidator", async () => {
		const allowed = "https://api.example.com/list-allowed";
		const blocked = "https://api.example.com/list-blocked";
		const instance = await boot({
			resources: [allowed, blocked],
			identifierValidator: async (identifier: string) => identifier !== blocked,
		});
		const headers = await signedInHeaders(instance);
		await instance.ctx.adapter.create({
			model: "oauthResource",
			data: {
				identifier: blocked,
				name: "Blocked",
				createdAt: new Date(),
				updatedAt: new Date(),
			} as never,
		});

		const list = (await instance.auth.api.adminListOAuthResources({
			headers,
		})) as OAuthResource[];
		const ids = list.map((r) => r.identifier);
		expect(ids).toContain(allowed);
		expect(ids).not.toContain(blocked);
	});

	it("lists the configured fallback after a lazily persisted row is deleted", async () => {
		const identifier = "https://api.example.com/list-tombstoned";
		const instance = await boot({ resources: [identifier] });
		const headers = await signedInHeaders(instance);
		const ensured = await ensureResourceRow(
			{ context: instance.ctx } as never,
			instance.opts,
			identifier,
		);
		expect(ensured).not.toBeNull();
		await instance.ctx.adapter.delete({
			model: "oauthResource",
			where: [{ field: "identifier", value: identifier }],
		});

		// No tombstone suppression: with no DB row, the admin list serves the
		// in-memory configured resource instead of hiding the identifier.
		const list = (await instance.auth.api.adminListOAuthResources({
			headers,
		})) as OAuthResource[];
		expect(list.map((r) => r.identifier)).toContain(identifier);
		expect(list.find((r) => r.identifier === identifier)).toMatchObject({
			identifier,
			name: identifier,
		});
	});
});
