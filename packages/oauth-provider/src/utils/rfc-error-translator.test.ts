import { describe, expect, it } from "vitest";
import { translateOAuthValidationError } from "./rfc-error-translator";

function validationResponse(message: string): Response {
	return new Response(JSON.stringify({ code: "VALIDATION_ERROR", message }), {
		status: 400,
		headers: { "content-type": "application/json" },
	});
}

async function readJson(r: Response): Promise<any> {
	return r.clone().json();
}

describe("translateOAuthValidationError", () => {
	describe("passthrough", () => {
		it("returns null for non-oauth paths", async () => {
			const res = validationResponse("[body.email] invalid");
			const out = await translateOAuthValidationError({
				path: "/sign-in/email",
				response: res,
			});
			expect(out).toBeNull();
		});

		it("returns null for non-400 responses", async () => {
			const res = new Response(JSON.stringify({ foo: "bar" }), {
				status: 200,
				headers: { "content-type": "application/json" },
			});
			const out = await translateOAuthValidationError({
				path: "/oauth2/token",
				response: res,
			});
			expect(out).toBeNull();
		});

		it("returns null for non-VALIDATION_ERROR 400 responses", async () => {
			const res = new Response(
				JSON.stringify({ error: "invalid_grant", error_description: "x" }),
				{ status: 400, headers: { "content-type": "application/json" } },
			);
			const out = await translateOAuthValidationError({
				path: "/oauth2/token",
				response: res,
			});
			expect(out).toBeNull();
		});

		it("returns null for non-JSON content types", async () => {
			const res = new Response("plain text", {
				status: 400,
				headers: { "content-type": "text/plain" },
			});
			const out = await translateOAuthValidationError({
				path: "/oauth2/token",
				response: res,
			});
			expect(out).toBeNull();
		});
	});

	describe("token endpoint (RFC 6749 §5.2)", () => {
		it("maps grant_type to unsupported_grant_type", async () => {
			const out = await translateOAuthValidationError({
				path: "/oauth2/token",
				response: validationResponse(
					`[body.grant_type] Invalid option: expected one of "authorization_code"|"client_credentials"|"refresh_token"`,
				),
			});
			expect(out).not.toBeNull();
			const body = await readJson(out!);
			expect(body.error).toBe("unsupported_grant_type");
			expect(body).toHaveProperty("error_description");
			expect(out!.status).toBe(400);
		});

		it("maps scope to invalid_scope", async () => {
			const out = await translateOAuthValidationError({
				path: "/oauth2/token",
				response: validationResponse("[body.scope] must be string"),
			});
			const body = await readJson(out!);
			expect(body.error).toBe("invalid_scope");
		});

		it("maps unknown field to invalid_request", async () => {
			const out = await translateOAuthValidationError({
				path: "/oauth2/token",
				response: validationResponse("[body.code_verifier] too short"),
			});
			const body = await readJson(out!);
			expect(body.error).toBe("invalid_request");
		});

		it("sets Cache-Control: no-store (OAuth 2.1)", async () => {
			const out = await translateOAuthValidationError({
				path: "/oauth2/token",
				response: validationResponse("[body.grant_type] bad"),
			});
			expect(out!.headers.get("cache-control")).toBe("no-store");
		});

		it("does not retain the VALIDATION_ERROR code field", async () => {
			const out = await translateOAuthValidationError({
				path: "/oauth2/token",
				response: validationResponse("[body.grant_type] bad"),
			});
			const body = await readJson(out!);
			expect(body).not.toHaveProperty("code");
		});
	});

	describe("authorize endpoint (RFC 6749 §4.1.2.1)", () => {
		it("redirects to safe redirect_uri with error query params", async () => {
			const request = new Request(
				"http://auth.example.com/api/auth/oauth2/authorize?client_id=abc&redirect_uri=https%3A%2F%2Fclient.example.com%2Fcb&response_type=token&state=xyz",
			);
			const out = await translateOAuthValidationError({
				path: "/oauth2/authorize",
				response: validationResponse(
					`[query.response_type] Invalid option: expected "code"`,
				),
				request,
			});
			expect(out!.status).toBe(302);
			const loc = out!.headers.get("location")!;
			expect(loc).toContain("https://client.example.com/cb");
			expect(loc).toContain("error=unsupported_response_type");
			expect(loc).toContain("state=xyz");
		});

		it("falls back to /api/auth/error when redirect_uri is missing", async () => {
			const request = new Request(
				"http://auth.example.com/api/auth/oauth2/authorize?client_id=abc&response_type=code",
			);
			const out = await translateOAuthValidationError({
				path: "/oauth2/authorize",
				response: validationResponse(`[query.code_challenge_method] bad`),
				request,
				baseUrl: "http://auth.example.com",
			});
			const loc = out!.headers.get("location")!;
			expect(loc).toContain("/api/auth/error");
			expect(loc).toContain("error=invalid_request");
		});

		it("falls back to /api/auth/error when redirect_uri has unsafe scheme", async () => {
			const request = new Request(
				"http://auth.example.com/api/auth/oauth2/authorize?redirect_uri=javascript%3Aalert(1)",
			);
			const out = await translateOAuthValidationError({
				path: "/oauth2/authorize",
				response: validationResponse(`[query.response_type] bad`),
				request,
				baseUrl: "http://auth.example.com",
			});
			const loc = out!.headers.get("location")!;
			expect(loc).toContain("/api/auth/error");
			expect(loc).not.toContain("javascript");
		});

		it("sets Cache-Control: no-store on authorize redirects", async () => {
			const request = new Request(
				"http://auth.example.com/api/auth/oauth2/authorize",
			);
			const out = await translateOAuthValidationError({
				path: "/oauth2/authorize",
				response: validationResponse(`[query.response_type] bad`),
				request,
				baseUrl: "http://auth.example.com",
			});
			expect(out!.headers.get("cache-control")).toBe("no-store");
		});
	});

	describe("revoke endpoint (RFC 7009)", () => {
		it("maps token_type_hint to invalid_request", async () => {
			const out = await translateOAuthValidationError({
				path: "/oauth2/revoke",
				response: validationResponse(`[body.token_type_hint] bad enum`),
			});
			const body = await readJson(out!);
			expect(body.error).toBe("invalid_request");
		});
	});

	describe("introspect endpoint (RFC 7662)", () => {
		it("maps missing token to invalid_request", async () => {
			const out = await translateOAuthValidationError({
				path: "/oauth2/introspect",
				response: validationResponse(`[body.token] Required`),
			});
			const body = await readJson(out!);
			expect(body.error).toBe("invalid_request");
		});
	});

	describe("register endpoint (RFC 7591 §3.2.2)", () => {
		it("maps redirect_uris failures to invalid_redirect_uri", async () => {
			const out = await translateOAuthValidationError({
				path: "/oauth2/register",
				response: validationResponse(
					`[body.redirect_uris.0] Invalid URL scheme`,
				),
			});
			const body = await readJson(out!);
			expect(body.error).toBe("invalid_redirect_uri");
		});

		it("maps post_logout_redirect_uris failures to invalid_redirect_uri", async () => {
			const out = await translateOAuthValidationError({
				path: "/oauth2/register",
				response: validationResponse(`[body.post_logout_redirect_uris.0] bad`),
			});
			const body = await readJson(out!);
			expect(body.error).toBe("invalid_redirect_uri");
		});

		it("maps other field failures to invalid_client_metadata", async () => {
			const out = await translateOAuthValidationError({
				path: "/oauth2/register",
				response: validationResponse(`[body.grant_types.0] bad enum`),
			});
			const body = await readJson(out!);
			expect(body.error).toBe("invalid_client_metadata");
		});

		it("maps token_endpoint_auth_method enum failure to invalid_client_metadata", async () => {
			const out = await translateOAuthValidationError({
				path: "/oauth2/register",
				response: validationResponse(
					`[body.token_endpoint_auth_method] bad enum`,
				),
			});
			const body = await readJson(out!);
			expect(body.error).toBe("invalid_client_metadata");
		});
	});

	describe("malformed validation body", () => {
		it("passes through non-JSON body", async () => {
			const res = new Response("not json", {
				status: 400,
				headers: { "content-type": "application/json" },
			});
			const out = await translateOAuthValidationError({
				path: "/oauth2/token",
				response: res,
			});
			expect(out).toBeNull();
		});

		it("still classifies when message has no [body.field] prefix", async () => {
			const out = await translateOAuthValidationError({
				path: "/oauth2/token",
				response: validationResponse("Validation Error"),
			});
			const body = await readJson(out!);
			expect(body.error).toBe("invalid_request");
		});
	});
});
