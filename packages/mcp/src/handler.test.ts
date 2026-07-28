import { insufficientScopeError } from "better-auth/oauth2";
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
			insufficientScopeError(["mcp:write"]),
		);

		const response = await mcpHandler(
			{ ...verifyOptions, scopes: ["mcp:write"] },
			async () => new Response("unreachable"),
		)(request());

		expect(response.status).toBe(403);
		expect(response.headers.get("WWW-Authenticate")).toBe(
			`Bearer error="insufficient_scope", scope="mcp:write", resource_metadata="https://app.example.com/.well-known/oauth-protected-resource/mcp", error_description="access token is missing required scope: mcp:write"`,
		);
	});

	it("propagates a handler error with its type and stack intact", async () => {
		class ToolExecutionError extends Error {}
		const failure = new ToolExecutionError("database connection lost");
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
});
