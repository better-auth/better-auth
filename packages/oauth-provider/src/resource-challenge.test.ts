import { APIError } from "better-call";
import { describe, expect, it } from "vitest";
import { raiseResourceServerChallenge } from "./resource-challenge";

function catchChallenge(resource: string | string[]) {
	try {
		raiseResourceServerChallenge(
			new APIError("UNAUTHORIZED", { message: "missing bearer token" }),
			resource,
		);
	} catch (error) {
		return error as APIError;
	}
	throw new Error("expected challenge");
}

describe("resource server challenge", () => {
	it("derives the RFC 9728 metadata URL from the protected resource", () => {
		const error = catchChallenge("https://api.example.com/mcp/tools?tenant=a");
		const headers = new Headers(error.headers);

		expect(error.status).toBe("UNAUTHORIZED");
		expect(headers?.get("WWW-Authenticate")).toBe(
			'Bearer resource_metadata="https://api.example.com/.well-known/oauth-protected-resource/mcp/tools?tenant=a"',
		);
	});

	it("emits one resource_metadata challenge per protected resource", () => {
		const error = catchChallenge([
			"https://api.example.com/calendar/",
			"https://files.example.com",
		]);
		const headers = new Headers(error.headers);

		expect(headers?.get("WWW-Authenticate")).toBe(
			'Bearer resource_metadata="https://api.example.com/.well-known/oauth-protected-resource/calendar", Bearer resource_metadata="https://files.example.com/.well-known/oauth-protected-resource"',
		);
	});

	it("answers insufficient scope with an RFC 6750 403 challenge", () => {
		try {
			raiseResourceServerChallenge(
				new APIError("FORBIDDEN", { message: "invalid scope files:write" }),
				"https://api.example.com/mcp/tools",
				{ scope: "files:write" },
			);
		} catch (error) {
			const apiError = error as APIError;
			const headers = new Headers(apiError.headers);
			expect(apiError.status).toBe("FORBIDDEN");
			expect(apiError.statusCode).toBe(403);
			expect(headers.get("WWW-Authenticate")).toBe(
				'Bearer error="insufficient_scope", scope="files:write", resource_metadata="https://api.example.com/.well-known/oauth-protected-resource/mcp/tools", error_description="invalid scope files:write"',
			);
			return;
		}
		throw new Error("expected challenge");
	});

	it("omits the scope param from a 403 challenge when none is configured", () => {
		try {
			raiseResourceServerChallenge(
				new APIError("FORBIDDEN", { message: "write access required" }),
				"https://api.example.com",
			);
		} catch (error) {
			const apiError = error as APIError;
			const headers = new Headers(apiError.headers);
			expect(apiError.statusCode).toBe(403);
			expect(headers.get("WWW-Authenticate")).toBe(
				'Bearer error="insufficient_scope", resource_metadata="https://api.example.com/.well-known/oauth-protected-resource", error_description="write access required"',
			);
			return;
		}
		throw new Error("expected challenge");
	});

	it("resolves a mapped resource_metadata URL in a 403 challenge", () => {
		try {
			raiseResourceServerChallenge(
				new APIError("FORBIDDEN", { message: "invalid scope mcp:tools" }),
				"urn:example:mcp",
				{
					scope: "mcp:tools",
					resourceMetadataMappings: {
						"urn:example:mcp":
							"https://api.example.com/.well-known/oauth-protected-resource",
					},
				},
			);
		} catch (error) {
			const apiError = error as APIError;
			const headers = new Headers(apiError.headers);
			expect(apiError.statusCode).toBe(403);
			expect(headers.get("WWW-Authenticate")).toBe(
				'Bearer error="insufficient_scope", scope="mcp:tools", resource_metadata="https://api.example.com/.well-known/oauth-protected-resource", error_description="invalid scope mcp:tools"',
			);
			return;
		}
		throw new Error("expected challenge");
	});

	it("strips header-injection characters from 403 challenge params", () => {
		try {
			raiseResourceServerChallenge(
				new APIError("FORBIDDEN", {
					message: 'bad "scope"\r\nSet-Cookie: x=y',
				}),
				"https://api.example.com",
			);
		} catch (error) {
			const apiError = error as APIError;
			const headers = new Headers(apiError.headers);
			const challenge = headers.get("WWW-Authenticate");
			expect(challenge).not.toContain("\r");
			expect(challenge).not.toContain("\n");
			expect(challenge).toContain(
				'error_description="bad \\"scope\\" Set-Cookie: x=y"',
			);
			return;
		}
		throw new Error("expected challenge");
	});

	it("emits RFC 9449 DPoP challenges for invalid DPoP proofs", () => {
		try {
			raiseResourceServerChallenge(
				new APIError("UNAUTHORIZED", {
					message: "DPoP proof header is required",
					error: "invalid_dpop_proof",
					error_description: "DPoP proof header is required",
				}),
				"https://api.example.com/mcp/tools",
				{ dpopSigningAlgorithms: ["ES256"] },
			);
		} catch (error) {
			const apiError = error as APIError;
			const headers = new Headers(apiError.headers);
			expect(headers.get("WWW-Authenticate")).toBe(
				'DPoP error="invalid_dpop_proof", error_description="DPoP proof header is required", algs="ES256"',
			);
			return;
		}
		throw new Error("expected challenge");
	});
});
