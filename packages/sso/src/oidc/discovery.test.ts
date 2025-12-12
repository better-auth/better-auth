import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	computeDiscoveryUrl,
	discoverOIDCConfig,
	fetchDiscoveryDocument,
	needsRuntimeDiscovery,
	normalizeDiscoveryUrls,
	normalizeUrl,
	selectTokenEndpointAuthMethod,
	validateDiscoveryDocument,
	validateDiscoveryUrl,
} from "./discovery";
import type { OIDCDiscoveryDocument } from "./types";
import { DiscoveryError } from "./types";

vi.mock("@better-fetch/fetch", () => ({
	betterFetch: vi.fn(),
}));

import { betterFetch } from "@better-fetch/fetch";

/**
 * Mock OIDC Discovery Document
 * Represents a valid discovery response from an IdP
 */
const createMockDiscoveryDocument = (
	overrides: Partial<OIDCDiscoveryDocument> = {},
): OIDCDiscoveryDocument => ({
	issuer: "https://idp.example.com",
	authorization_endpoint: "https://idp.example.com/oauth2/authorize",
	token_endpoint: "https://idp.example.com/oauth2/token",
	jwks_uri: "https://idp.example.com/.well-known/jwks.json",
	userinfo_endpoint: "https://idp.example.com/userinfo",
	token_endpoint_auth_methods_supported: [
		"client_secret_basic",
		"client_secret_post",
	],
	scopes_supported: ["openid", "profile", "email", "offline_access"],
	response_types_supported: ["code", "token", "id_token"],
	subject_types_supported: ["public"],
	id_token_signing_alg_values_supported: ["RS256"],
	claims_supported: ["sub", "name", "email", "email_verified"],
	...overrides,
});

describe("OIDC Discovery", () => {
	describe("computeDiscoveryUrl", () => {
		it("should compute discovery URL from issuer without trailing slash", () => {
			const url = computeDiscoveryUrl("https://idp.example.com");
			expect(url).toBe(
				"https://idp.example.com/.well-known/openid-configuration",
			);
		});

		it("should compute discovery URL from issuer with trailing slash", () => {
			const url = computeDiscoveryUrl("https://idp.example.com/");
			expect(url).toBe(
				"https://idp.example.com/.well-known/openid-configuration",
			);
		});

		it("should handle issuer with path", () => {
			const url = computeDiscoveryUrl("https://idp.example.com/tenant/v1");
			expect(url).toBe(
				"https://idp.example.com/tenant/v1/.well-known/openid-configuration",
			);
		});

		it("should handle issuer with path and trailing slash", () => {
			const url = computeDiscoveryUrl("https://idp.example.com/tenant/v1/");
			expect(url).toBe(
				"https://idp.example.com/tenant/v1/.well-known/openid-configuration",
			);
		});
	});

	describe("validateDiscoveryUrl", () => {
		const isTrustedOrigin = vi.fn().mockReturnValue(true);

		it("should accept valid HTTPS URL", () => {
			expect(() =>
				validateDiscoveryUrl(
					"https://idp.example.com/.well-known/openid-configuration",
					isTrustedOrigin,
				),
			).not.toThrow();
		});

		it("should accept valid HTTP URL", () => {
			expect(() =>
				validateDiscoveryUrl(
					"http://localhost:8080/.well-known/openid-configuration",
					isTrustedOrigin,
				),
			).not.toThrow();
		});

		it("should reject invalid URL", () => {
			expect(() => validateDiscoveryUrl("not-a-url", isTrustedOrigin)).toThrow(
				DiscoveryError,
			);
			expect(() => validateDiscoveryUrl("not-a-url", isTrustedOrigin)).toThrow(
				'The url "discoveryEndpoint" must be valid',
			);
		});

		it("should reject non-HTTP protocols", () => {
			expect(() =>
				validateDiscoveryUrl("ftp://example.com/config", isTrustedOrigin),
			).toThrow(DiscoveryError);
			expect(() =>
				validateDiscoveryUrl("ftp://example.com/config", isTrustedOrigin),
			).toThrow("must use the http or https supported protocols");
		});

		it("should throw DiscoveryError with discovery_invalid_url code for invalid URL", () => {
			expect(() => validateDiscoveryUrl("not-a-url", isTrustedOrigin)).toThrow(
				expect.objectContaining({
					code: "discovery_invalid_url",
					details: expect.objectContaining({
						url: "not-a-url",
					}),
				}),
			);
		});

		it("should throw DiscoveryError with discovery_invalid_url code for non-HTTP protocol", () => {
			expect(() =>
				validateDiscoveryUrl("ftp://example.com/config", isTrustedOrigin),
			).toThrow(
				expect.objectContaining({
					code: "discovery_invalid_url",
					details: expect.objectContaining({
						protocol: "ftp:",
					}),
				}),
			);
		});

		it("should throw DiscoveryError with discovery_untrusted_origin code for untrusted origins", () => {
			isTrustedOrigin.mockReturnValue(false);

			expect(() =>
				validateDiscoveryUrl(
					"https://untrusted.com/.well-known/openid-configuration",
					isTrustedOrigin,
				),
			).toThrow(
				expect.objectContaining({
					code: "discovery_untrusted_origin",
					message: `The main discovery endpoint "https://untrusted.com/.well-known/openid-configuration" is not trusted by your trusted origins configuration.`,
				}),
			);
		});
	});

	describe("validateDiscoveryDocument", () => {
		const issuer = "https://idp.example.com";

		it("should accept valid discovery document", () => {
			const doc = createMockDiscoveryDocument();
			expect(() => validateDiscoveryDocument(doc, issuer)).not.toThrow();
		});

		it("should accept discovery document with only required fields", () => {
			// This locks in the contract: only issuer, authorization_endpoint,
			// token_endpoint, and jwks_uri are required. Everything else is optional.
			const doc = {
				issuer,
				authorization_endpoint: `${issuer}/authorize`,
				token_endpoint: `${issuer}/token`,
				jwks_uri: `${issuer}/jwks`,
			} as OIDCDiscoveryDocument;

			expect(() => validateDiscoveryDocument(doc, issuer)).not.toThrow();
		});

		it("should throw discovery_incomplete for missing issuer", () => {
			const doc = createMockDiscoveryDocument({ issuer: "" });
			expect(() => validateDiscoveryDocument(doc, issuer)).toThrow(
				expect.objectContaining({
					code: "discovery_incomplete",
					details: expect.objectContaining({
						missingFields: expect.arrayContaining(["issuer"]),
					}),
				}),
			);
		});

		it("should throw discovery_incomplete for missing authorization_endpoint", () => {
			const doc = createMockDiscoveryDocument({ authorization_endpoint: "" });
			expect(() => validateDiscoveryDocument(doc, issuer)).toThrow(
				expect.objectContaining({
					code: "discovery_incomplete",
					details: expect.objectContaining({
						missingFields: expect.arrayContaining(["authorization_endpoint"]),
					}),
				}),
			);
		});

		it("should throw discovery_incomplete for missing token_endpoint", () => {
			const doc = createMockDiscoveryDocument({ token_endpoint: "" });
			expect(() => validateDiscoveryDocument(doc, issuer)).toThrow(
				expect.objectContaining({
					code: "discovery_incomplete",
					details: expect.objectContaining({
						missingFields: expect.arrayContaining(["token_endpoint"]),
					}),
				}),
			);
		});

		it("should throw discovery_incomplete for missing jwks_uri", () => {
			const doc = createMockDiscoveryDocument({ jwks_uri: "" });
			expect(() => validateDiscoveryDocument(doc, issuer)).toThrow(
				expect.objectContaining({
					code: "discovery_incomplete",
					details: expect.objectContaining({
						missingFields: expect.arrayContaining(["jwks_uri"]),
					}),
				}),
			);
		});

		it("should list all missing fields", () => {
			const doc = {
				issuer: "",
				authorization_endpoint: "",
				token_endpoint: "",
				jwks_uri: "",
			} as OIDCDiscoveryDocument;
			expect(() => validateDiscoveryDocument(doc, issuer)).toThrow(
				expect.objectContaining({
					code: "discovery_incomplete",
					details: expect.objectContaining({
						missingFields: expect.arrayContaining([
							"issuer",
							"authorization_endpoint",
							"token_endpoint",
							"jwks_uri",
						]),
					}),
				}),
			);
		});

		it("should throw issuer_mismatch when issuer doesn't match", () => {
			const doc = createMockDiscoveryDocument({
				issuer: "https://evil.example.com",
			});
			expect(() => validateDiscoveryDocument(doc, issuer)).toThrow(
				expect.objectContaining({
					code: "issuer_mismatch",
					details: expect.objectContaining({
						discovered: "https://evil.example.com",
						configured: issuer,
					}),
				}),
			);
		});

		it("should handle trailing slash normalization in issuer comparison", () => {
			const doc = createMockDiscoveryDocument({
				issuer: "https://idp.example.com/",
			});
			// Should NOT throw - trailing slash difference is normalized
			expect(() =>
				validateDiscoveryDocument(doc, "https://idp.example.com"),
			).not.toThrow();
		});

		it("should handle trailing slash in configured issuer", () => {
			const doc = createMockDiscoveryDocument({
				issuer: "https://idp.example.com",
			});
			// Should NOT throw - trailing slash difference is normalized
			expect(() =>
				validateDiscoveryDocument(doc, "https://idp.example.com/"),
			).not.toThrow();
		});
	});

	describe("selectTokenEndpointAuthMethod", () => {
		it("should return existing config value if provided", () => {
			const doc = createMockDiscoveryDocument();
			expect(selectTokenEndpointAuthMethod(doc, "client_secret_post")).toBe(
				"client_secret_post",
			);
		});

		it("should prefer client_secret_basic when both are supported", () => {
			const doc = createMockDiscoveryDocument({
				token_endpoint_auth_methods_supported: [
					"client_secret_post",
					"client_secret_basic",
				],
			});
			expect(selectTokenEndpointAuthMethod(doc)).toBe("client_secret_basic");
		});

		it("should use client_secret_post if only that is supported", () => {
			const doc = createMockDiscoveryDocument({
				token_endpoint_auth_methods_supported: ["client_secret_post"],
			});
			expect(selectTokenEndpointAuthMethod(doc)).toBe("client_secret_post");
		});

		it("should default to client_secret_basic when only unsupported methods are advertised", () => {
			const doc = createMockDiscoveryDocument({
				token_endpoint_auth_methods_supported: ["private_key_jwt"],
			});
			expect(selectTokenEndpointAuthMethod(doc)).toBe("client_secret_basic");
		});

		it("should default to client_secret_basic for tls_client_auth only", () => {
			const doc = createMockDiscoveryDocument({
				token_endpoint_auth_methods_supported: [
					"tls_client_auth",
					"private_key_jwt",
				],
			});
			expect(selectTokenEndpointAuthMethod(doc)).toBe("client_secret_basic");
		});

		it("should default to client_secret_basic if not specified in discovery", () => {
			const doc = createMockDiscoveryDocument({
				token_endpoint_auth_methods_supported: undefined,
			});
			expect(selectTokenEndpointAuthMethod(doc)).toBe("client_secret_basic");
		});

		it("should default to client_secret_basic for empty array", () => {
			const doc = createMockDiscoveryDocument({
				token_endpoint_auth_methods_supported: [],
			});
			expect(selectTokenEndpointAuthMethod(doc)).toBe("client_secret_basic");
		});
	});

	describe("normalizeDiscoveryUrls", () => {
		const isTrustedOrigin = vi.fn().mockReturnValue(true);

		it("should return the document unchanged if all urls are already absolute", () => {
			const doc = createMockDiscoveryDocument();
			const result = normalizeDiscoveryUrls(
				doc,
				"https://idp.example.com",
				isTrustedOrigin,
			);
			expect(result).toEqual(doc);
		});

		it("should resolve all required discovery urls relative to the issuer", () => {
			const expected = createMockDiscoveryDocument({
				issuer: "https://idp.example.com",
				authorization_endpoint: "https://idp.example.com/oauth2/authorize",
				token_endpoint: "https://idp.example.com/oauth2/token",
				jwks_uri: "https://idp.example.com/.well-known/jwks.json",
			});
			const doc = createMockDiscoveryDocument({
				issuer: "https://idp.example.com",
				authorization_endpoint: "/oauth2/authorize",
				token_endpoint: "/oauth2/token",
				jwks_uri: "/.well-known/jwks.json",
			});
			const result = normalizeDiscoveryUrls(
				doc,
				"https://idp.example.com",
				isTrustedOrigin,
			);
			expect(result).toEqual(expected);
		});

		it("should resolve all discovery urls relative to the issuer", () => {
			const expected = createMockDiscoveryDocument({
				issuer: "https://idp.example.com",
				authorization_endpoint: "https://idp.example.com/oauth2/authorize",
				token_endpoint: "https://idp.example.com/oauth2/token",
				jwks_uri: "https://idp.example.com/.well-known/jwks.json",
				userinfo_endpoint: "https://idp.example.com/userinfo",
				revocation_endpoint: "https://idp.example.com/revoke",
			});
			const doc = createMockDiscoveryDocument({
				issuer: "https://idp.example.com",
				authorization_endpoint: "/oauth2/authorize",
				token_endpoint: "/oauth2/token",
				jwks_uri: "/.well-known/jwks.json",
				userinfo_endpoint: "/userinfo",
				revocation_endpoint: "/revoke",
			});
			const result = normalizeDiscoveryUrls(
				doc,
				"https://idp.example.com",
				isTrustedOrigin,
			);
			expect(result).toEqual(expected);
		});

		it("should reject on invalid discovery urls", () => {
			const doc = createMockDiscoveryDocument({
				authorization_endpoint: "/oauth2/authorize",
			});
			expect(() =>
				normalizeDiscoveryUrls(doc, "not-url", isTrustedOrigin),
			).toThrowError('The url "authorization_endpoint" must be valid');
		});

		it("should reject with discovery_untrusted_origin code on untrusted discovery urls", () => {
			const doc = createMockDiscoveryDocument({
				authorization_endpoint: "/oauth2/authorize",
				token_endpoint: "/oauth2/token",
				jwks_uri: "/.well-known/jwks.json",
				userinfo_endpoint: "/userinfo",
				revocation_endpoint: "/revoke",
				end_session_endpoint: "/endsession",
				introspection_endpoint: "/introspection",
			});

			expect(() =>
				normalizeDiscoveryUrls(
					doc,
					"https://idp.example.com",
					(url) => !url.endsWith("/oauth2/token"),
				),
			).toThrowError(
				expect.objectContaining({
					code: "discovery_untrusted_origin",
					message:
						'The token_endpoint "https://idp.example.com/oauth2/token" is not trusted by your trusted origins configuration.',
					details: {
						endpoint: "token_endpoint",
						url: "https://idp.example.com/oauth2/token",
					},
				}),
			);

			expect(() =>
				normalizeDiscoveryUrls(
					doc,
					"https://idp.example.com",
					(url) => !url.endsWith("/oauth2/authorize"),
				),
			).toThrowError(
				expect.objectContaining({
					code: "discovery_untrusted_origin",
					message:
						'The authorization_endpoint "https://idp.example.com/oauth2/authorize" is not trusted by your trusted origins configuration.',
					details: {
						endpoint: "authorization_endpoint",
						url: "https://idp.example.com/oauth2/authorize",
					},
				}),
			);

			expect(() =>
				normalizeDiscoveryUrls(
					doc,
					"https://idp.example.com",
					(url) => !url.endsWith("/.well-known/jwks.json"),
				),
			).toThrowError(
				expect.objectContaining({
					code: "discovery_untrusted_origin",
					message:
						'The jwks_uri "https://idp.example.com/.well-known/jwks.json" is not trusted by your trusted origins configuration.',
					details: {
						endpoint: "jwks_uri",
						url: "https://idp.example.com/.well-known/jwks.json",
					},
				}),
			);

			expect(() =>
				normalizeDiscoveryUrls(
					doc,
					"https://idp.example.com",
					(url) => !url.endsWith("/userinfo"),
				),
			).toThrowError(
				expect.objectContaining({
					code: "discovery_untrusted_origin",
					message:
						'The userinfo_endpoint "https://idp.example.com/userinfo" is not trusted by your trusted origins configuration.',
					details: {
						endpoint: "userinfo_endpoint",
						url: "https://idp.example.com/userinfo",
					},
				}),
			);

			expect(() =>
				normalizeDiscoveryUrls(
					doc,
					"https://idp.example.com",
					(url) => !url.endsWith("/revoke"),
				),
			).toThrowError(
				expect.objectContaining({
					code: "discovery_untrusted_origin",
					message:
						'The revocation_endpoint "https://idp.example.com/revoke" is not trusted by your trusted origins configuration.',
					details: {
						endpoint: "revocation_endpoint",
						url: "https://idp.example.com/revoke",
					},
				}),
			);

			expect(() =>
				normalizeDiscoveryUrls(
					doc,
					"https://idp.example.com",
					(url) => !url.endsWith("/endsession"),
				),
			).toThrowError(
				expect.objectContaining({
					code: "discovery_untrusted_origin",
					message:
						'The end_session_endpoint "https://idp.example.com/endsession" is not trusted by your trusted origins configuration.',
					details: {
						endpoint: "end_session_endpoint",
						url: "https://idp.example.com/endsession",
					},
				}),
			);

			expect(() =>
				normalizeDiscoveryUrls(
					doc,
					"https://idp.example.com",
					(url) => !url.endsWith("/introspection"),
				),
			).toThrowError(
				expect.objectContaining({
					code: "discovery_untrusted_origin",
					message:
						'The introspection_endpoint "https://idp.example.com/introspection" is not trusted by your trusted origins configuration.',
					details: {
						endpoint: "introspection_endpoint",
						url: "https://idp.example.com/introspection",
					},
				}),
			);
		});
	});

	describe("normalizeUrl", () => {
		it("should return endpoint unchanged if already absolute", () => {
			const endpoint = "https://idp.example.com/oauth2/token";
			expect(normalizeUrl("url", endpoint, "https://idp.example.com")).toBe(
				endpoint,
			);
		});

		it("should return endpoint as an absolute url", () => {
			const endpoint = "/oauth2/token";
			expect(normalizeUrl("url", endpoint, "https://idp.example.com")).toBe(
				"https://idp.example.com/oauth2/token",
			);
		});

		it.each([
			[
				"/oauth2/token",
				"https://idp.example.com/base",
				"endpoint with leading slash",
			],
			[
				"oauth2/token",
				"https://idp.example.com/base",
				"endpoint without leading slash",
			],
			[
				"/oauth2/token",
				"https://idp.example.com/base/",
				"issuer with trailing slash",
			],
			["//oauth2/token", "https://idp.example.com/base//", "multiple slashes"],
		])("should resolve relative endpoint preserving issuer base path (%s, %s) - %s", (endpoint, issuer) => {
			expect(normalizeUrl("url", endpoint, issuer)).toBe(
				"https://idp.example.com/base/oauth2/token",
			);
		});

		it("should reject invalid endpoint urls", () => {
			const endpoint = "oauth2/token";
			const issuer = "not-a-url";
			expect(() => normalizeUrl("url", endpoint, issuer)).toThrowError(
				'The url "url" must be valid',
			);
		});

		it("should reject urls with unsupported protocols", () => {
			const endpoint = "not-a-url";
			const issuer = "ftp://idp.example.com";
			expect(() => normalizeUrl("url", endpoint, issuer)).toThrowError(
				'The url "url" must use the http or https supported protocols',
			);
		});
	});

	describe("needsRuntimeDiscovery", () => {
		it("should return true for undefined config", () => {
			expect(needsRuntimeDiscovery(undefined)).toBe(true);
		});

		it("should return true for empty config", () => {
			expect(needsRuntimeDiscovery({})).toBe(true);
		});

		it("should return true if tokenEndpoint is missing", () => {
			expect(
				needsRuntimeDiscovery({
					jwksEndpoint: "https://idp.example.com/.well-known/jwks.json",
				}),
			).toBe(true);
		});

		it("should return true if jwksEndpoint is missing", () => {
			expect(
				needsRuntimeDiscovery({
					tokenEndpoint: "https://idp.example.com/oauth2/token",
				}),
			).toBe(true);
		});

		it("should return false if both tokenEndpoint and jwksEndpoint are present", () => {
			expect(
				needsRuntimeDiscovery({
					tokenEndpoint: "https://idp.example.com/oauth2/token",
					jwksEndpoint: "https://idp.example.com/.well-known/jwks.json",
				}),
			).toBe(false);
		});
	});

	describe("fetchDiscoveryDocument", () => {
		const mockBetterFetch = betterFetch as ReturnType<typeof vi.fn>;

		beforeEach(() => {
			vi.clearAllMocks();
		});

		it("should fetch and parse valid discovery document", async () => {
			const expectedDoc = createMockDiscoveryDocument();
			mockBetterFetch.mockResolvedValueOnce({
				data: expectedDoc,
				error: null,
			});

			const result = await fetchDiscoveryDocument(
				"https://idp.example.com/.well-known/openid-configuration",
			);

			expect(result.issuer).toBe(expectedDoc.issuer);
			expect(result.authorization_endpoint).toBe(
				expectedDoc.authorization_endpoint,
			);
			expect(result.token_endpoint).toBe(expectedDoc.token_endpoint);
			expect(result.jwks_uri).toBe(expectedDoc.jwks_uri);
			expect(mockBetterFetch).toHaveBeenCalledWith(
				"https://idp.example.com/.well-known/openid-configuration",
				expect.objectContaining({ method: "GET" }),
			);
		});

		it("should throw discovery_not_found for 404 response", async () => {
			mockBetterFetch.mockResolvedValueOnce({
				data: null,
				error: { status: 404, message: "Not Found" },
			});

			await expect(
				fetchDiscoveryDocument(
					"https://idp.example.com/.well-known/openid-configuration",
				),
			).rejects.toThrow(
				expect.objectContaining({
					code: "discovery_not_found",
				}),
			);
		});

		it("should throw discovery_timeout on AbortError (betterFetch throws on timeout)", async () => {
			// betterFetch throws AbortError when timeout fires, not response.error
			const abortError = new Error("The operation was aborted");
			abortError.name = "AbortError";
			mockBetterFetch.mockRejectedValueOnce(abortError);

			await expect(
				fetchDiscoveryDocument(
					"https://idp.example.com/.well-known/openid-configuration",
					100,
				),
			).rejects.toThrow(
				expect.objectContaining({
					code: "discovery_timeout",
				}),
			);
		});

		it("should throw discovery_timeout on HTTP 408 response", async () => {
			// HTTP 408 comes as response.error (server responded)
			mockBetterFetch.mockResolvedValueOnce({
				data: null,
				error: { status: 408, statusText: "Request Timeout", message: "" },
			});

			await expect(
				fetchDiscoveryDocument(
					"https://idp.example.com/.well-known/openid-configuration",
					100,
				),
			).rejects.toThrow(
				expect.objectContaining({
					code: "discovery_timeout",
				}),
			);
		});

		it("should throw discovery_unexpected_error for server errors", async () => {
			mockBetterFetch.mockResolvedValueOnce({
				data: null,
				error: { status: 500, message: "Internal Server Error" },
			});

			await expect(
				fetchDiscoveryDocument(
					"https://idp.example.com/.well-known/openid-configuration",
				),
			).rejects.toThrow(
				expect.objectContaining({
					code: "discovery_unexpected_error",
				}),
			);
		});

		it("should throw discovery_invalid_json for empty response", async () => {
			mockBetterFetch.mockResolvedValueOnce({
				data: null,
				error: null,
			});

			await expect(
				fetchDiscoveryDocument(
					"https://idp.example.com/.well-known/openid-configuration",
				),
			).rejects.toThrow(
				expect.objectContaining({
					code: "discovery_invalid_json",
				}),
			);
		});

		it("should throw discovery_invalid_json for JSON parse errors", async () => {
			// betterFetch doesn't throw SyntaxError - it falls back to raw text
			mockBetterFetch.mockResolvedValueOnce({
				data: "<!DOCTYPE html><html>Not JSON</html>",
				error: null,
			});

			await expect(
				fetchDiscoveryDocument(
					"https://idp.example.com/.well-known/openid-configuration",
				),
			).rejects.toThrow(
				expect.objectContaining({
					code: "discovery_invalid_json",
					details: expect.objectContaining({
						bodyPreview: "<!DOCTYPE html><html>Not JSON</html>",
					}),
				}),
			);
		});

		it("should throw discovery_unexpected_error for unknown errors", async () => {
			mockBetterFetch.mockRejectedValueOnce(new Error("Network failure"));

			await expect(
				fetchDiscoveryDocument(
					"https://idp.example.com/.well-known/openid-configuration",
				),
			).rejects.toThrow(
				expect.objectContaining({
					code: "discovery_unexpected_error",
				}),
			);
		});
	});

	describe("discoverOIDCConfig (integration)", () => {
		const mockBetterFetch = betterFetch as ReturnType<typeof vi.fn>;
		const issuer = "https://idp.example.com";
		const isTrustedOrigin = vi.fn().mockReturnValue(true);

		beforeEach(() => {
			vi.clearAllMocks();
		});

		it("should return hydrated config from valid discovery", async () => {
			const discoveryDoc = createMockDiscoveryDocument({
				issuer,
				authorization_endpoint: `${issuer}/oauth2/authorize`,
				token_endpoint: `${issuer}/oauth2/token`,
				jwks_uri: `${issuer}/.well-known/jwks.json`,
				userinfo_endpoint: `${issuer}/userinfo`,
			});
			mockBetterFetch.mockResolvedValueOnce({
				data: discoveryDoc,
				error: null,
			});

			const result = await discoverOIDCConfig({ issuer, isTrustedOrigin });

			expect(result.issuer).toBe(issuer);
			expect(result.authorizationEndpoint).toBe(`${issuer}/oauth2/authorize`);
			expect(result.tokenEndpoint).toBe(`${issuer}/oauth2/token`);
			expect(result.jwksEndpoint).toBe(`${issuer}/.well-known/jwks.json`);
			expect(result.userInfoEndpoint).toBe(`${issuer}/userinfo`);
			expect(result.discoveryEndpoint).toBe(
				`${issuer}/.well-known/openid-configuration`,
			);
			expect(result.tokenEndpointAuthentication).toBe("client_secret_basic");
		});

		it("should merge existing config with discovered values (existing takes precedence)", async () => {
			const discoveryDoc = createMockDiscoveryDocument({
				issuer,
				authorization_endpoint: `${issuer}/oauth2/authorize`,
				token_endpoint: `${issuer}/oauth2/token`,
				jwks_uri: `${issuer}/.well-known/jwks.json`,
			});
			mockBetterFetch.mockResolvedValueOnce({
				data: discoveryDoc,
				error: null,
			});

			const result = await discoverOIDCConfig({
				issuer,
				existingConfig: {
					tokenEndpoint: "https://custom.example.com/token",
					tokenEndpointAuthentication: "client_secret_post",
				},
				isTrustedOrigin,
			});

			expect(result.tokenEndpoint).toBe("https://custom.example.com/token");
			expect(result.tokenEndpointAuthentication).toBe("client_secret_post");

			expect(result.authorizationEndpoint).toBe(`${issuer}/oauth2/authorize`);
			expect(result.jwksEndpoint).toBe(`${issuer}/.well-known/jwks.json`);
		});

		it("should use custom discovery endpoint if provided", async () => {
			const customEndpoint = `${issuer}/custom/.well-known/openid-configuration`;
			mockBetterFetch.mockResolvedValueOnce({
				data: createMockDiscoveryDocument({ issuer }),
				error: null,
			});

			const result = await discoverOIDCConfig({
				issuer,
				discoveryEndpoint: customEndpoint,
				isTrustedOrigin,
			});

			expect(result.discoveryEndpoint).toBe(customEndpoint);
			expect(mockBetterFetch).toHaveBeenCalledWith(
				customEndpoint,
				expect.any(Object),
			);
		});

		it("should use discovery endpoint from existing config", async () => {
			const existingEndpoint = `${issuer}/tenant/.well-known/openid-configuration`;
			mockBetterFetch.mockResolvedValueOnce({
				data: createMockDiscoveryDocument({ issuer }),
				error: null,
			});

			const result = await discoverOIDCConfig({
				issuer,
				existingConfig: {
					discoveryEndpoint: existingEndpoint,
				},
				isTrustedOrigin,
			});

			expect(result.discoveryEndpoint).toBe(existingEndpoint);
			expect(mockBetterFetch).toHaveBeenCalledWith(
				existingEndpoint,
				expect.any(Object),
			);
		});

		it("should throw on issuer mismatch", async () => {
			mockBetterFetch.mockResolvedValueOnce({
				data: createMockDiscoveryDocument({
					issuer: "https://evil.example.com",
				}),
				error: null,
			});

			await expect(
				discoverOIDCConfig({ issuer, isTrustedOrigin }),
			).rejects.toThrow(
				expect.objectContaining({
					code: "issuer_mismatch",
				}),
			);
		});

		it("should throw on missing required fields", async () => {
			mockBetterFetch.mockResolvedValueOnce({
				data: {
					issuer,
					authorization_endpoint: `${issuer}/authorize`,
				},
				error: null,
			});

			await expect(
				discoverOIDCConfig({ issuer, isTrustedOrigin }),
			).rejects.toThrow(
				expect.objectContaining({
					code: "discovery_incomplete",
				}),
			);
		});

		it("should throw discovery_not_found when endpoint doesn't exist", async () => {
			mockBetterFetch.mockResolvedValueOnce({
				data: null,
				error: { status: 404, message: "Not Found" },
			});

			await expect(
				discoverOIDCConfig({ issuer, isTrustedOrigin }),
			).rejects.toThrow(
				expect.objectContaining({
					code: "discovery_not_found",
				}),
			);
		});

		it("should include scopes_supported in hydrated config", async () => {
			const scopes = ["openid", "profile", "email", "offline_access", "custom"];
			mockBetterFetch.mockResolvedValueOnce({
				data: createMockDiscoveryDocument({
					issuer,
					scopes_supported: scopes,
				}),
				error: null,
			});

			const result = await discoverOIDCConfig({ issuer, isTrustedOrigin });

			expect(result.scopesSupported).toEqual(scopes);
		});

		it("should handle discovery document without optional fields", async () => {
			mockBetterFetch.mockResolvedValueOnce({
				data: {
					issuer,
					authorization_endpoint: `${issuer}/authorize`,
					token_endpoint: `${issuer}/token`,
					jwks_uri: `${issuer}/jwks`,
				},
				error: null,
			});

			const result = await discoverOIDCConfig({ issuer, isTrustedOrigin });

			expect(result.issuer).toBe(issuer);
			expect(result.authorizationEndpoint).toBe(`${issuer}/authorize`);
			expect(result.tokenEndpoint).toBe(`${issuer}/token`);
			expect(result.jwksEndpoint).toBe(`${issuer}/jwks`);
			expect(result.userInfoEndpoint).toBeUndefined();
			expect(result.scopesSupported).toBeUndefined();
			expect(result.tokenEndpointAuthentication).toBe("client_secret_basic");
		});

		it("should keep all existing config fields and only fill missing ones from discovery", async () => {
			const discoveryDoc = createMockDiscoveryDocument({ issuer });
			mockBetterFetch.mockResolvedValueOnce({
				data: discoveryDoc,
				error: null,
			});

			const result = await discoverOIDCConfig({
				issuer,
				existingConfig: {
					issuer,
					discoveryEndpoint:
						"https://custom.example.com/.well-known/openid-configuration",
					authorizationEndpoint: "https://custom.example.com/auth",
					tokenEndpoint: "https://custom.example.com/token",
					jwksEndpoint: "https://custom.example.com/jwks",
					userInfoEndpoint: "https://custom.example.com/userinfo",
					tokenEndpointAuthentication: "client_secret_post",
					scopesSupported: ["openid", "profile"],
				},
				isTrustedOrigin,
			});

			expect(result.issuer).toBe(issuer);
			expect(result.discoveryEndpoint).toBe(
				"https://custom.example.com/.well-known/openid-configuration",
			);
			expect(result.authorizationEndpoint).toBe(
				"https://custom.example.com/auth",
			);
			expect(result.tokenEndpoint).toBe("https://custom.example.com/token");
			expect(result.jwksEndpoint).toBe("https://custom.example.com/jwks");
			expect(result.userInfoEndpoint).toBe(
				"https://custom.example.com/userinfo",
			);
			expect(result.tokenEndpointAuthentication).toBe("client_secret_post");
			expect(result.scopesSupported).toEqual(["openid", "profile"]);
		});

		it("should default to client_secret_basic when IdP only supports methods we don't support", async () => {
			mockBetterFetch.mockResolvedValueOnce({
				data: {
					issuer,
					authorization_endpoint: `${issuer}/authorize`,
					token_endpoint: `${issuer}/token`,
					jwks_uri: `${issuer}/jwks`,
					token_endpoint_auth_methods_supported: ["private_key_jwt"],
				},
				error: null,
			});

			const result = await discoverOIDCConfig({ issuer, isTrustedOrigin });
			expect(result.tokenEndpointAuthentication).toBe("client_secret_basic");
		});

		it("should fill missing fields from discovery when existing config is partial", async () => {
			// Scenario: Legacy provider only has jwksEndpoint stored, discovery fills the rest
			const discoveryDoc = createMockDiscoveryDocument({
				issuer,
				authorization_endpoint: `${issuer}/oauth2/authorize`,
				token_endpoint: `${issuer}/oauth2/token`,
				jwks_uri: `${issuer}/.well-known/jwks.json`,
				userinfo_endpoint: `${issuer}/userinfo`,
			});
			mockBetterFetch.mockResolvedValueOnce({
				data: discoveryDoc,
				error: null,
			});

			const result = await discoverOIDCConfig({
				issuer,
				existingConfig: {
					// Only jwksEndpoint is set (simulating a legacy/partial config)
					jwksEndpoint: "https://custom.example.com/jwks",
				},
				isTrustedOrigin,
			});

			// Existing value should be preserved
			expect(result.jwksEndpoint).toBe("https://custom.example.com/jwks");

			// Discovered values should fill the gaps
			expect(result.issuer).toBe(issuer);
			expect(result.authorizationEndpoint).toBe(`${issuer}/oauth2/authorize`);
			expect(result.tokenEndpoint).toBe(`${issuer}/oauth2/token`);
			expect(result.userInfoEndpoint).toBe(`${issuer}/userinfo`);
			expect(result.tokenEndpointAuthentication).toBe("client_secret_basic");
		});

		it("should handle discovery document with extra unknown fields and missing optional fields", async () => {
			// Scenario: IdP returns extra vendor-specific fields and omits all optional fields
			mockBetterFetch.mockResolvedValueOnce({
				data: {
					// Only required fields
					issuer,
					authorization_endpoint: `${issuer}/authorize`,
					token_endpoint: `${issuer}/token`,
					jwks_uri: `${issuer}/jwks`,
					// Extra vendor-specific fields (should be ignored but not cause errors)
					"x-vendor-feature": true,
					custom_logout_endpoint: `${issuer}/logout`,
					experimental_flags: { feature_a: true, feature_b: false },
				},
				error: null,
			});

			const result = await discoverOIDCConfig({ issuer, isTrustedOrigin });

			// Should successfully extract required fields
			expect(result.issuer).toBe(issuer);
			expect(result.authorizationEndpoint).toBe(`${issuer}/authorize`);
			expect(result.tokenEndpoint).toBe(`${issuer}/token`);
			expect(result.jwksEndpoint).toBe(`${issuer}/jwks`);

			// Optional fields should be undefined (not error)
			expect(result.userInfoEndpoint).toBeUndefined();
			expect(result.scopesSupported).toBeUndefined();

			// Should default auth method when not specified
			expect(result.tokenEndpointAuthentication).toBe("client_secret_basic");
		});

		it("should throw an error with discovery_untrusted_origin code when the main discovery url is untrusted", async () => {
			isTrustedOrigin.mockReturnValue(false);

			await expect(
				discoverOIDCConfig({ issuer, isTrustedOrigin }),
			).rejects.toThrow(
				expect.objectContaining({
					name: "DiscoveryError",
					message:
						'The main discovery endpoint "https://idp.example.com/.well-known/openid-configuration" is not trusted by your trusted origins configuration.',
					code: "discovery_untrusted_origin",
					details: {
						url: "https://idp.example.com/.well-known/openid-configuration",
					},
				}),
			);
		});

		it("should throw an error with discovery_untrusted_origin code when discovered urls are untrusted", async () => {
			isTrustedOrigin.mockImplementation((url: string) => {
				return url.endsWith(".well-known/openid-configuration");
			});

			const discoveryDoc = createMockDiscoveryDocument({
				issuer,
				authorization_endpoint: `${issuer}/oauth2/authorize`,
				token_endpoint: `${issuer}/oauth2/token`,
				jwks_uri: `${issuer}/.well-known/jwks.json`,
				userinfo_endpoint: `${issuer}/userinfo`,
			});
			mockBetterFetch.mockResolvedValueOnce({
				data: discoveryDoc,
				error: null,
			});

			await expect(
				discoverOIDCConfig({ issuer, isTrustedOrigin }),
			).rejects.toThrow(
				expect.objectContaining({
					name: "DiscoveryError",
					message:
						'The token_endpoint "https://idp.example.com/oauth2/token" is not trusted by your trusted origins configuration.',
					code: "discovery_untrusted_origin",
					details: {
						endpoint: "token_endpoint",
						url: "https://idp.example.com/oauth2/token",
					},
				}),
			);
		});
	});
});
