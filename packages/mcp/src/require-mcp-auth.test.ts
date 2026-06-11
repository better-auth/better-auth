import type { JWTPayload } from "jose";
import { describe, expect, it, vi } from "vitest";
import { requireMcpAuth } from "./require-mcp-auth";

const { verifyAccessToken } = vi.hoisted(() => ({
	verifyAccessToken: vi.fn(),
}));

vi.mock("better-auth/oauth2", () => ({ verifyAccessToken }));

const authWith = (baseURL: string, resolvedBaseURL: string) => ({
	options: { baseURL },
	$context: Promise.resolve({ baseURL: resolvedBaseURL }),
});

describe("requireMcpAuth", () => {
	it("verifies against the provider's resolved base URL, not the bare origin", async () => {
		// Regression: the access token `iss`/`aud` are the provider's resolved
		// base URL (which includes the base path). Verifying against the origin
		// rejected every valid token whenever a base path was configured.
		verifyAccessToken.mockResolvedValue({ sub: "user-1" } satisfies JWTPayload);
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
		expect(verifyAccessToken).toHaveBeenCalledWith(
			"access-token",
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
		verifyAccessToken.mockResolvedValue({ sub: "user-2" } satisfies JWTPayload);
		await requireMcpAuth(
			authWith("https://app.example.com", "https://app.example.com/api/auth"),
			async () => Response.json({ ok: true }),
			{ resource: "https://mcp.example.com/mcp" },
		)(
			new Request("https://mcp.example.com/mcp", {
				headers: { Authorization: "Bearer access-token" },
			}),
		);

		expect(verifyAccessToken).toHaveBeenCalledWith(
			"access-token",
			expect.objectContaining({
				verifyOptions: expect.objectContaining({
					audience: "https://mcp.example.com/mcp",
				}),
			}),
		);
	});

	it("advertises a scope hint in the challenge when configured", async () => {
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
});
