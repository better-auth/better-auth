import { createInsufficientScopeError } from "better-auth/oauth2";
import { APIError } from "better-call";
import type { JWTPayload } from "jose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMcpProtectedRequestHandler } from "./handler";

const { verifyAccessTokenRequest } = vi.hoisted(() => ({
	verifyAccessTokenRequest: vi.fn(),
}));

vi.mock("better-auth/oauth2", async (importOriginal) => {
	const actual = await importOriginal<typeof import("better-auth/oauth2")>();
	return { ...actual, verifyAccessTokenRequest };
});

const protectedRequestOptions = {
	issuer: "https://app.example.com",
	audience: "https://app.example.com/mcp",
};

const request = () =>
	new Request("https://app.example.com/mcp", {
		headers: { Authorization: "Bearer access-token" },
	});

describe("createMcpProtectedRequestHandler", () => {
	beforeEach(() => {
		verifyAccessTokenRequest.mockReset();
	});

	it("answers a scope failure with a 403 insufficient_scope challenge", async () => {
		verifyAccessTokenRequest.mockRejectedValue(
			createInsufficientScopeError(["mcp:write"]),
		);

		const response = await createMcpProtectedRequestHandler(
			{ ...protectedRequestOptions, requiredScopes: ["mcp:write"] },
			async () => new Response("unreachable"),
		)(request());

		expect(response.status).toBe(403);
		expect(response.headers.get("WWW-Authenticate")).toBe(
			`Bearer error="insufficient_scope", scope="mcp:write", resource_metadata="https://app.example.com/.well-known/oauth-protected-resource/mcp", error_description="access token is missing required scope: mcp:write"`,
		);
	});

	it("forwards flat JWT verification and challenge options", async () => {
		verifyAccessTokenRequest.mockRejectedValue(
			new APIError("UNAUTHORIZED", {
				error: "invalid_token",
				message: "invalid access token",
			}),
		);

		const response = await createMcpProtectedRequestHandler(
			{
				...protectedRequestOptions,
				jwtVerifyOptions: { algorithms: ["ES256"] },
				challengeScopes: ["mcp:read"],
			},
			async () => new Response("unreachable"),
		)(request());

		expect(verifyAccessTokenRequest).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				verifyOptions: {
					algorithms: ["ES256"],
					issuer: protectedRequestOptions.issuer,
					audience: protectedRequestOptions.audience,
				},
			}),
		);
		expect(response.headers.get("WWW-Authenticate")).toContain(
			'scope="mcp:read"',
		);
	});

	/**
	 * @see https://fetch.spec.whatwg.org/#cors-safelisted-response-header-name
	 */
	it("exposes WWW-Authenticate on a challenge", async () => {
		verifyAccessTokenRequest.mockRejectedValue(
			new APIError("UNAUTHORIZED", { message: "missing bearer token" }),
		);

		const response = await createMcpProtectedRequestHandler(
			protectedRequestOptions,
			async () => new Response("unreachable"),
		)(request());

		expect(response.status).toBe(401);
		expect(response.headers.get("Access-Control-Expose-Headers")).toBe(
			"WWW-Authenticate",
		);
	});

	/**
	 * @see https://datatracker.ietf.org/doc/html/rfc9449#section-7.2
	 */
	it("answers a failed DPoP request with a DPoP challenge", async () => {
		verifyAccessTokenRequest.mockRejectedValue(
			new APIError("UNAUTHORIZED", {
				error: "invalid_token",
				message: "token expired",
			}),
		);

		const response = await createMcpProtectedRequestHandler(
			{ ...protectedRequestOptions, dpop: { signingAlgorithms: ["ES256"] } },
			async () => new Response("unreachable"),
		)(
			new Request("https://app.example.com/mcp", {
				headers: { Authorization: "DPoP access-token" },
			}),
		);

		expect(response.status).toBe(401);
		expect(response.headers.get("WWW-Authenticate")).toBe(
			'DPoP error="invalid_token", error_description="token expired", algs="ES256"',
		);
	});

	it("propagates a handler error with its type and stack intact", async () => {
		const failure = new Error("database connection lost");
		failure.name = "ToolExecutionError";
		verifyAccessTokenRequest.mockResolvedValue({
			sub: "user-1",
		} satisfies JWTPayload);

		await expect(
			createMcpProtectedRequestHandler(protectedRequestOptions, async () => {
				throw failure;
			})(request()),
		).rejects.toBe(failure);
	});

	it("propagates a handler-thrown permission denial unchanged", async () => {
		const denial = new APIError("FORBIDDEN", {
			message: "user is not a member of this organization",
		});
		verifyAccessTokenRequest.mockResolvedValue({
			sub: "user-2",
		} satisfies JWTPayload);

		await expect(
			createMcpProtectedRequestHandler(protectedRequestOptions, async () => {
				throw denial;
			})(request()),
		).rejects.toBe(denial);
	});

	it.each(["UNAUTHORIZED", "FORBIDDEN"] as const)(
		"propagates a handler-thrown %s API error unchanged",
		async (status) => {
			const denial = new APIError(status, { message: "handler denial" });
			verifyAccessTokenRequest.mockResolvedValue({ sub: "user-3" });

			await expect(
				createMcpProtectedRequestHandler(protectedRequestOptions, async () => {
					throw denial;
				})(request()),
			).rejects.toBe(denial);
		},
	);

	it("propagates a primitive handler failure unchanged", async () => {
		verifyAccessTokenRequest.mockResolvedValue({ sub: "user-4" });

		await expect(
			createMcpProtectedRequestHandler(protectedRequestOptions, async () => {
				throw "primitive failure";
			})(request()),
		).rejects.toBe("primitive failure");
	});

	it("turns a typed handler insufficient-scope error into a 403 challenge", async () => {
		verifyAccessTokenRequest.mockResolvedValue({ sub: "user-5" });

		const response = await createMcpProtectedRequestHandler(
			protectedRequestOptions,
			async () => {
				throw createInsufficientScopeError(["mcp:admin"]);
			},
		)(request());

		expect(response.status).toBe(403);
		expect(response.headers.get("WWW-Authenticate")).toContain(
			'scope="mcp:admin"',
		);
	});

	/**
	 * @see https://datatracker.ietf.org/doc/html/rfc9449#section-7.1
	 */
	it("answers a handler insufficient-scope error on a DPoP request with a DPoP challenge", async () => {
		verifyAccessTokenRequest.mockResolvedValue({ sub: "user-5" });

		const response = await createMcpProtectedRequestHandler(
			{ ...protectedRequestOptions, dpop: { signingAlgorithms: ["ES256"] } },
			async () => {
				throw createInsufficientScopeError(["mcp:admin"]);
			},
		)(
			new Request("https://app.example.com/mcp", {
				headers: { Authorization: "DPoP access-token" },
			}),
		);

		expect(response.status).toBe(403);
		expect(response.headers.get("WWW-Authenticate")).toBe(
			'DPoP error="insufficient_scope", scope="mcp:admin", error_description="access token is missing required scope: mcp:admin", algs="ES256"',
		);
	});

	it("propagates an unbranded structural insufficient-scope error unchanged", async () => {
		verifyAccessTokenRequest.mockResolvedValue({ sub: "user-6" });
		const spoofed = new APIError("FORBIDDEN", {
			error: "insufficient_scope",
			scope: "mcp:admin",
		});

		await expect(
			createMcpProtectedRequestHandler(protectedRequestOptions, async () => {
				throw spoofed;
			})(request()),
		).rejects.toBe(spoofed);
	});

	it.each([
		["opaque URI", "urn:example:mcp"],
		["audience array", ["https://api.example.com/mcp"]],
		["non-loopback HTTP URL", "http://api.example.com/mcp"],
		["private HTTP hostname", "http://mcp.internal/mcp"],
		["loopback-lookalike hostname", "http://127.example.com/mcp"],
		["credentials", "https://user:pass@api.example.com/mcp"],
		["fragment", "https://api.example.com/mcp#tools"],
		["query", "https://api.example.com/mcp?tenant=a"],
	])("rejects an invalid canonical MCP resource: %s", (_name, resource) => {
		expect(() =>
			createMcpProtectedRequestHandler(
				{ ...protectedRequestOptions, audience: resource as string },
				async () => new Response("unreachable"),
			),
		).toThrow("MCP resource");
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11337
	 */
	it.each([
		"https://api.example.com/mcp",
		"http://localhost:3000/mcp",
		"http://my-branch.api.localhost/mcp",
		"http://127.0.0.1:3000/mcp",
		"http://127.42.0.1/mcp",
		"http://[::1]:3000/mcp",
	])("accepts a canonical MCP resource: %s", (resource) => {
		expect(() =>
			createMcpProtectedRequestHandler(
				{ ...protectedRequestOptions, audience: resource },
				async () => new Response("unused"),
			),
		).not.toThrow();
	});
});
