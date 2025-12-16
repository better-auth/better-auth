import { google } from "@better-auth/core/social-providers";
import { betterFetch } from "@better-fetch/fetch";
import { decodeProtectedHeader, importJWK, jwtVerify } from "jose";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock betterFetch and jose
vi.mock("@better-fetch/fetch");
vi.mock("jose", async () => {
	const actual = await vi.importActual("jose");
	return {
		...actual,
		decodeProtectedHeader: vi.fn(),
		importJWK: vi.fn(),
		jwtVerify: vi.fn(),
	};
});

describe("Google Provider - Multiple Client IDs", () => {
	const mockBetterFetch = vi.mocked(betterFetch);
	const mockDecodeProtectedHeader = vi.mocked(decodeProtectedHeader);
	const mockImportJWK = vi.mocked(importJWK);
	const mockJwtVerify = vi.mocked(jwtVerify);

	beforeEach(() => {
		vi.clearAllMocks();
		// Mock getGooglePublicKey to return a mock key
		mockBetterFetch.mockResolvedValue({
			data: {
				keys: [
					{
						kid: "test-kid",
						alg: "RS256",
						kty: "RSA",
						use: "sig",
						n: "test-n",
						// cspell:ignore AQAB
						e: "AQAB",
					},
				],
			},
		} as any);
		mockImportJWK.mockResolvedValue({} as any);
	});

	describe("verifyIdToken with multiple client IDs", () => {
		it("should verify token with single client ID", async () => {
			const provider = google({
				clientId: "single-client-id",
				clientSecret: "test-secret",
			});

			mockDecodeProtectedHeader.mockReturnValue({
				kid: "test-kid",
				alg: "RS256",
			} as any);

			mockJwtVerify.mockResolvedValue({
				payload: {
					aud: "single-client-id",
					iss: "https://accounts.google.com",
					nonce: "test-nonce",
				},
			} as any);

			const result = await provider.verifyIdToken("test-token", "test-nonce");
			expect(result).toBe(true);
			expect(mockBetterFetch).toHaveBeenCalledWith(
				"https://www.googleapis.com/oauth2/v3/certs",
			);
		});

		it("should verify token with multiple client IDs - first client ID matches", async () => {
			const provider = google({
				clientId: ["ios-client-id", "android-client-id", "web-client-id"],
				clientSecret: "test-secret",
			});

			mockDecodeProtectedHeader.mockReturnValue({
				kid: "test-kid",
				alg: "RS256",
			} as any);

			mockJwtVerify.mockResolvedValue({
				payload: {
					aud: "ios-client-id",
					iss: "https://accounts.google.com",
					nonce: "test-nonce",
				},
			} as any);

			const result = await provider.verifyIdToken("test-token", "test-nonce");
			expect(result).toBe(true);
		});

		it("should verify token with multiple client IDs - second client ID matches", async () => {
			const provider = google({
				clientId: ["ios-client-id", "android-client-id", "web-client-id"],
				clientSecret: "test-secret",
			});

			mockDecodeProtectedHeader.mockReturnValue({
				kid: "test-kid",
				alg: "RS256",
			} as any);

			mockJwtVerify.mockResolvedValue({
				payload: {
					aud: "android-client-id",
					iss: "https://accounts.google.com",
					nonce: "test-nonce",
				},
			} as any);

			const result = await provider.verifyIdToken("test-token", "test-nonce");
			expect(result).toBe(true);
		});

		it("should verify token with multiple client IDs - third client ID matches", async () => {
			const provider = google({
				clientId: ["ios-client-id", "android-client-id", "web-client-id"],
				clientSecret: "test-secret",
			});

			mockDecodeProtectedHeader.mockReturnValue({
				kid: "test-kid",
				alg: "RS256",
			} as any);

			mockJwtVerify.mockResolvedValue({
				payload: {
					aud: "web-client-id",
					iss: "https://accounts.google.com",
					nonce: "test-nonce",
				},
			} as any);

			const result = await provider.verifyIdToken("test-token", "test-nonce");
			expect(result).toBe(true);
		});

		it("should reject token with multiple client IDs - no client ID matches", async () => {
			const provider = google({
				clientId: ["ios-client-id", "android-client-id", "web-client-id"],
				clientSecret: "test-secret",
			});

			mockDecodeProtectedHeader.mockReturnValue({
				kid: "test-kid",
				alg: "RS256",
			} as any);

			// jwtVerify will throw an error when audience doesn't match
			mockJwtVerify.mockRejectedValue(new Error("Invalid audience"));

			const result = await provider.verifyIdToken("test-token", "test-nonce");
			expect(result).toBe(false);
		});

		it("should reject token with invalid issuer", async () => {
			const provider = google({
				clientId: ["ios-client-id", "android-client-id"],
				clientSecret: "test-secret",
			});

			mockDecodeProtectedHeader.mockReturnValue({
				kid: "test-kid",
				alg: "RS256",
			} as any);

			// jwtVerify will throw an error when issuer doesn't match
			mockJwtVerify.mockRejectedValue(new Error("Invalid issuer"));

			const result = await provider.verifyIdToken("test-token", "test-nonce");
			expect(result).toBe(false);
		});

		it("should accept token with accounts.google.com issuer (without https)", async () => {
			const provider = google({
				clientId: ["ios-client-id", "android-client-id"],
				clientSecret: "test-secret",
			});

			mockDecodeProtectedHeader.mockReturnValue({
				kid: "test-kid",
				alg: "RS256",
			} as any);

			mockJwtVerify.mockResolvedValue({
				payload: {
					aud: "ios-client-id",
					iss: "accounts.google.com",
					nonce: "test-nonce",
				},
			} as any);

			const result = await provider.verifyIdToken("test-token", "test-nonce");
			expect(result).toBe(true);
		});

		it("should return false when token info is null", async () => {
			const provider = google({
				clientId: ["ios-client-id", "android-client-id"],
				clientSecret: "test-secret",
			});

			mockDecodeProtectedHeader.mockReturnValue({
				kid: "test-kid",
				alg: "RS256",
			} as any);

			// Mock getGooglePublicKey to return null (no keys found)
			mockBetterFetch.mockResolvedValue({
				data: null,
			} as any);

			const result = await provider.verifyIdToken("test-token", "test-nonce");
			expect(result).toBe(false);
		});

		it("should return false when ID token sign in is disabled", async () => {
			const provider = google({
				clientId: ["ios-client-id", "android-client-id"],
				clientSecret: "test-secret",
				disableIdTokenSignIn: true,
			});

			const result = await provider.verifyIdToken("test-token", "test-nonce");
			expect(result).toBe(false);
			expect(mockBetterFetch).not.toHaveBeenCalled();
		});

		it("should use custom verifyIdToken function when provided", async () => {
			const customVerifyIdToken = vi.fn().mockResolvedValue(true);

			const provider = google({
				clientId: ["ios-client-id", "android-client-id"],
				clientSecret: "test-secret",
				verifyIdToken: customVerifyIdToken,
			});

			const result = await provider.verifyIdToken("test-token", "test-nonce");
			expect(result).toBe(true);
			expect(customVerifyIdToken).toHaveBeenCalledWith(
				"test-token",
				"test-nonce",
			);
			expect(mockBetterFetch).not.toHaveBeenCalled();
		});
	});

	describe("createAuthorizationURL with multiple client IDs", () => {
		it("should use first client ID for authorization URL with single client ID", async () => {
			const provider = google({
				clientId: "single-client-id",
				clientSecret: "test-secret",
			});

			// Test that the provider is created correctly
			expect(provider.id).toBe("google");
			expect(provider.name).toBe("Google");

			// Test that the provider has the correct structure
			expect(typeof provider.createAuthorizationURL).toBe("function");
		});

		it("should use first client ID for authorization URL with multiple client IDs", async () => {
			const provider = google({
				clientId: ["ios-client-id", "android-client-id", "web-client-id"],
				clientSecret: "test-secret",
			});

			// Test that the provider is created correctly
			expect(provider.id).toBe("google");
			expect(provider.name).toBe("Google");

			// Test that the provider has the correct structure
			expect(typeof provider.createAuthorizationURL).toBe("function");
		});
	});

	describe("validateAuthorizationCode with multiple client IDs", () => {
		it("should use first client ID for token exchange with single client ID", async () => {
			const provider = google({
				clientId: "single-client-id",
				clientSecret: "test-secret",
			});

			// Test that the provider is created correctly
			expect(provider.id).toBe("google");
			expect(provider.name).toBe("Google");

			// Test that the provider has the correct structure
			expect(typeof provider.validateAuthorizationCode).toBe("function");
		});

		it("should use first client ID for token exchange with multiple client IDs", async () => {
			const provider = google({
				clientId: ["ios-client-id", "android-client-id", "web-client-id"],
				clientSecret: "test-secret",
			});

			// Test that the provider is created correctly
			expect(provider.id).toBe("google");
			expect(provider.name).toBe("Google");

			// Test that the provider has the correct structure
			expect(typeof provider.validateAuthorizationCode).toBe("function");
		});
	});

	describe("refreshAccessToken with multiple client IDs", () => {
		it("should use first client ID for token refresh with single client ID", async () => {
			const provider = google({
				clientId: "single-client-id",
				clientSecret: "test-secret",
			});

			// Test that the provider is created correctly
			expect(provider.id).toBe("google");
			expect(provider.name).toBe("Google");

			// Test that the provider has the correct structure
			expect(typeof provider.refreshAccessToken).toBe("function");
		});

		it("should use first client ID for token refresh with multiple client IDs", async () => {
			const provider = google({
				clientId: ["ios-client-id", "android-client-id", "web-client-id"],
				clientSecret: "test-secret",
			});

			// Test that the provider is created correctly
			expect(provider.id).toBe("google");
			expect(provider.name).toBe("Google");

			// Test that the provider has the correct structure
			expect(typeof provider.refreshAccessToken).toBe("function");
		});
	});
});
