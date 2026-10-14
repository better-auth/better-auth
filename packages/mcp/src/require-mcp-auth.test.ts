import { createInsufficientScopeError } from "better-auth/oauth2";
import { APIError } from "better-call";
import type { JWTPayload } from "jose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireMcpAuth } from "./require-mcp-auth";

const { verifyAccessTokenRequest } = vi.hoisted(() => ({
	verifyAccessTokenRequest: vi.fn(),
}));

// Partial mock: only `verifyAccessTokenRequest` is stubbed. The real exports
// (e.g. `DPOP_SIGNING_ALGORITHMS`, used by the DPoP challenge builder) stay so
// the resource-server challenge path works.
vi.mock("better-auth/oauth2", async (importOriginal) => {
	const actual = await importOriginal<typeof import("better-auth/oauth2")>();
	return { ...actual, verifyAccessTokenRequest };
});

// These tests mock `verifyAccessTokenRequest`, so the replay store is never
// exercised; the stub only needs to satisfy the context type.
const internalAdapterStub = {
	reserveVerificationValue: async () => true,
};

const authWith = (baseURL: string, resolvedBaseURL: string) => ({
	options: { baseURL },
	$context: Promise.resolve({
		baseURL: resolvedBaseURL,
		internalAdapter: internalAdapterStub,
	}),
});

describe("requireMcpAuth", () => {
	beforeEach(() => {
		verifyAccessTokenRequest.mockReset();
	});

	it("verifies against the provider's resolved base URL, not the bare origin", async () => {
		// Regression: the access token `iss`/`aud` are the provider's resolved
		// base URL (which includes the base path). Verifying against the origin
		// rejected every valid token whenever a base path was configured.
		verifyAccessTokenRequest.mockResolvedValue({
			sub: "user-1",
		} satisfies JWTPayload);
		const auth = authWith(
			"https://app.example.com",
			"https://app.example.com/api/auth",
		);

		let verifiedSub: string | undefined;
		const response = await requireMcpAuth(
			auth,
			async (_request, accessTokenClaims) => {
				verifiedSub = accessTokenClaims.sub;
				return Response.json({ ok: true });
			},
		)(
			new Request("https://app.example.com/mcp", {
				headers: { Authorization: "Bearer access-token" },
			}),
		);

		expect(response.status).toBe(200);
		expect(verifiedSub).toBe("user-1");
		expect(verifyAccessTokenRequest).toHaveBeenCalledWith(
			expect.objectContaining({
				authorizationHeader: "Bearer access-token",
				dpopProofJwt: null,
				method: "GET",
				url: "https://app.example.com/mcp",
			}),
			expect.objectContaining({
				verifyOptions: expect.objectContaining({
					issuer: "https://app.example.com/api/auth",
					audience: "https://app.example.com/api/auth",
				}),
				jwksUrl: "https://app.example.com/api/auth/jwks",
			}),
		);
	});

	it("challenges with the served resource_metadata URL when no token is present", async () => {
		verifyAccessTokenRequest.mockRejectedValue(
			new APIError("UNAUTHORIZED", {
				message: "missing authorization header",
			}),
		);
		const response = await requireMcpAuth(
			authWith("https://app.example.com", "https://app.example.com/api/auth"),
			async () => new Response("unreachable"),
		)(new Request("https://app.example.com/mcp"));

		expect(response.status).toBe(401);
		expect(response.headers.get("WWW-Authenticate")).toBe(
			`Bearer resource_metadata="https://app.example.com/.well-known/oauth-protected-resource/api/auth"`,
		);
	});

	it("answers a DPoP-bound failure with an RFC 9449 DPoP challenge", async () => {
		verifyAccessTokenRequest.mockRejectedValue(
			new APIError("UNAUTHORIZED", {
				message: "DPoP proof header is required",
				error: "invalid_dpop_proof",
				error_description: "DPoP proof header is required",
			}),
		);
		const response = await requireMcpAuth(
			authWith("https://app.example.com", "https://app.example.com/api/auth"),
			async () => new Response("unreachable"),
		)(
			new Request("https://app.example.com/mcp", {
				headers: { Authorization: "DPoP access-token" },
			}),
		);

		expect(response.status).toBe(401);
		expect(response.headers.get("WWW-Authenticate")).toMatch(/^DPoP /);
	});

	it("advertises the configured DPoP signing algorithms in the challenge", async () => {
		verifyAccessTokenRequest.mockRejectedValue(
			new APIError("UNAUTHORIZED", {
				message: "DPoP proof header is required",
				error: "invalid_dpop_proof",
				error_description: "DPoP proof header is required",
			}),
		);
		const response = await requireMcpAuth(
			authWith("https://app.example.com", "https://app.example.com/api/auth"),
			async () => new Response("unreachable"),
			{ dpop: { signingAlgorithms: ["ES256"] } },
		)(
			new Request("https://app.example.com/mcp", {
				headers: { Authorization: "DPoP access-token" },
			}),
		);

		expect(response.status).toBe(401);
		// The challenge advertises the configured alg, not the default set.
		expect(response.headers.get("WWW-Authenticate")).toContain('algs="ES256"');
	});

	it("verifies against an explicit resource override", async () => {
		verifyAccessTokenRequest.mockResolvedValue({
			sub: "user-2",
		} satisfies JWTPayload);
		await requireMcpAuth(
			authWith("https://app.example.com", "https://app.example.com/api/auth"),
			async () => Response.json({ ok: true }),
			{ resource: "https://mcp.example.com/mcp" },
		)(
			new Request("https://mcp.example.com/mcp", {
				headers: { Authorization: "Bearer access-token" },
			}),
		);

		expect(verifyAccessTokenRequest).toHaveBeenCalledWith(
			expect.objectContaining({
				authorizationHeader: "Bearer access-token",
			}),
			expect.objectContaining({
				verifyOptions: expect.objectContaining({
					audience: "https://mcp.example.com/mcp",
				}),
			}),
		);
	});

	it("advertises a scope hint in the challenge when configured", async () => {
		verifyAccessTokenRequest.mockRejectedValue(
			new APIError("UNAUTHORIZED", {
				message: "missing authorization header",
			}),
		);
		const response = await requireMcpAuth(
			authWith("https://app.example.com", "https://app.example.com/api/auth"),
			async () => new Response("unreachable"),
			{ challengeScopes: ["openid", "profile"] },
		)(new Request("https://app.example.com/mcp"));

		expect(response.status).toBe(401);
		expect(response.headers.get("WWW-Authenticate")).toBe(
			`Bearer resource_metadata="https://app.example.com/.well-known/oauth-protected-resource/api/auth", scope="openid profile"`,
		);
	});

	it("enforces required scopes against the token's scope claim", async () => {
		verifyAccessTokenRequest.mockResolvedValue({
			sub: "user-3",
			scope: "mcp:read mcp:write",
		} satisfies JWTPayload);
		const response = await requireMcpAuth(
			authWith("https://app.example.com", "https://app.example.com/api/auth"),
			async () => Response.json({ ok: true }),
			{ requiredScopes: ["mcp:read"] },
		)(
			new Request("https://app.example.com/mcp", {
				headers: { Authorization: "Bearer access-token" },
			}),
		);

		expect(response.status).toBe(200);
		expect(verifyAccessTokenRequest).toHaveBeenCalledWith(
			expect.objectContaining({
				authorizationHeader: "Bearer access-token",
			}),
			expect.objectContaining({
				requiredScopes: ["mcp:read"],
			}),
		);
	});

	it("answers a scope failure with a 403 insufficient_scope challenge", async () => {
		verifyAccessTokenRequest.mockRejectedValue(
			createInsufficientScopeError(["mcp:write"]),
		);
		const response = await requireMcpAuth(
			authWith("https://app.example.com", "https://app.example.com/api/auth"),
			async () => new Response("unreachable"),
			{ requiredScopes: ["mcp:write"] },
		)(
			new Request("https://app.example.com/mcp", {
				headers: { Authorization: "Bearer access-token" },
			}),
		);

		expect(response.status).toBe(403);
		expect(response.headers.get("WWW-Authenticate")).toBe(
			`Bearer error="insufficient_scope", scope="mcp:write", resource_metadata="https://app.example.com/.well-known/oauth-protected-resource/api/auth", error_description="access token is missing required scope: mcp:write"`,
		);
	});

	it("lets a handler challenge for the scopes its tool needs", async () => {
		verifyAccessTokenRequest.mockResolvedValue({
			sub: "user-4",
			scope: "mcp:read",
		} satisfies JWTPayload);
		const response = await requireMcpAuth(
			authWith("https://app.example.com", "https://app.example.com/api/auth"),
			async () => {
				throw createInsufficientScopeError(
					["mcp:admin"],
					"tool requires mcp:admin",
				);
			},
			{ challengeScopes: ["mcp:read"] },
		)(
			new Request("https://app.example.com/mcp", {
				headers: { Authorization: "Bearer access-token" },
			}),
		);

		expect(response.status).toBe(403);
		expect(response.headers.get("WWW-Authenticate")).toBe(
			`Bearer error="insufficient_scope", scope="mcp:admin", resource_metadata="https://app.example.com/.well-known/oauth-protected-resource/api/auth", error_description="tool requires mcp:admin"`,
		);
	});

	it("propagates a handler-thrown permission denial unchanged", async () => {
		// Re-authorizing cannot grant organization membership, so this must not
		// become a scope challenge that loops the user through consent.
		verifyAccessTokenRequest.mockResolvedValue({
			sub: "user-5",
			scope: "mcp:read",
		} satisfies JWTPayload);
		const denial = new APIError("FORBIDDEN", {
			message: "user is not a member of this organization",
		});

		await expect(
			requireMcpAuth(
				authWith("https://app.example.com", "https://app.example.com/api/auth"),
				async () => {
					throw denial;
				},
				{ requiredScopes: ["mcp:read"] },
			)(
				new Request("https://app.example.com/mcp", {
					headers: { Authorization: "Bearer access-token" },
				}),
			),
		).rejects.toBe(denial);
	});

	it("propagates a handler error with its type and stack intact", async () => {
		const failure = new Error("database connection lost");
		failure.name = "ToolExecutionError";
		verifyAccessTokenRequest.mockResolvedValue({
			sub: "user-6",
		} satisfies JWTPayload);

		await expect(
			requireMcpAuth(
				authWith("https://app.example.com", "https://app.example.com/api/auth"),
				async () => {
					throw failure;
				},
			)(
				new Request("https://app.example.com/mcp", {
					headers: { Authorization: "Bearer access-token" },
				}),
			),
		).rejects.toBe(failure);
	});

	it("propagates a primitive handler failure unchanged", async () => {
		verifyAccessTokenRequest.mockResolvedValue({ sub: "user-7" });

		await expect(
			requireMcpAuth(
				authWith("https://app.example.com", "https://app.example.com/api/auth"),
				async () => {
					throw "primitive failure";
				},
			)(
				new Request("https://app.example.com/mcp", {
					headers: { Authorization: "Bearer access-token" },
				}),
			),
		).rejects.toBe("primitive failure");
	});

	it("rejects an opaque resource at wrapper construction", () => {
		expect(() =>
			requireMcpAuth(
				authWith("https://app.example.com", "https://app.example.com/api/auth"),
				async () => new Response("unreachable"),
				{ resource: "urn:example:mcp" },
			),
		).toThrow("MCP resource");
	});

	it("rejects unsafe configured challenge scopes instead of serializing them", async () => {
		verifyAccessTokenRequest.mockRejectedValue(
			new APIError("UNAUTHORIZED", {
				message: "missing authorization header",
			}),
		);

		await expect(
			requireMcpAuth(
				authWith("https://app.example.com", "https://app.example.com/api/auth"),
				async () => new Response("unreachable"),
				{ challengeScopes: ["mcp:read\r\nX-Test: injected"] },
			)(new Request("https://app.example.com/mcp")),
		).rejects.toThrow("invalid challenge scope");
	});

	it("derives the challenge scope hint from enforced scopes when no hint is set", async () => {
		verifyAccessTokenRequest.mockRejectedValue(
			new APIError("UNAUTHORIZED", {
				message: "missing authorization header",
			}),
		);
		const response = await requireMcpAuth(
			authWith("https://app.example.com", "https://app.example.com/api/auth"),
			async () => new Response("unreachable"),
			{ requiredScopes: ["mcp:read", "mcp:write"] },
		)(new Request("https://app.example.com/mcp"));

		expect(response.status).toBe(401);
		expect(response.headers.get("WWW-Authenticate")).toBe(
			`Bearer resource_metadata="https://app.example.com/.well-known/oauth-protected-resource/api/auth", scope="mcp:read mcp:write"`,
		);
	});

	it("rejects a resource query at wrapper construction", () => {
		expect(() =>
			requireMcpAuth(
				authWith("https://app.example.com", "https://app.example.com/api/auth"),
				async () => new Response("unreachable"),
				{ resource: "https://mcp.example.com/mcp?tenant=a" },
			),
		).toThrow("MCP resource");
	});
});
