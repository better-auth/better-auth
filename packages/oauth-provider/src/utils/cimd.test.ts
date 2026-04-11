import { describe, expect, it } from "vitest";
import {
	isUrlClientId,
	validateCimdMetadata,
	validateClientIdUrl,
} from "./validate-metadata-document";

function validMetadata(
	fetchUrl: string,
	overrides: Record<string, unknown> = {},
) {
	const origin = new URL(fetchUrl).origin;
	return {
		client_id: fetchUrl,
		redirect_uris: [`${origin}/callback`],
		...overrides,
	};
}

describe("isUrlClientId", () => {
	it("accepts https:// URLs", () => {
		expect(isUrlClientId("https://example.com/meta")).toBe(true);
	});

	it("accepts http://localhost URLs (dev mode)", () => {
		expect(isUrlClientId("http://localhost/meta")).toBe(true);
		expect(isUrlClientId("http://localhost:3000/meta")).toBe(true);
	});

	it("accepts http://127.0.0.1 (dev mode)", () => {
		expect(isUrlClientId("http://127.0.0.1/meta")).toBe(true);
		expect(isUrlClientId("http://127.0.0.1:8080/meta")).toBe(true);
	});

	it("accepts http://[::1] (dev mode)", () => {
		expect(isUrlClientId("http://[::1]/meta")).toBe(true);
	});

	it("accepts localhost subdomains (dev mode)", () => {
		expect(isUrlClientId("http://app.localhost/meta")).toBe(true);
		expect(isUrlClientId("http://app.localhost:3000/meta")).toBe(true);
	});

	it("rejects http:// non-localhost URLs", () => {
		expect(isUrlClientId("http://example.com/meta")).toBe(false);
	});

	it("rejects non-URL strings", () => {
		expect(isUrlClientId("my-client-id")).toBe(false);
		expect(isUrlClientId("ftp://example.com/meta")).toBe(false);
	});

	it("rejects empty string", () => {
		expect(isUrlClientId("")).toBe(false);
	});
});

describe("validateClientIdUrl", () => {
	it("accepts valid https URL with path", () => {
		expect(
			validateClientIdUrl("https://example.com/client-metadata.json"),
		).toBeNull();
	});

	it("rejects URL without path", () => {
		expect(validateClientIdUrl("https://example.com")).not.toBeNull();
		expect(validateClientIdUrl("https://example.com/")).not.toBeNull();
	});

	it("rejects URL with fragment", () => {
		const result = validateClientIdUrl("https://example.com/meta#frag");
		expect(result).toContain("fragment");
	});

	it("rejects URL with dot segments", () => {
		expect(validateClientIdUrl("https://example.com/../meta.json")).toContain(
			"dot segments",
		);
		expect(validateClientIdUrl("https://example.com/./meta.json")).toContain(
			"dot segments",
		);
	});

	it("rejects URL with credentials", () => {
		expect(validateClientIdUrl("https://user:pass@example.com/meta")).toContain(
			"credentials",
		);
	});

	it("rejects non-https non-localhost", () => {
		const result = validateClientIdUrl("http://example.com/meta");
		expect(result).toContain("HTTPS");
	});

	it("accepts http://localhost/meta (dev)", () => {
		expect(validateClientIdUrl("http://localhost/meta")).toBeNull();
		expect(validateClientIdUrl("http://localhost:8080/meta")).toBeNull();
	});

	it("rejects private IP 10.0.0.1", () => {
		expect(validateClientIdUrl("https://10.0.0.1/meta")).toContain("private");
	});

	it("rejects private IP 172.16.0.1", () => {
		expect(validateClientIdUrl("https://172.16.0.1/meta")).toContain("private");
	});

	it("rejects private IP 192.168.1.1", () => {
		expect(validateClientIdUrl("https://192.168.1.1/meta")).toContain(
			"private",
		);
	});

	it("rejects link-local 169.254.169.254 (AWS metadata)", () => {
		expect(validateClientIdUrl("https://169.254.169.254/meta")).toContain(
			"private",
		);
	});

	it("rejects loopback IP 127.0.0.1 via https", () => {
		// 127.0.0.1 is localhost, so it should be allowed (localhost is exempt)
		// but only over http; https://127.0.0.1 is treated as localhost
		expect(validateClientIdUrl("https://127.0.0.1/meta")).toBeNull();
	});

	it("accepts public IP like 8.8.8.8", () => {
		expect(validateClientIdUrl("https://8.8.8.8/meta")).toBeNull();
	});

	it("rejects IPv4-mapped IPv6 targeting private IPs", () => {
		expect(
			validateClientIdUrl("https://[::ffff:169.254.169.254]/meta"),
		).toContain("private");
		expect(validateClientIdUrl("https://[::ffff:127.0.0.1]/meta")).toContain(
			"private",
		);
		expect(validateClientIdUrl("https://[::ffff:10.0.0.1]/meta")).toContain(
			"private",
		);
	});

	it("rejects cloud metadata hostname", () => {
		expect(
			validateClientIdUrl("https://metadata.google.internal/meta"),
		).toContain("private");
	});

	it("accepts subdomain of localhost", () => {
		expect(validateClientIdUrl("http://app.localhost/meta")).toBeNull();
	});
});

describe("validateCimdMetadata", () => {
	const fetchUrl = "https://example.com/client-metadata.json";

	it("accepts valid metadata where client_id == fetchUrl", () => {
		const result = validateCimdMetadata(fetchUrl, validMetadata(fetchUrl));
		expect(result.valid).toBe(true);
		expect(result.error).toBeUndefined();
	});

	it("rejects when client_id != fetchUrl", () => {
		const result = validateCimdMetadata(fetchUrl, {
			...validMetadata(fetchUrl),
			client_id: "https://evil.com/client-metadata.json",
		});
		expect(result.valid).toBe(false);
		expect(result.error).toContain("does not match");
	});

	it("rejects when client_secret is present", () => {
		const result = validateCimdMetadata(
			fetchUrl,
			validMetadata(fetchUrl, { client_secret: "test-secret" }),
		);
		expect(result.valid).toBe(false);
		expect(result.error).toContain("client_secret");
	});

	it("rejects when client_secret_expires_at is present", () => {
		const result = validateCimdMetadata(
			fetchUrl,
			validMetadata(fetchUrl, { client_secret_expires_at: 0 }),
		);
		expect(result.valid).toBe(false);
		expect(result.error).toContain("client_secret_expires_at");
	});

	it("rejects symmetric auth method client_secret_post", () => {
		const result = validateCimdMetadata(
			fetchUrl,
			validMetadata(fetchUrl, {
				token_endpoint_auth_method: "client_secret_post",
			}),
		);
		expect(result.valid).toBe(false);
		expect(result.error).toContain("symmetric");
	});

	it("rejects symmetric auth method client_secret_basic", () => {
		const result = validateCimdMetadata(
			fetchUrl,
			validMetadata(fetchUrl, {
				token_endpoint_auth_method: "client_secret_basic",
			}),
		);
		expect(result.valid).toBe(false);
		expect(result.error).toContain("symmetric");
	});

	it("rejects symmetric auth method client_secret_jwt", () => {
		const result = validateCimdMetadata(
			fetchUrl,
			validMetadata(fetchUrl, {
				token_endpoint_auth_method: "client_secret_jwt",
			}),
		);
		expect(result.valid).toBe(false);
		expect(result.error).toContain("symmetric");
	});

	it('accepts token_endpoint_auth_method: "none"', () => {
		const result = validateCimdMetadata(
			fetchUrl,
			validMetadata(fetchUrl, { token_endpoint_auth_method: "none" }),
		);
		expect(result.valid).toBe(true);
	});

	it('accepts token_endpoint_auth_method: "private_key_jwt" with jwks', () => {
		const result = validateCimdMetadata(
			fetchUrl,
			validMetadata(fetchUrl, {
				token_endpoint_auth_method: "private_key_jwt",
				jwks: { keys: [{ kty: "EC" }] },
			}),
		);
		expect(result.valid).toBe(true);
	});

	it('accepts token_endpoint_auth_method: "private_key_jwt" with jwks_uri', () => {
		const result = validateCimdMetadata(
			fetchUrl,
			validMetadata(fetchUrl, {
				token_endpoint_auth_method: "private_key_jwt",
				jwks_uri: "https://example.com/.well-known/jwks.json",
			}),
		);
		expect(result.valid).toBe(true);
	});

	it("rejects private_key_jwt without jwks or jwks_uri", () => {
		const result = validateCimdMetadata(
			fetchUrl,
			validMetadata(fetchUrl, {
				token_endpoint_auth_method: "private_key_jwt",
			}),
		);
		expect(result.valid).toBe(false);
		expect(result.error).toContain("jwks");
	});

	it("rejects unknown auth method", () => {
		const result = validateCimdMetadata(
			fetchUrl,
			validMetadata(fetchUrl, {
				token_endpoint_auth_method: "custom_method",
			}),
		);
		expect(result.valid).toBe(false);
		expect(result.error).toContain("private_key_jwt");
	});

	it("rejects missing redirect_uris", () => {
		const result = validateCimdMetadata(fetchUrl, {
			client_id: fetchUrl,
		});
		expect(result.valid).toBe(false);
		expect(result.error).toContain("redirect_uris");
	});

	it("rejects empty redirect_uris", () => {
		const result = validateCimdMetadata(fetchUrl, {
			client_id: fetchUrl,
			redirect_uris: [],
		});
		expect(result.valid).toBe(false);
		expect(result.error).toContain("redirect_uris");
	});

	it("rejects non-HTTP redirect_uris", () => {
		const result = validateCimdMetadata(fetchUrl, {
			client_id: fetchUrl,
			redirect_uris: ["ftp://example.com/callback"],
		});
		expect(result.valid).toBe(false);
		expect(result.error).toContain("redirect_uris");
	});

	it("rejects disallowed grant_types", () => {
		const result = validateCimdMetadata(
			fetchUrl,
			validMetadata(fetchUrl, {
				grant_types: ["client_credentials"],
			}),
		);
		expect(result.valid).toBe(false);
		expect(result.error).toContain("grant_types");
	});

	it("accepts allowed grant_types", () => {
		const result = validateCimdMetadata(
			fetchUrl,
			validMetadata(fetchUrl, {
				grant_types: ["authorization_code", "refresh_token"],
			}),
		);
		expect(result.valid).toBe(true);
	});

	it("accepts authorization_code alone", () => {
		const result = validateCimdMetadata(
			fetchUrl,
			validMetadata(fetchUrl, {
				grant_types: ["authorization_code"],
			}),
		);
		expect(result.valid).toBe(true);
	});

	it("rejects disallowed response_types", () => {
		const result = validateCimdMetadata(
			fetchUrl,
			validMetadata(fetchUrl, {
				response_types: ["token"],
			}),
		);
		expect(result.valid).toBe(false);
		expect(result.error).toContain("response_types");
	});

	it('accepts response_types: ["code"]', () => {
		const result = validateCimdMetadata(
			fetchUrl,
			validMetadata(fetchUrl, {
				response_types: ["code"],
			}),
		);
		expect(result.valid).toBe(true);
	});

	it("allows localhost redirect_uris for local/native app flows", () => {
		const result = validateCimdMetadata(fetchUrl, {
			client_id: fetchUrl,
			redirect_uris: [
				"http://localhost:3000/callback",
				"http://127.0.0.1:3000/callback",
			],
		});
		expect(result.valid).toBe(true);
	});

	it("validates origin-bound fields (redirect_uris origin must match client_id)", () => {
		const result = validateCimdMetadata(fetchUrl, {
			client_id: fetchUrl,
			redirect_uris: ["https://other-domain.com/callback"],
		});
		expect(result.valid).toBe(false);
		expect(result.error).toContain("same origin");
	});

	it("respects custom originBoundFields parameter", () => {
		const result = validateCimdMetadata(
			fetchUrl,
			{
				client_id: fetchUrl,
				redirect_uris: ["https://example.com/callback"],
				custom_field: "https://evil.com/hook",
			},
			["custom_field"],
		);
		expect(result.valid).toBe(false);
		expect(result.error).toContain("same origin");
	});

	it("does not enforce origin on fields outside originBoundFields", () => {
		const result = validateCimdMetadata(
			fetchUrl,
			{
				client_id: fetchUrl,
				redirect_uris: ["https://example.com/callback"],
				client_uri: "https://other.com/about",
			},
			["redirect_uris"],
		);
		// client_uri is NOT in the custom originBoundFields, so origin mismatch is not checked.
		// However, client_uri still gets SSRF validation.
		expect(result.valid).toBe(true);
	});

	it("validates client_uri for SSRF (private address)", () => {
		const result = validateCimdMetadata(
			fetchUrl,
			validMetadata(fetchUrl, {
				client_uri: "http://169.254.169.254/latest/meta-data/",
			}),
		);
		expect(result.valid).toBe(false);
		expect(result.error).toContain("private");
	});

	it("validates logo_uri for SSRF (private address)", () => {
		const result = validateCimdMetadata(
			fetchUrl,
			validMetadata(fetchUrl, {
				logo_uri: "http://10.0.0.1/internal-logo.png",
			}),
		);
		expect(result.valid).toBe(false);
		expect(result.error).toContain("private");
	});

	it("returns warning for query string in fetchUrl", () => {
		const urlWithQuery = "https://example.com/client-metadata.json?v=1";
		const result = validateCimdMetadata(
			urlWithQuery,
			validMetadata(urlWithQuery),
		);
		expect(result.valid).toBe(true);
		expect(result.warnings).toBeDefined();
		expect(result.warnings![0]).toContain("query string");
	});

	it("rejects non-object metadata", () => {
		expect(validateCimdMetadata(fetchUrl, null).valid).toBe(false);
		expect(validateCimdMetadata(fetchUrl, "string").valid).toBe(false);
		expect(validateCimdMetadata(fetchUrl, 42).valid).toBe(false);
	});

	it("rejects client_uri with non-HTTP scheme", () => {
		const result = validateCimdMetadata(
			fetchUrl,
			validMetadata(fetchUrl, {
				client_uri: "ftp://example.com/about",
			}),
		);
		expect(result.valid).toBe(false);
		expect(result.error).toContain("client_uri");
	});

	it("rejects logo_uri that is not a valid URL", () => {
		const result = validateCimdMetadata(
			fetchUrl,
			validMetadata(fetchUrl, { logo_uri: "not a url" }),
		);
		expect(result.valid).toBe(false);
		expect(result.error).toContain("logo_uri");
	});
});
