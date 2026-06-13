import { APIError } from "better-call";
import type { JWTPayload } from "jose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireMcpAuth } from "./require-mcp-auth";

const { verifyAccessTokenRequest } = vi.hoisted(() => ({
	verifyAccessTokenRequest: vi.fn(),
}));

vi.mock("better-auth/oauth2", () => ({ verifyAccessTokenRequest }));

const authWith = (baseURL: string, resolvedBaseURL: string) => ({
	options: { baseURL },
	$context: Promise.resolve({ baseURL: resolvedBaseURL }),
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
		const response = await requireMcpAuth(auth, async (_req, jwt) => {
			verifiedSub = jwt.sub;
			return Response.json({ ok: true });
		})(
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
			{ scope: "openid profile" },
		)(new Request("https://app.example.com/mcp"));

		expect(response.status).toBe(401);
		expect(response.headers.get("WWW-Authenticate")).toBe(
			`Bearer resource_metadata="https://app.example.com/.well-known/oauth-protected-resource/api/auth", scope="openid profile"`,
		);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/pull/9992
	 */
	it("preserves a resource query in the metadata URL", async () => {
		verifyAccessTokenRequest.mockRejectedValue(
			new APIError("UNAUTHORIZED", {
				message: "missing authorization header",
			}),
		);
		const response = await requireMcpAuth(
			authWith("https://app.example.com", "https://app.example.com/api/auth"),
			async () => new Response("unreachable"),
			{ resource: "https://mcp.example.com/mcp?tenant=a" },
		)(new Request("https://mcp.example.com/mcp"));

		expect(response.status).toBe(401);
		expect(response.headers.get("WWW-Authenticate")).toBe(
			`Bearer resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource/mcp?tenant=a"`,
		);
	});
});
