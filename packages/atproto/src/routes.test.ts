import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoist the NodeOAuthClient mock so it's in place before any imports
// that depend on it.
const oauthMocks = vi.hoisted(() => ({
	authorize: vi.fn(),
	callback: vi.fn(),
	restore: vi.fn(),
	clientMetadata: {
		client_id: "test-client",
		client_name: "Better Auth",
		redirect_uris: ["http://127.0.0.1:3000/api/auth/atproto/callback"],
		grant_types: ["authorization_code", "refresh_token"],
		scope: "atproto transition:generic",
		response_types: ["code"],
		application_type: "web",
		token_endpoint_auth_method: "none",
		dpop_bound_access_tokens: true,
	},
	jwks: { keys: [] },
}));

vi.mock("@atproto/oauth-client-node", () => ({
	NodeOAuthClient: vi.fn().mockImplementation(function () {
		return {
			authorize: oauthMocks.authorize,
			callback: oauthMocks.callback,
			restore: oauthMocks.restore,
			clientMetadata: oauthMocks.clientMetadata,
			jwks: oauthMocks.jwks,
		};
	}),
}));

vi.mock("@atproto/jwk-jose", () => ({
	JoseKey: {
		fromImportable: vi.fn().mockResolvedValue({
			kid: "atproto-key",
			privateJwk: {},
			publicJwk: {},
		}),
	},
}));

vi.mock("@atproto/api", () => ({
	Agent: vi.fn(),
}));

import { getTestInstance } from "better-auth/test";
import { atprotoClient } from "./client";
import { atproto } from "./index";

describe("atproto plugin — structure", () => {
	it("exposes id and version", () => {
		const plugin = atproto();
		expect(plugin.id).toBe("atproto");
		expect(typeof plugin.version).toBe("string");
	});

	it("registers user schema extensions and atproto tables", () => {
		const plugin = atproto();
		expect(plugin.schema?.user?.fields.atprotoDid).toBeDefined();
		expect(plugin.schema?.user?.fields.atprotoHandle).toBeDefined();
		expect(plugin.schema?.user?.fields.atprotoBio).toBeDefined();
		expect(plugin.schema?.user?.fields.atprotoBanner).toBeDefined();
		expect(plugin.schema?.atprotoState).toBeDefined();
		expect(plugin.schema?.atprotoSession).toBeDefined();
	});

	it("atprotoDid is unique on user", () => {
		const plugin = atproto();
		const field = plugin.schema?.user?.fields.atprotoDid as {
			unique?: boolean;
		};
		expect(field.unique).toBe(true);
	});

	it("atprotoSession.userId cascades on user delete", () => {
		const plugin = atproto();
		const field = plugin.schema?.atprotoSession?.fields.userId as {
			references?: { model: string; field: string; onDelete: string };
		};
		expect(field.references).toEqual({
			model: "user",
			field: "id",
			onDelete: "cascade",
		});
	});

	it("rate-limits sign-in (5/60s) and callback (10/60s) but not metadata", () => {
		const plugin = atproto();
		const rules = plugin.rateLimit ?? [];
		const signIn = rules.find((r) => r.pathMatcher("/atproto/sign-in"));
		const callback = rules.find((r) => r.pathMatcher("/atproto/callback"));
		expect(signIn).toMatchObject({ window: 60, max: 5 });
		expect(callback).toMatchObject({ window: 60, max: 10 });
		expect(
			rules.some((r) => r.pathMatcher("/atproto/client-metadata.json")),
		).toBe(false);
		expect(rules.some((r) => r.pathMatcher("/atproto/jwks.json"))).toBe(false);
	});
});

describe("atproto plugin — init validation", () => {
	const makeCtx = (overrides: Record<string, unknown> = {}) =>
		({
			options: {
				baseURL: "http://127.0.0.1:3000",
				basePath: "/api/auth",
				...overrides,
			},
			adapter: {
				findOne: vi.fn().mockResolvedValue(null),
				create: vi.fn().mockResolvedValue({ id: "1" }),
				update: vi.fn().mockResolvedValue({}),
				delete: vi.fn().mockResolvedValue({}),
				deleteMany: vi.fn().mockResolvedValue({}),
			},
		}) as unknown as Parameters<
			NonNullable<ReturnType<typeof atproto>["init"]>
		>[0];

	it("throws when baseURL is missing", async () => {
		const plugin = atproto();
		await expect(
			plugin.init?.(makeCtx({ baseURL: undefined })),
		).rejects.toThrow("baseURL is required");
	});

	it("throws when DynamicBaseURLConfig has no fallback", async () => {
		const plugin = atproto();
		await expect(
			plugin.init?.(makeCtx({ baseURL: { allowedHosts: ["example.com"] } })),
		).rejects.toThrow("must be a string or have a fallback URL");
	});

	it("throws on non-localhost without privateKey", async () => {
		const plugin = atproto();
		await expect(
			plugin.init?.(makeCtx({ baseURL: "https://example.com" })),
		).rejects.toThrow("privateKey is required");
	});

	it("succeeds for localhost without privateKey", async () => {
		const plugin = atproto();
		await expect(
			plugin.init?.(makeCtx({ baseURL: "http://127.0.0.1:3000" })),
		).resolves.not.toThrow();
	});

	it("resolves DynamicBaseURLConfig with fallback", async () => {
		const plugin = atproto();
		await expect(
			plugin.init?.(
				makeCtx({
					baseURL: {
						allowedHosts: ["example.com"],
						fallback: "http://127.0.0.1:3000",
					},
				}),
			),
		).resolves.not.toThrow();
	});
});

describe("atproto endpoints — metadata", () => {
	it("returns client metadata", async () => {
		const { auth } = await getTestInstance({
			plugins: [atproto()],
		});
		const api = auth.api as unknown as {
			atprotoClientMetadata: () => Promise<{
				client_id: string;
				dpop_bound_access_tokens: boolean;
			}>;
		};
		const res = await api.atprotoClientMetadata();
		expect(res.client_id).toBe("test-client");
		expect(res.dpop_bound_access_tokens).toBe(true);
	});

	it("returns jwks", async () => {
		const { auth } = await getTestInstance({
			plugins: [atproto()],
		});
		const api = auth.api as unknown as {
			atprotoJwks: () => Promise<{ keys: unknown[] }>;
		};
		const res = await api.atprotoJwks();
		expect(res).toEqual({ keys: [] });
	});
});

describe("atproto sign-in", () => {
	beforeEach(() => {
		oauthMocks.authorize.mockReset();
	});

	it("returns the authorization URL", async () => {
		const { client } = await getTestInstance(
			{ plugins: [atproto()] },
			{ clientOptions: { plugins: [atprotoClient()] } },
		);
		oauthMocks.authorize.mockResolvedValueOnce(
			new URL("https://pds.example.com/authorize?x=1"),
		);
		const res = await client.signIn.atproto({
			handle: "alice.bsky.social",
			callbackURL: "/dashboard",
		});
		expect(res.data?.url).toBe("https://pds.example.com/authorize?x=1");
		expect(res.data?.redirect).toBe(true);
	});

	it("rejects untrusted callbackURL", async () => {
		const { client } = await getTestInstance(
			{ plugins: [atproto()] },
			{ clientOptions: { plugins: [atprotoClient()] } },
		);
		const res = await client.signIn.atproto({
			handle: "alice.bsky.social",
			callbackURL: "https://evil.example.com/steal",
		});
		expect(res.error?.status).toBe(400);
	});

	it("returns BAD_REQUEST when authorize throws", async () => {
		const { client } = await getTestInstance(
			{ plugins: [atproto()] },
			{ clientOptions: { plugins: [atprotoClient()] } },
		);
		oauthMocks.authorize.mockRejectedValueOnce(
			new Error("unresolvable handle"),
		);
		const res = await client.signIn.atproto({
			handle: "not-real.bsky.social",
			callbackURL: "/",
		});
		expect(res.error?.status).toBe(400);
	});
});

describe("atproto callback", () => {
	beforeEach(() => {
		oauthMocks.callback.mockReset();
	});

	it("returns UNAUTHORIZED when params include error", async () => {
		const { auth } = await getTestInstance({
			plugins: [atproto()],
		});
		const req = new Request(
			"http://localhost:3000/api/auth/atproto/callback?error=access_denied",
			{ method: "GET" },
		);
		const res = await auth.handler(req);
		expect(res.status).toBe(401);
	});

	it("returns UNAUTHORIZED when the OAuth callback throws", async () => {
		const { auth } = await getTestInstance({
			plugins: [atproto()],
		});
		oauthMocks.callback.mockRejectedValueOnce(new Error("boom"));
		const req = new Request(
			"http://localhost:3000/api/auth/atproto/callback?code=x&state=y",
			{ method: "GET" },
		);
		const res = await auth.handler(req);
		expect(res.status).toBe(401);
	});

	it("creates user, links account, sets cookie, and redirects on happy path", async () => {
		const { auth } = await getTestInstance({
			plugins: [atproto()],
			disableTestUser: true,
		} as never);

		// Mock the authenticated Agent.getProfile via @atproto/api
		const { Agent } = await import("@atproto/api");
		vi.mocked(Agent).mockImplementation(function () {
			return {
				getProfile: vi.fn().mockResolvedValue({
					data: {
						handle: "alice.bsky.social",
						displayName: "Alice",
						avatar: "https://cdn/avatar.jpg",
						banner: "https://cdn/banner.jpg",
						description: "hi",
					},
				}),
			};
		} as never);

		oauthMocks.callback.mockResolvedValueOnce({
			session: { did: "did:plc:alice" },
			state: JSON.stringify({ callbackURL: "/dashboard" }),
		});

		const req = new Request(
			"http://localhost:3000/api/auth/atproto/callback?code=x&state=y",
			{ method: "GET", redirect: "manual" },
		);
		const res = await auth.handler(req);
		expect(res.status).toBeGreaterThanOrEqual(300);
		expect(res.status).toBeLessThan(400);
		expect(res.headers.get("location")).toContain("/dashboard");
		expect(res.headers.get("set-cookie")).toMatch(/better-auth\.session_token/);
	});

	it("returns FORBIDDEN with disableSignUp and unknown DID", async () => {
		const { auth } = await getTestInstance({
			plugins: [atproto({ disableSignUp: true })],
			disableTestUser: true,
		} as never);

		const { Agent } = await import("@atproto/api");
		vi.mocked(Agent).mockImplementation(function () {
			return {
				getProfile: vi.fn().mockResolvedValue({
					data: { handle: "stranger.bsky.social" },
				}),
			};
		} as never);

		oauthMocks.callback.mockResolvedValueOnce({
			session: { did: "did:plc:stranger" },
			state: JSON.stringify({ callbackURL: "/" }),
		});

		const req = new Request(
			"http://localhost:3000/api/auth/atproto/callback?code=x&state=y",
			{ method: "GET", redirect: "manual" },
		);
		const res = await auth.handler(req);
		expect(res.status).toBe(403);
	});

	it("persists atprotoDid/atprotoHandle on the user row after callback", async () => {
		const { auth } = await getTestInstance({
			plugins: [atproto()],
			disableTestUser: true,
		} as never);

		const { Agent } = await import("@atproto/api");
		vi.mocked(Agent).mockImplementation(function () {
			return {
				getProfile: vi.fn().mockResolvedValue({
					data: {
						handle: "alice.bsky.social",
						displayName: "Alice",
						avatar: "https://cdn/avatar.jpg",
						description: "hi",
					},
				}),
			};
		} as never);

		oauthMocks.callback.mockResolvedValueOnce({
			session: { did: "did:plc:fields-test" },
			state: JSON.stringify({ callbackURL: "/" }),
		});

		const req = new Request(
			"http://localhost:3000/api/auth/atproto/callback?code=x&state=y",
			{ method: "GET", redirect: "manual" },
		);
		await auth.handler(req);

		// Query the user row directly to assert the atproto fields landed
		// (and so by extension, the session cookie's cached user payload —
		// which is built from the same userRecord — has them too).
		const ctx = await auth.$context;
		const account = await ctx.adapter.findOne<{ userId: string }>({
			model: "account",
			where: [
				{ field: "providerId", value: "atproto" },
				{ field: "accountId", value: "did:plc:fields-test" },
			],
		});
		expect(account?.userId).toBeDefined();
		const user = await ctx.adapter.findOne<{
			atprotoDid?: string;
			atprotoHandle?: string;
		}>({
			model: "user",
			where: [{ field: "id", value: account!.userId }],
		});
		expect(user?.atprotoDid).toBe("did:plc:fields-test");
		expect(user?.atprotoHandle).toBe("alice.bsky.social");
	});

	it("does not auto-link an atproto DID to a user holding the synthetic placeholder email", async () => {
		const { auth } = await getTestInstance({
			plugins: [atproto()],
			disableTestUser: true,
			emailAndPassword: { enabled: true },
		} as never);

		const ctx = await auth.$context;
		// Pre-create a user whose email happens to match the placeholder
		// pattern that the atproto plugin would derive for did:plc:colliding.
		// Without the direct-account-lookup fix, this user would be picked
		// up via the email fallback in `findOAuthUser` and silently linked.
		const sanitized = "did_plc_colliding";
		const placeholder = `${sanitized}@atproto.invalid`;
		const preexisting = await ctx.adapter.create<{ id: string }>({
			model: "user",
			data: {
				name: "Unrelated User",
				email: placeholder,
				emailVerified: false,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});

		const { Agent } = await import("@atproto/api");
		vi.mocked(Agent).mockImplementation(function () {
			return {
				getProfile: vi.fn().mockResolvedValue({
					data: { handle: "stranger.bsky.social" },
				}),
			};
		} as never);

		oauthMocks.callback.mockResolvedValueOnce({
			session: { did: "did:plc:colliding" },
			state: JSON.stringify({ callbackURL: "/" }),
		});

		const req = new Request(
			"http://localhost:3000/api/auth/atproto/callback?code=x&state=y",
			{ method: "GET", redirect: "manual" },
		);
		await auth.handler(req);

		// The pre-existing user must NOT have had the atproto DID linked.
		const preexistingAfter = await ctx.adapter.findOne<{
			atprotoDid?: string;
		}>({
			model: "user",
			where: [{ field: "id", value: preexisting.id }],
		});
		expect(preexistingAfter?.atprotoDid).toBeFalsy();

		// And no account row should reference the pre-existing user with the
		// atproto provider.
		const linkedAccount = await ctx.adapter.findOne({
			model: "account",
			where: [
				{ field: "providerId", value: "atproto" },
				{ field: "userId", value: preexisting.id },
			],
		});
		expect(linkedAccount).toBeNull();
	});

	it("returns BAD_REQUEST when appState.callbackURL is untrusted", async () => {
		const { auth } = await getTestInstance({
			plugins: [atproto()],
			disableTestUser: true,
		} as never);

		const { Agent } = await import("@atproto/api");
		vi.mocked(Agent).mockImplementation(function () {
			return {
				getProfile: vi.fn().mockResolvedValue({
					data: { handle: "alice.bsky.social" },
				}),
			};
		} as never);

		oauthMocks.callback.mockResolvedValueOnce({
			session: { did: "did:plc:alice2" },
			state: JSON.stringify({ callbackURL: "https://evil.example.com/" }),
		});

		const req = new Request(
			"http://localhost:3000/api/auth/atproto/callback?code=x&state=y",
			{ method: "GET", redirect: "manual" },
		);
		const res = await auth.handler(req);
		expect(res.status).toBe(400);
	});
});

describe("atproto session + restore", () => {
	beforeEach(() => {
		oauthMocks.restore.mockReset();
	});

	it("/atproto/session returns active:false when user has no atprotoDid", async () => {
		const { client, signInWithTestUser } = await getTestInstance(
			{ plugins: [atproto()] },
			{ clientOptions: { plugins: [atprotoClient()] } },
		);
		const { headers } = await signInWithTestUser();
		const res = await client.atproto.getSession({ headers });
		expect(res.data).toEqual({ active: false });
	});

	it("/atproto/restore returns active:false when user has no atprotoDid", async () => {
		const { client, signInWithTestUser } = await getTestInstance(
			{ plugins: [atproto()] },
			{ clientOptions: { plugins: [atprotoClient()] } },
		);
		const { headers } = await signInWithTestUser();
		const res = await client.atproto.restore({ headers });
		expect(res.data).toEqual({ active: false });
	});
});
