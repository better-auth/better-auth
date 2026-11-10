import { createInsufficientScopeError } from "better-auth/oauth2";
import { APIError } from "better-call";
import { describe, expect, it } from "vitest";
import { createResourceServerChallenge } from "./resource-challenge";

function catchChallenge(resource: string | string[]) {
	return createResourceServerChallenge(
		new APIError("UNAUTHORIZED", { message: "missing bearer token" }),
		resource,
	) as APIError;
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
		const apiError = createResourceServerChallenge(
			createInsufficientScopeError(["files:write", "files:delete"]),
			"https://api.example.com/mcp/tools",
		) as APIError;
		const headers = new Headers(apiError.headers);
		expect(apiError.status).toBe("FORBIDDEN");
		expect(apiError.statusCode).toBe(403);
		expect(headers.get("WWW-Authenticate")).toBe(
			'Bearer error="insufficient_scope", scope="files:write files:delete", resource_metadata="https://api.example.com/.well-known/oauth-protected-resource/mcp/tools", error_description="access token is missing required scope: files:write files:delete"',
		);
	});

	it("challenges for the scopes the token lacks, not the configured hint", () => {
		// The hint tells an unauthenticated client where to start; re-authorizing
		// only helps if the challenge names what is actually missing.
		const challenge = createResourceServerChallenge(
			createInsufficientScopeError(["files:write"]),
			"https://api.example.com",
			{ challengeScopes: ["files:read"] },
		) as APIError;
		const headers = new Headers(challenge.headers);
		expect(headers.get("WWW-Authenticate")).toContain('scope="files:write"');
	});

	it("propagates a forbidden error that is not a scope failure", () => {
		// A permission denial re-authorizing cannot fix must stay a plain 403;
		// challenging would send the user through consent to no effect.
		const denial = new APIError("FORBIDDEN", {
			message: "user is not a member of this organization",
		});
		expect(
			createResourceServerChallenge(denial, "https://api.example.com"),
		).toBeUndefined();
		expect(new Headers(denial.headers).get("WWW-Authenticate")).toBeNull();
	});

	it("resolves a mapped resource_metadata URL in a 403 challenge", () => {
		const challenge = createResourceServerChallenge(
			createInsufficientScopeError(["mcp:tools"]),
			"urn:example:mcp",
			{
				resourceMetadataMappings: {
					"urn:example:mcp":
						"https://api.example.com/.well-known/oauth-protected-resource",
				},
			},
		) as APIError;
		const headers = new Headers(challenge.headers);
		expect(challenge.statusCode).toBe(403);
		expect(headers.get("WWW-Authenticate")).toBe(
			'Bearer error="insufficient_scope", scope="mcp:tools", resource_metadata="https://api.example.com/.well-known/oauth-protected-resource", error_description="access token is missing required scope: mcp:tools"',
		);
	});

	it("rejects header-injection characters in challenge params", () => {
		const insufficientScopeError = createInsufficientScopeError([
			"files:write",
		]);
		(
			insufficientScopeError.body as {
				error_description: string;
			}
		).error_description = 'bad "scope"\r\nSet-Cookie: x=y';

		expect(() =>
			createResourceServerChallenge(
				insufficientScopeError,
				"https://api.example.com",
			),
		).toThrow("invalid error_description");
	});

	it("retains serialization-time validation for a mutated typed scope error", () => {
		const insufficientScopeError = createInsufficientScopeError([
			"files:write",
		]);
		(
			insufficientScopeError.body as {
				error_description: string;
			}
		).error_description = "café";

		expect(() =>
			createResourceServerChallenge(
				insufficientScopeError,
				"https://api.example.com",
			),
		).toThrow("invalid error_description");
	});

	it.each([42, null])(
		"rejects a non-string insufficient-scope error_description during serialization: %j",
		(description) => {
			const insufficientScopeError = createInsufficientScopeError([
				"files:write",
			]);
			if (!insufficientScopeError.body) {
				throw new Error("insufficient-scope error body was not created");
			}
			Reflect.set(
				insufficientScopeError.body,
				"error_description",
				description,
			);

			expect(() =>
				createResourceServerChallenge(
					insufficientScopeError,
					"https://api.example.com",
				),
			).toThrow(new TypeError("invalid error_description"));
		},
	);

	it("rejects invalid configured challenge scope tokens", () => {
		expect(() =>
			createResourceServerChallenge(
				new APIError("UNAUTHORIZED", { message: "missing bearer token" }),
				"https://api.example.com",
				{ challengeScopes: ["files:read injected"] },
			),
		).toThrow("invalid challenge scope");
	});

	it("emits RFC 9449 DPoP challenges for invalid DPoP proofs", () => {
		const challenge = createResourceServerChallenge(
			new APIError("UNAUTHORIZED", {
				message: "DPoP proof header is required",
				error: "invalid_dpop_proof",
				error_description: "DPoP proof header is required",
			}),
			"https://api.example.com/mcp/tools",
			{ dpopSigningAlgorithms: ["ES256"] },
		) as APIError;
		const headers = new Headers(challenge.headers);
		expect(headers.get("WWW-Authenticate")).toBe(
			'DPoP error="invalid_dpop_proof", error_description="DPoP proof header is required", algs="ES256"',
		);
	});

	/**
	 * @see https://datatracker.ietf.org/doc/html/rfc9449#section-9
	 */
	it("keeps the nonce on an RFC 9449 use_dpop_nonce challenge", () => {
		const challenge = createResourceServerChallenge(
			new APIError(
				"UNAUTHORIZED",
				{
					message: "DPoP proof must include a server-provided nonce",
					error: "use_dpop_nonce",
					error_description: "DPoP proof must include a server-provided nonce",
				},
				{ "DPoP-Nonce": "fresh-nonce" },
			),
			"https://api.example.com/mcp/tools",
			{ dpopSigningAlgorithms: ["ES256"] },
		) as APIError;
		const headers = new Headers(challenge.headers);
		expect(challenge.statusCode).toBe(401);
		expect(headers.get("WWW-Authenticate")).toBe(
			'DPoP error="use_dpop_nonce", error_description="DPoP proof must include a server-provided nonce", algs="ES256"',
		);
		expect(headers.get("DPoP-Nonce")).toBe("fresh-nonce");
		expect(headers.get("Cache-Control")).toBe("no-store");
		// `WWW-Authenticate` is not CORS-safelisted either, and a browser client
		// needs it to see that it must retry with the nonce.
		expect(headers.get("Access-Control-Expose-Headers")).toBe(
			"DPoP-Nonce, WWW-Authenticate",
		);
	});

	it("keeps the headers the error already exposes", () => {
		const challenge = createResourceServerChallenge(
			new APIError(
				"UNAUTHORIZED",
				{
					message: "DPoP proof nonce is invalid or expired",
					error: "use_dpop_nonce",
					error_description: "DPoP proof nonce is invalid or expired",
				},
				{
					"DPoP-Nonce": "fresh-nonce",
					"Access-Control-Expose-Headers": "X-Request-Id, DPoP-Nonce",
				},
			),
			"https://api.example.com",
		) as APIError;
		expect(
			new Headers(challenge.headers).get("Access-Control-Expose-Headers"),
		).toBe("X-Request-Id, DPoP-Nonce, WWW-Authenticate");
	});

	it("leaves a DPoP challenge without a nonce cacheable and unexposed", () => {
		const headers = new Headers(
			(
				createResourceServerChallenge(
					new APIError("UNAUTHORIZED", {
						message: "DPoP proof header is required",
						error: "invalid_dpop_proof",
						error_description: "DPoP proof header is required",
					}),
					"https://api.example.com",
				) as APIError
			).headers,
		);
		expect(headers.get("Cache-Control")).toBeNull();
		expect(headers.get("Access-Control-Expose-Headers")).toBeNull();
	});

	it.each(['bad "quote"', "bad\\slash", "café", "bad\r\ninjected"])(
		"rejects an invalid DPoP error_description: %s",
		(description) => {
			expect(() =>
				createResourceServerChallenge(
					new APIError("UNAUTHORIZED", {
						message: description,
						error: "invalid_dpop_proof",
						error_description: description,
					}),
					"https://api.example.com",
				),
			).toThrow("invalid error_description");
		},
	);
});
