import { createInsufficientScopeError } from "better-auth/oauth2";
import { APIError } from "better-call";
import type { JWTPayload } from "jose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mcpHandler } from "./handler";

const { verifyAccessTokenRequest } = vi.hoisted(() => ({
	verifyAccessTokenRequest: vi.fn(),
}));

vi.mock("better-auth/oauth2", async (importOriginal) => {
	const actual = await importOriginal<typeof import("better-auth/oauth2")>();
	return { ...actual, verifyAccessTokenRequest };
});

const verifyOptions = {
	verifyOptions: {
		issuer: "https://app.example.com",
		audience: "https://app.example.com/mcp",
	},
};

const request = () =>
	new Request("https://app.example.com/mcp", {
		headers: { Authorization: "Bearer access-token" },
	});

describe("mcpHandler", () => {
	beforeEach(() => {
		verifyAccessTokenRequest.mockReset();
	});

	it("answers a scope failure with a 403 insufficient_scope challenge", async () => {
		verifyAccessTokenRequest.mockRejectedValue(
			createInsufficientScopeError(["mcp:write"]),
		);

		const response = await mcpHandler(
			{ ...verifyOptions, requiredScopes: ["mcp:write"] },
			async () => new Response("unreachable"),
		)(request());

		expect(response.status).toBe(403);
		expect(response.headers.get("WWW-Authenticate")).toBe(
			`Bearer error="insufficient_scope", scope="mcp:write", resource_metadata="https://app.example.com/.well-known/oauth-protected-resource/mcp", error_description="access token is missing required scope: mcp:write"`,
		);
	});

	it("propagates a handler error with its type and stack intact", async () => {
		const failure = new Error("database connection lost");
		failure.name = "ToolExecutionError";
		verifyAccessTokenRequest.mockResolvedValue({
			sub: "user-1",
		} satisfies JWTPayload);

		await expect(
			mcpHandler(verifyOptions, async () => {
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
			mcpHandler(verifyOptions, async () => {
				throw denial;
			})(request()),
		).rejects.toBe(denial);
	});

	it.each([
		"UNAUTHORIZED",
		"FORBIDDEN",
	] as const)("propagates a handler-thrown %s API error unchanged", async (status) => {
		const denial = new APIError(status, { message: "handler denial" });
		verifyAccessTokenRequest.mockResolvedValue({ sub: "user-3" });

		await expect(
			mcpHandler(verifyOptions, async () => {
				throw denial;
			})(request()),
		).rejects.toBe(denial);
	});

	it("propagates a primitive handler failure unchanged", async () => {
		verifyAccessTokenRequest.mockResolvedValue({ sub: "user-4" });

		await expect(
			mcpHandler(verifyOptions, async () => {
				throw "primitive failure";
			})(request()),
		).rejects.toBe("primitive failure");
	});

	it("turns a typed handler insufficient-scope error into a 403 challenge", async () => {
		verifyAccessTokenRequest.mockResolvedValue({ sub: "user-5" });

		const response = await mcpHandler(verifyOptions, async () => {
			throw createInsufficientScopeError(["mcp:admin"]);
		})(request());

		expect(response.status).toBe(403);
		expect(response.headers.get("WWW-Authenticate")).toContain(
			'scope="mcp:admin"',
		);
	});

	it("propagates an unbranded structural insufficient-scope error unchanged", async () => {
		verifyAccessTokenRequest.mockResolvedValue({ sub: "user-6" });
		const spoofed = new APIError("FORBIDDEN", {
			error: "insufficient_scope",
			scope: "mcp:admin",
		});

		await expect(
			mcpHandler(verifyOptions, async () => {
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
			mcpHandler(
				{
					verifyOptions: {
						...verifyOptions.verifyOptions,
						audience: resource as string,
					},
				},
				async () => new Response("unreachable"),
			),
		).toThrow("MCP resource");
	});

	it.each([
		"https://api.example.com/mcp",
		"http://localhost:3000/mcp",
		"http://127.0.0.1:3000/mcp",
		"http://127.42.0.1/mcp",
		"http://[::1]:3000/mcp",
	])("accepts a canonical MCP resource: %s", (resource) => {
		expect(() =>
			mcpHandler(
				{
					verifyOptions: {
						...verifyOptions.verifyOptions,
						audience: resource,
					},
				},
				async () => new Response("unused"),
			),
		).not.toThrow();
	});
});
