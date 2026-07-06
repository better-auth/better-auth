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
