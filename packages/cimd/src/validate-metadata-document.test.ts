import { describe, expect, it } from "vitest";
import {
	isCimdClientIdUrlCandidate,
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
		client_name: "Example Client",
		redirect_uris: [`${origin}/callback`],
		...overrides,
	};
}

describe("isCimdClientIdUrlCandidate", () => {
	it("accepts https:// URLs", () => {
		expect(isCimdClientIdUrlCandidate("https://example.com/meta")).toBe(true);
	});

	it("matches mixed-case URL schemes (schemes are case-insensitive)", () => {
		expect(isCimdClientIdUrlCandidate("HTTPS://example.com/meta")).toBe(true);
		expect(isCimdClientIdUrlCandidate("HtTpS://example.com/meta")).toBe(true);
	});

	it("routes https:// loopback-shaped IDs to validation", () => {
		expect(isCimdClientIdUrlCandidate("https://127.0.0.1/meta")).toBe(true);
		expect(isCimdClientIdUrlCandidate("https://localhost/meta")).toBe(true);
	});

	it("does not match http:// loopback", () => {
		expect(isCimdClientIdUrlCandidate("http://localhost/meta")).toBe(false);
		expect(isCimdClientIdUrlCandidate("http://127.0.0.1:8080/meta")).toBe(
			false,
		);
		expect(isCimdClientIdUrlCandidate("http://[::1]/meta")).toBe(false);
		expect(isCimdClientIdUrlCandidate("http://app.localhost/meta")).toBe(false);
	});

	it("rejects http:// non-loopback", () => {
		expect(isCimdClientIdUrlCandidate("http://example.com/meta")).toBe(false);
	});

	it("rejects non-URL strings", () => {
		expect(isCimdClientIdUrlCandidate("my-client-id")).toBe(false);
		expect(isCimdClientIdUrlCandidate("ftp://example.com/meta")).toBe(false);
	});

	it("rejects empty string", () => {
		expect(isCimdClientIdUrlCandidate("")).toBe(false);
	});
});

describe("validateClientIdUrl", () => {
	it("accepts valid https URL with path", () => {
		expect(
			validateClientIdUrl("https://example.com/client-metadata.json"),
		).toBeNull();
	});

	it("requires an explicit root path for draft-02 validation", () => {
		expect(validateClientIdUrl("https://example.com")).toContain(
			"explicit path",
		);
		expect(validateClientIdUrl("https://example.com/")).toBeNull();
	});

	it.each([
		"https:example.com/client.json",
		"https:/example.com/client.json",
		"https:///example.com/client.json",
		"https:////example.com/client.json",
		"https:\\\\example.com\\client.json",
		"https://example.com\\client.json",
	])("rejects malformed raw HTTPS authority form: %s", (clientId) => {
		expect(validateClientIdUrl(clientId)).toContain(
			"explicit HTTPS authority form",
		);
	});

	it("accepts case-insensitive HTTPS scheme syntax", () => {
		expect(validateClientIdUrl("HTTPS://example.com/client.json")).toBeNull();
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

	it("rejects http://localhost", () => {
		expect(validateClientIdUrl("http://localhost/meta")).not.toBeNull();
		expect(validateClientIdUrl("http://localhost:8080/meta")).not.toBeNull();
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
		expect(validateClientIdUrl("https://127.0.0.1/meta")).not.toBeNull();
		expect(validateClientIdUrl("https://127.0.0.1:8080/meta")).not.toBeNull();
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

	it("rejects subdomain of localhost", () => {
		expect(validateClientIdUrl("http://app.localhost/meta")).not.toBeNull();
		expect(validateClientIdUrl("https://app.localhost/meta")).not.toBeNull();
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

	it("requires a non-empty client_name", () => {
		for (const clientName of [undefined, "", "   "]) {
			const metadata: Record<string, unknown> = validMetadata(fetchUrl);
			if (clientName === undefined) {
				metadata.client_name = undefined;
			} else {
				metadata.client_name = clientName;
			}
			const result = validateCimdMetadata(fetchUrl, metadata, {
				metadataProfile: "mcp-2026-07-28",
			});
			expect(result.valid).toBe(false);
			expect(result.error).toContain("client_name");
		}
	});

	it("preserves surrounding client_name whitespace after validation", () => {
		const result = validateCimdMetadata(
			fetchUrl,
			validMetadata(fetchUrl, { client_name: "  Display Name  " }),
		);
		expect(result.error).toBeUndefined();
		expect(result.valid).toBe(true);
		expect(result.metadata?.client_name).toBe("  Display Name  ");
	});

	it("rejects malformed shared client metadata before CIMD policy checks", () => {
		for (const malformed of [
			{ application_type: "desktop" },
			{ contacts: "security@example.com" },
			{ scope: ["openid"] },
			{ dpop_bound_access_tokens: "true" },
		]) {
			const result = validateCimdMetadata(
				fetchUrl,
				validMetadata(fetchUrl, malformed),
			);
			expect(result.valid).toBe(false);
		}
	});

	it("accepts valid metadata where client_id == fetchUrl", () => {
		const result = validateCimdMetadata(fetchUrl, validMetadata(fetchUrl));
		expect(result.valid).toBe(true);
		expect(result.error).toBeUndefined();
	});

	it("accepts generic metadata without display or redirect fields for a supported non-redirect grant", () => {
		const result = validateCimdMetadata(fetchUrl, {
			client_id: fetchUrl,
			grant_types: ["client_credentials"],
			token_endpoint_auth_method: "private_key_jwt",
			jwks: {
				keys: [
					{
						kty: "EC",
						crv: "P-256",
						x: "f83OJ3D2xF4BM-Y5uP1oahSjXdY9tAe3hoTb3QuA7qM",
						y: "x_FEzRu9wNL7LMBTlSTd4vP7qB27FjGCFZB-RcIEpV0",
					},
				],
			},
		});

		expect(result.valid).toBe(true);
		expect(result.metadata?.client_name).toBeUndefined();
		expect(result.metadata?.redirect_uris).toBeUndefined();
	});

	it.each([
		{
			name: "client_name",
			metadata: {
				client_id: fetchUrl,
				redirect_uris: ["https://example.com/callback"],
			},
		},
		{
			name: "redirect_uris",
			metadata: {
				client_id: fetchUrl,
				client_name: "MCP Client",
			},
		},
	])("requires $name for the MCP 2026-07-28 metadata profile", ({
		metadata,
		name,
	}) => {
		const result = validateCimdMetadata(fetchUrl, metadata, {
			metadataProfile: "mcp-2026-07-28",
		});

		expect(result.valid).toBe(false);
		expect(result.error).toContain(name);
	});

	it("rejects when client_id != fetchUrl", () => {
		const result = validateCimdMetadata(fetchUrl, {
			...validMetadata(fetchUrl),
			client_id: "https://evil.com/client-metadata.json",
		});
		expect(result.valid).toBe(false);
		expect(result.error).toContain("does not match");
	});

	it("compares client_id to the fetched URL without trimming", () => {
		for (const clientId of [` ${fetchUrl}`, `${fetchUrl} `]) {
			const result = validateCimdMetadata(
				fetchUrl,
				validMetadata(fetchUrl, { client_id: clientId }),
			);
			expect(result.valid).toBe(false);
			expect(result.error).toContain("does not match");
		}
	});

	it("uses simple-string comparison when one client_id has an explicit default port", () => {
		const explicitPortUrl = "https://example.com:443/client-metadata.json";
		const result = validateCimdMetadata(
			explicitPortUrl,
			validMetadata(explicitPortUrl, {
				client_id: "https://example.com/client-metadata.json",
			}),
		);

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

	it("rejects recognized credential, privilege, and server-control fields", () => {
		for (const field of [
			"disabled",
			"skip_consent",
			"enable_end_session",
			"require_pkce",
			"reference_id",
			"user_id",
			"client_id_issued_at",
			"resources",
			"skipConsent",
			"enableEndSession",
			"requirePKCE",
			"clientSecret",
			"referenceId",
			"userId",
			"clientId",
			"applicationType",
			"tokenEndpointAuthMethod",
			"redirectUris",
			"postLogoutRedirectUris",
			"grantTypes",
			"responseTypes",
			"scopes",
			"expiresAt",
			"createdAt",
			"updatedAt",
			"softwareId",
			"softwareVersion",
			"softwareStatement",
			"backchannelLogoutUri",
			"backchannelLogoutSessionRequired",
			"jwksUri",
			"dpopBoundAccessTokens",
			"subjectType",
		]) {
			const result = validateCimdMetadata(
				fetchUrl,
				validMetadata(fetchUrl, { [field]: true }),
			);
			expect(result.valid).toBe(false);
			expect(result.error).toContain(field);
		}
	});

	it("ignores unknown members and generic internal storage aliases", () => {
		const result = validateCimdMetadata(
			fetchUrl,
			validMetadata(fetchUrl, {
				name: "Internal alias",
				uri: "https://ignored.example.com",
				icon: "https://ignored.example.com/icon.png",
				tos: "https://ignored.example.com/tos",
				policy: "https://ignored.example.com/policy",
				metadata: { privileged: true },
				clientCredentialsScopes: ["admin"],
				client_credentials_scopes: ["admin"],
				public: true,
				type: "web",
				"https://example.com/oauth/custom": {
					display_mode: "compact",
				},
			}),
		);

		expect(result.error).toBeUndefined();
		expect(result.valid).toBe(true);
		for (const field of [
			"name",
			"uri",
			"icon",
			"tos",
			"policy",
			"metadata",
			"clientCredentialsScopes",
			"client_credentials_scopes",
			"public",
			"type",
			"https://example.com/oauth/custom",
		]) {
			expect(result.metadata).not.toHaveProperty(field);
		}
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
				jwks: {
					keys: [
						{
							kty: "EC",
							crv: "P-256",
							x: "f83OJ3D2xF4BM-Y5uP1oahSjXdY9tAe3hoTb3QuA7qM",
							y: "x_FEzRu9wNL7LMBTlSTd4vP7qB27FjGCFZB-RcIEpV0",
						},
					],
				},
			}),
		);
		expect(result.valid).toBe(true);
	});

	it("rejects a bare JWK array in generic CIMD metadata", () => {
		const result = validateCimdMetadata(
			fetchUrl,
			validMetadata(fetchUrl, {
				token_endpoint_auth_method: "private_key_jwt",
				jwks: [{ kty: "RSA", n: "modulus", e: "AQAB" }],
			}),
		);

		expect(result.valid).toBe(false);
		expect(result.error).toContain("jwks");
	});

	it("rejects private or malformed public key metadata", () => {
		for (const jwks of [
			{ keys: [] },
			{ keys: [{ kty: "oct", k: "secret" }] },
			{ keys: [{ kty: "EC", crv: "P-256", x: "x", y: "y", d: "private" }] },
			{ keys: [{ kty: "OKP", crv: "Ed25519", x: "x", d: "private" }] },
			{ keys: [{ kty: "EC" }] },
			{ keys: [{ kty: "RSA", n: "n", e: "AQAB", alg: "HS256" }] },
			{
				keys: [{ kty: "EC", crv: "P-256", x: "x", y: "y", alg: "RS256" }],
			},
			{
				keys: [{ kty: "EC", crv: "P-256", x: "x", y: "y", alg: "ES384" }],
			},
			{
				keys: [{ kty: "OKP", crv: "Ed448", x: "x", alg: "EdDSA" }],
			},
		]) {
			const result = validateCimdMetadata(
				fetchUrl,
				validMetadata(fetchUrl, {
					token_endpoint_auth_method: "private_key_jwt",
					jwks,
				}),
			);
			expect(result.valid).toBe(false);
			expect(result.error).toContain("jwks");
		}
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

	it.each([
		"https://user:password@example.com/.well-known/jwks.json",
		"https://example.com/.well-known/jwks.json#keys",
	])("rejects an unsafe jwks_uri before persistence: %s", (jwksUri) => {
		const result = validateCimdMetadata(
			fetchUrl,
			validMetadata(fetchUrl, {
				token_endpoint_auth_method: "private_key_jwt",
				jwks_uri: jwksUri,
			}),
		);
		expect(result.valid).toBe(false);
		expect(result.error).toContain("jwks_uri");
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
		const result = validateCimdMetadata(
			fetchUrl,
			{
				client_id: fetchUrl,
				client_name: "Missing Redirect Client",
			},
			{ metadataProfile: "mcp-2026-07-28" },
		);
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

	it("rejects redirect_uris outside HTTP(S) and private-use forms", () => {
		const result = validateCimdMetadata(fetchUrl, {
			client_id: fetchUrl,
			client_name: "Invalid Redirect Client",
			redirect_uris: ["ftp://example.com/callback"],
		});
		expect(result.valid).toBe(false);
		expect(result.error).toContain("redirect_uris");
	});

	it("accepts an authority-free private-use redirect URI", () => {
		const result = validateCimdMetadata(fetchUrl, {
			client_id: fetchUrl,
			client_name: "Private-use Client",
			redirect_uris: ["com.example.app:/callback"],
		});
		expect(result.valid).toBe(true);
	});

	it("rejects a private-use redirect URI with a naming authority", () => {
		const result = validateCimdMetadata(fetchUrl, {
			client_id: fetchUrl,
			client_name: "Invalid Private-use Client",
			redirect_uris: ["com.example.app://host/callback"],
		});
		expect(result.valid).toBe(false);
		expect(result.error).toContain("redirect_uris");
	});

	it.each([
		"com.example.app:callback",
		"com.example.app:///callback",
	])("rejects a private-use redirect URI without the single-slash form: %s", (redirectUri) => {
		const result = validateCimdMetadata(fetchUrl, {
			client_id: fetchUrl,
			client_name: "Invalid Private-use Client",
			redirect_uris: [redirectUri],
		});
		expect(result.valid).toBe(false);
		expect(result.error).toContain("redirect_uris");
	});

	it("rejects malformed reverse-domain private-use redirect schemes", () => {
		for (const redirectUri of [
			"com..example:/callback",
			"com.-example:/callback",
			"com.example-:/callback",
		]) {
			const result = validateCimdMetadata(fetchUrl, {
				client_id: fetchUrl,
				client_name: "Invalid Private-use Client",
				redirect_uris: [redirectUri],
			});
			expect(result.valid).toBe(false);
			expect(result.error).toContain("redirect_uris");
		}
	});

	it("accepts client_credentials as a generic CIMD grant", () => {
		const result = validateCimdMetadata(
			fetchUrl,
			validMetadata(fetchUrl, {
				grant_types: ["client_credentials"],
				token_endpoint_auth_method: "private_key_jwt",
				jwks: {
					keys: [
						{
							kty: "EC",
							crv: "P-256",
							x: "x",
							y: "y",
						},
					],
				},
			}),
		);
		expect(result.valid).toBe(true);
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
			client_name: "Loopback Client",
			redirect_uris: [
				"http://localhost:3000/callback",
				"http://127.0.0.1:3000/callback",
			],
		});
		expect(result.valid).toBe(true);
	});

	it("does not origin-bind redirect_uris by default", () => {
		const result = validateCimdMetadata(fetchUrl, {
			client_id: fetchUrl,
			client_name: "Cross-origin Redirect Client",
			redirect_uris: ["https://other-domain.com/callback"],
		});
		expect(result.valid).toBe(true);
	});

	it("respects custom originBoundFields parameter", () => {
		const result = validateCimdMetadata(
			fetchUrl,
			{
				client_id: fetchUrl,
				client_name: "Custom Origin Client",
				redirect_uris: ["https://example.com/callback"],
				logo_uri: "https://evil.com/logo.png",
			},
			{ originBoundFields: ["logo_uri"] },
		);
		expect(result.valid).toBe(false);
		expect(result.error).toContain("same origin");
	});

	it("does not enforce origin on fields outside originBoundFields", () => {
		const result = validateCimdMetadata(
			fetchUrl,
			{
				client_id: fetchUrl,
				client_name: "External Home Page Client",
				redirect_uris: ["https://example.com/callback"],
				client_uri: "https://other.com/about",
			},
			{ originBoundFields: ["redirect_uris"] },
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
			client_name: "Unsafe Home Page Client",
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
			client_name: "Loopback Logout Client",
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

	it.each([
		"client_uri",
		"logo_uri",
		"tos_uri",
		"policy_uri",
	])("rejects credentials in %s", (field) => {
		const result = validateCimdMetadata(
			fetchUrl,
			validMetadata(fetchUrl, {
				[field]: "https://user:password@example.com/resource",
			}),
		);
		expect(result.valid).toBe(false);
		expect(result.error).toContain(field);
	});

	it.each([
		"tos_uri",
		"policy_uri",
	])("rejects javascript and private targets in %s", (field) => {
		for (const value of ["javascript:alert(1)", "https://127.0.0.1/resource"]) {
			const result = validateCimdMetadata(
				fetchUrl,
				validMetadata(fetchUrl, { [field]: value }),
			);
			expect(result.valid).toBe(false);
			expect(result.error).toContain(field);
		}
	});

	it.each([
		"backchannel_logout_uri",
		"backchannel_logout_session_required",
	])("rejects CIMD back-channel metadata: %s", (field) => {
		const value =
			field === "backchannel_logout_uri"
				? "https://client.example.com/backchannel"
				: true;
		const result = validateCimdMetadata(
			fetchUrl,
			validMetadata(fetchUrl, { [field]: value }),
		);
		expect(result.valid).toBe(false);
		expect(result.error).toContain(field);
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

	it("accepts a root Client Identifier URL with a NOT RECOMMENDED warning", () => {
		const rootUrl = "https://example.com/";
		expect(validateClientIdUrl(rootUrl)).toBeNull();
		const result = validateCimdMetadata(rootUrl, validMetadata(rootUrl));
		expect(result.valid).toBe(true);
		expect(result.warnings).toContain(
			"client_id URL path / is NOT RECOMMENDED (§3)",
		);
	});

	it.each([
		"https://example.com",
		"https://example.com?version=1",
	])("rejects an authority-only Client Identifier URL: %s", (clientId) => {
		expect(validateClientIdUrl(clientId)).toContain("path");
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
