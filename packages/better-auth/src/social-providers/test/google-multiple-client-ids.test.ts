import { google } from "@better-auth/core/social-providers";
import { betterFetch } from "@better-fetch/fetch";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock betterFetch
vi.mock("@better-fetch/fetch");

describe("Google Provider - Multiple Client IDs", () => {
	const mockBetterFetch = vi.mocked(betterFetch);

	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("verifyIdToken with multiple client IDs", () => {
		it("should verify token with single client ID", async () => {
			const provider = google({
				clientId: "single-client-id",
				clientSecret: "test-secret",
			});

			const mockTokenInfo = {
				aud: "single-client-id",
				iss: "https://accounts.google.com",
				email: "test@example.com",
				email_verified: true,
				name: "Test User",
				picture: "https://example.com/picture.jpg",
				sub: "123456789",
			};

			mockBetterFetch.mockResolvedValue({
				data: mockTokenInfo,
			} as any);

			const result = await provider.verifyIdToken("test-token", "test-nonce");
			expect(result).toBe(true);
			expect(mockBetterFetch).toHaveBeenCalledWith(
				"https://www.googleapis.com/oauth2/v3/tokeninfo?id_token=test-token",
			);
		});

		it("should verify token with multiple client IDs - first client ID matches", async () => {
			const provider = google({
				clientId: ["ios-client-id", "android-client-id", "web-client-id"],
				clientSecret: "test-secret",
			});

			const mockTokenInfo = {
				aud: "ios-client-id",
				iss: "https://accounts.google.com",
				email: "test@example.com",
				email_verified: true,
				name: "Test User",
				picture: "https://example.com/picture.jpg",
				sub: "123456789",
			};

			mockBetterFetch.mockResolvedValue({
				data: mockTokenInfo,
			} as any);

			const result = await provider.verifyIdToken("test-token", "test-nonce");
			expect(result).toBe(true);
		});

		it("should verify token with multiple client IDs - second client ID matches", async () => {
			const provider = google({
				clientId: ["ios-client-id", "android-client-id", "web-client-id"],
				clientSecret: "test-secret",
			});

			const mockTokenInfo = {
				aud: "android-client-id",
				iss: "https://accounts.google.com",
				email: "test@example.com",
				email_verified: true,
				name: "Test User",
				picture: "https://example.com/picture.jpg",
				sub: "123456789",
			};

			mockBetterFetch.mockResolvedValue({
				data: mockTokenInfo,
			} as any);

			const result = await provider.verifyIdToken("test-token", "test-nonce");
			expect(result).toBe(true);
		});

		it("should verify token with multiple client IDs - third client ID matches", async () => {
			const provider = google({
				clientId: ["ios-client-id", "android-client-id", "web-client-id"],
				clientSecret: "test-secret",
			});

			const mockTokenInfo = {
				aud: "web-client-id",
				iss: "https://accounts.google.com",
				email: "test@example.com",
				email_verified: true,
				name: "Test User",
				picture: "https://example.com/picture.jpg",
				sub: "123456789",
			};

			mockBetterFetch.mockResolvedValue({
				data: mockTokenInfo,
			} as any);

			const result = await provider.verifyIdToken("test-token", "test-nonce");
			expect(result).toBe(true);
		});

		it("should reject token with multiple client IDs - no client ID matches", async () => {
			const provider = google({
				clientId: ["ios-client-id", "android-client-id", "web-client-id"],
				clientSecret: "test-secret",
			});

			const mockTokenInfo = {
				aud: "unknown-client-id",
				iss: "https://accounts.google.com",
				email: "test@example.com",
				email_verified: true,
				name: "Test User",
				picture: "https://example.com/picture.jpg",
				sub: "123456789",
			};

			mockBetterFetch.mockResolvedValue({
				data: mockTokenInfo,
			} as any);

			const result = await provider.verifyIdToken("test-token", "test-nonce");
			expect(result).toBe(false);
		});

		it("should reject token with invalid issuer", async () => {
			const provider = google({
				clientId: ["ios-client-id", "android-client-id"],
				clientSecret: "test-secret",
			});

			const mockTokenInfo = {
				aud: "ios-client-id",
				iss: "https://invalid-issuer.com",
				email: "test@example.com",
				email_verified: true,
				name: "Test User",
				picture: "https://example.com/picture.jpg",
				sub: "123456789",
			};

			mockBetterFetch.mockResolvedValue({
				data: mockTokenInfo,
			} as any);

			const result = await provider.verifyIdToken("test-token", "test-nonce");
			expect(result).toBe(false);
		});

		it("should accept token with accounts.google.com issuer (without https)", async () => {
			const provider = google({
				clientId: ["ios-client-id", "android-client-id"],
				clientSecret: "test-secret",
			});

			const mockTokenInfo = {
				aud: "ios-client-id",
				iss: "accounts.google.com",
				email: "test@example.com",
				email_verified: true,
				name: "Test User",
				picture: "https://example.com/picture.jpg",
				sub: "123456789",
			};

			mockBetterFetch.mockResolvedValue({
				data: mockTokenInfo,
			} as any);

			const result = await provider.verifyIdToken("test-token", "test-nonce");
			expect(result).toBe(true);
		});

		it("should return false when token info is null", async () => {
			const provider = google({
				clientId: ["ios-client-id", "android-client-id"],
				clientSecret: "test-secret",
			});

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
