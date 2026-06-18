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

	it("matches mixed-case URL schemes (schemes are case-insensitive)", () => {
		expect(isUrlClientId("HTTPS://example.com/meta")).toBe(true);
		expect(isUrlClientId("HtTpS://example.com/meta")).toBe(true);
		expect(
			isUrlClientId("HTTP://localhost/meta", { allowLoopback: true }),
		).toBe(true);
	});

	it("matches https:// loopback URLs regardless of allowLoopback", () => {
		expect(isUrlClientId("https://127.0.0.1/meta")).toBe(true);
		expect(isUrlClientId("https://localhost/meta")).toBe(true);
	});

	it("does not match http:// loopback without allowLoopback", () => {
		expect(isUrlClientId("http://localhost/meta")).toBe(false);
		expect(isUrlClientId("http://127.0.0.1:8080/meta")).toBe(false);
		expect(isUrlClientId("http://[::1]/meta")).toBe(false);
		expect(isUrlClientId("http://app.localhost/meta")).toBe(false);
	});

	it("matches http:// loopback when allowLoopback is set (dev mode)", () => {
		const dev = { allowLoopback: true };
		expect(isUrlClientId("http://localhost/meta", dev)).toBe(true);
		expect(isUrlClientId("http://localhost:3000/meta", dev)).toBe(true);
		expect(isUrlClientId("http://127.0.0.1/meta", dev)).toBe(true);
		expect(isUrlClientId("http://127.0.0.1:8080/meta", dev)).toBe(true);
		expect(isUrlClientId("http://[::1]/meta", dev)).toBe(true);
		expect(isUrlClientId("http://app.localhost/meta", dev)).toBe(true);
		expect(isUrlClientId("http://app.localhost:3000/meta", dev)).toBe(true);
	});

	it("rejects http:// non-loopback even with allowLoopback", () => {
		expect(isUrlClientId("http://example.com/meta")).toBe(false);
		expect(
			isUrlClientId("http://example.com/meta", { allowLoopback: true }),
		).toBe(false);
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

	it("rejects non-https non-loopback", () => {
		const result = validateClientIdUrl("http://example.com/meta");
		expect(result).toContain("HTTPS");
	});

	it("rejects http://localhost without allowLoopback", () => {
		expect(validateClientIdUrl("http://localhost/meta")).not.toBeNull();
		expect(validateClientIdUrl("http://localhost:8080/meta")).not.toBeNull();
	});

	it("accepts http://localhost with allowLoopback (dev)", () => {
		const dev = { allowLoopback: true };
		expect(validateClientIdUrl("http://localhost/meta", dev)).toBeNull();
		expect(validateClientIdUrl("http://localhost:8080/meta", dev)).toBeNull();
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

	it("rejects loopback IP 127.0.0.1 via https without allowLoopback", () => {
		expect(validateClientIdUrl("https://127.0.0.1/meta")).not.toBeNull();
		expect(validateClientIdUrl("https://127.0.0.1:8080/meta")).not.toBeNull();
	});

	it("accepts loopback over https/http with allowLoopback (dev)", () => {
		const dev = { allowLoopback: true };
		expect(validateClientIdUrl("https://127.0.0.1:8080/meta", dev)).toBeNull();
		expect(validateClientIdUrl("http://127.0.0.1:8080/meta", dev)).toBeNull();
		expect(validateClientIdUrl("https://localhost/meta", dev)).toBeNull();
	});

	it("accepts public IP like 8.8.8.8", () => {
		expect(validateClientIdUrl("https://8.8.8.8/meta")).toBeNull();
	});

	it("rejects 6to4 anycast relay 192.88.99.1 (RFC 7526 deprecated)", () => {
		expect(validateClientIdUrl("https://192.88.99.1/meta")).toContain(
			"private",
		);
	});

	it("rejects multicast addresses (RFC 5771, 224.0.0.0/4)", () => {
		expect(validateClientIdUrl("https://224.0.0.1/meta")).toContain("private");
		expect(validateClientIdUrl("https://239.255.255.250/meta")).toContain(
			"private",
		);
	});

	it("rejects reserved/future-use and broadcast addresses (240.0.0.0/4)", () => {
		expect(validateClientIdUrl("https://240.0.0.1/meta")).toContain("private");
		expect(validateClientIdUrl("https://255.255.255.255/meta")).toContain(
			"private",
		);
	});

	it("rejects IPv4-mapped IPv6 targeting private/link-local IPs", () => {
		expect(
			validateClientIdUrl("https://[::ffff:169.254.169.254]/meta"),
		).toContain("private");
		expect(validateClientIdUrl("https://[::ffff:10.0.0.1]/meta")).toContain(
			"private",
		);
		// IPv4-mapped loopback classifies as loopback (not "private"); still rejected.
		expect(
			validateClientIdUrl("https://[::ffff:127.0.0.1]/meta"),
		).not.toBeNull();
	});

	it("rejects cloud metadata hostname", () => {
		expect(
			validateClientIdUrl("https://metadata.google.internal/meta"),
		).toContain("private");
	});

	it("rejects subdomain of localhost without allowLoopback", () => {
		expect(validateClientIdUrl("http://app.localhost/meta")).not.toBeNull();
	});

	it("accepts subdomain of localhost with allowLoopback (dev)", () => {
		expect(
			validateClientIdUrl("http://app.localhost/meta", { allowLoopback: true }),
		).toBeNull();
	});

	it("rejects IPv6 unspecified [::] (0.0.0.0-day class)", () => {
		expect(validateClientIdUrl("https://[::]/meta")).not.toBeNull();
	});

	it("rejects trailing-dot cloud-metadata FQDN", () => {
		expect(
			validateClientIdUrl("https://metadata.google.internal./meta"),
		).not.toBeNull();
	});

	it("rejects additional cloud-metadata FQDNs", () => {
		expect(validateClientIdUrl("https://metadata.goog/meta")).not.toBeNull();
		expect(validateClientIdUrl("https://metadata/meta")).not.toBeNull();
		expect(validateClientIdUrl("https://instance-data/meta")).not.toBeNull();
		expect(
			validateClientIdUrl("https://instance-data.ec2.internal/meta"),
		).not.toBeNull();
	});

	it("rejects IPv6 tunnel forms embedding private/IMDS IPv4 (6to4, NAT64, Teredo)", () => {
		expect(validateClientIdUrl("https://[2002:7f00:1::]/meta")).not.toBeNull();
		expect(
			validateClientIdUrl("https://[64:ff9b::7f00:1]/meta"),
		).not.toBeNull();
		expect(
			validateClientIdUrl("https://[2001:0:0:0:0:0:7f00:1]/meta"),
		).not.toBeNull();
	});

	it("rejects deprecated IPv4-compatible IPv6 embedding loopback/IMDS/private", () => {
		// new URL() normalizes [::127.0.0.1] to [::7f00:1] (no ::ffff: marker).
		expect(validateClientIdUrl("https://[::127.0.0.1]/meta")).not.toBeNull();
		expect(
			validateClientIdUrl("https://[::169.254.169.254]/meta"),
		).not.toBeNull();
		expect(validateClientIdUrl("https://[::10.0.0.1]/meta")).not.toBeNull();
	});

	it("rejects percent-encoded dot segments", () => {
		expect(validateClientIdUrl("https://example.com/%2e%2e/meta")).toContain(
			"dot segments",
		);
		expect(validateClientIdUrl("https://example.com/%2e/meta")).toContain(
			"dot segments",
		);
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

	it("rejects loopback URL on a non-redirect field (client_uri)", () => {
		// The loopback exception applies only to redirect URI fields; a loopback
		// client_uri is rejected by the SSRF check.
		const result = validateCimdMetadata(fetchUrl, {
			client_id: fetchUrl,
			redirect_uris: ["https://example.com/callback"],
			client_uri: "http://localhost:3000/about",
		});
		expect(result.valid).toBe(false);
		expect(result.error).toContain("private");
	});

	it("accepts localhost URL on post_logout_redirect_uris", () => {
		// post_logout_redirect_uris also qualifies as a redirect URI field.
		const result = validateCimdMetadata(fetchUrl, {
			client_id: fetchUrl,
			redirect_uris: ["https://example.com/callback"],
			post_logout_redirect_uris: ["http://localhost:3000/logout"],
		});
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

	it("rejects IPv4-compatible IPv6 in logo_uri (SSRF)", () => {
		const result = validateCimdMetadata(
			fetchUrl,
			validMetadata(fetchUrl, {
				logo_uri: "https://[::169.254.169.254]/logo.png",
			}),
		);
		expect(result.valid).toBe(false);
		expect(result.error).toContain("private");
	});

	it("accepts public client_uri and logo_uri", () => {
		const result = validateCimdMetadata(
			fetchUrl,
			validMetadata(fetchUrl, {
				client_uri: "https://example.com/about",
				logo_uri: "https://cdn.example.com/logo.png",
			}),
		);
		expect(result.valid).toBe(true);
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
