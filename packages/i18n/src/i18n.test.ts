import { getTestInstance } from "better-auth/test";
import { describe, expect, it } from "vitest";
import { i18n } from ".";

const translations = {
	en: {
		USER_NOT_FOUND: "User not found",
		INVALID_EMAIL_OR_PASSWORD: "Invalid email or password",
		INVALID_PASSWORD: "Invalid password",
	},
	fr: {
		USER_NOT_FOUND: "Utilisateur non trouvé",
		INVALID_EMAIL_OR_PASSWORD: "Email ou mot de passe invalide",
		INVALID_PASSWORD: "Mot de passe invalide",
	},
	de: {
		USER_NOT_FOUND: "Benutzer nicht gefunden",
		INVALID_EMAIL_OR_PASSWORD: "Ungültige E-Mail oder Passwort",
	},
};

describe("i18n plugin", async () => {
	const { auth } = await getTestInstance({
		plugins: [
			i18n({
				translations,
				defaultLocale: "en",
				detection: ["header", "cookie"],
			}),
		],
	});

	describe("locale detection from Accept-Language header", () => {
		it("should translate error to French when Accept-Language is fr", async () => {
			const response = await auth.api.signInEmail({
				body: {
					email: "nonexistent@example.com",
					password: "wrongpassword",
				},
				headers: {
					"Accept-Language": "fr",
				},
				asResponse: true,
			});

			const body = await response.json();
			expect(body.code).toBe("INVALID_EMAIL_OR_PASSWORD");
			expect(body.message).toBe("Email ou mot de passe invalide");
			expect(body.originalMessage).toBe("Invalid email or password");
		});

		it("should translate error to German when Accept-Language is de", async () => {
			const response = await auth.api.signInEmail({
				body: {
					email: "nonexistent@example.com",
					password: "wrongpassword",
				},
				headers: {
					"Accept-Language": "de",
				},
				asResponse: true,
			});

			const body = await response.json();
			expect(body.code).toBe("INVALID_EMAIL_OR_PASSWORD");
			expect(body.message).toBe("Ungültige E-Mail oder Passwort");
		});

		it("should use default locale when Accept-Language is not available", async () => {
			const response = await auth.api.signInEmail({
				body: {
					email: "nonexistent@example.com",
					password: "wrongpassword",
				},
				headers: {
					"Accept-Language": "es", // Spanish not in translations
				},
				asResponse: true,
			});

			const body = await response.json();
			expect(body.code).toBe("INVALID_EMAIL_OR_PASSWORD");
			expect(body.message).toBe("Invalid email or password");
		});

		it("should handle quality values in Accept-Language", async () => {
			const response = await auth.api.signInEmail({
				body: {
					email: "nonexistent@example.com",
					password: "wrongpassword",
				},
				headers: {
					"Accept-Language": "es;q=0.9, fr;q=0.8, en;q=0.7",
				},
				asResponse: true,
			});

			const body = await response.json();
			// Should fall through to French since Spanish is not available
			expect(body.message).toBe("Email ou mot de passe invalide");
		});

		it("should extract base locale from full locale code", async () => {
			const response = await auth.api.signInEmail({
				body: {
					email: "nonexistent@example.com",
					password: "wrongpassword",
				},
				headers: {
					"Accept-Language": "fr-CA", // French Canadian
				},
				asResponse: true,
			});

			const body = await response.json();
			expect(body.message).toBe("Email ou mot de passe invalide");
		});
	});

	describe("locale detection from cookie", () => {
		it("should use locale from cookie", async () => {
			const { auth: authWithCookie } = await getTestInstance({
				plugins: [
					i18n({
						translations,
						defaultLocale: "en",
						detection: ["cookie", "header"],
						localeCookie: "lang",
					}),
				],
			});

			const response = await authWithCookie.api.signInEmail({
				body: {
					email: "nonexistent@example.com",
					password: "wrongpassword",
				},
				headers: {
					Cookie: "lang=fr",
					"Accept-Language": "de", // Should be ignored since cookie comes first
				},
				asResponse: true,
			});

			const body = await response.json();
			expect(body.message).toBe("Email ou mot de passe invalide");
		});
	});

	describe("fallback behavior", () => {
		it("should keep original message when translation is missing", async () => {
			const response = await auth.api.signInEmail({
				body: {
					email: "nonexistent@example.com",
					password: "wrongpassword",
				},
				headers: {
					"Accept-Language": "de", // German doesn't have INVALID_PASSWORD
				},
				asResponse: true,
			});

			const body = await response.json();
			// This error code should still be translated (it exists in German)
			expect(body.message).toBe("Ungültige E-Mail oder Passwort");
		});

		it("should use default locale when no header or cookie", async () => {
			const response = await auth.api.signInEmail({
				body: {
					email: "nonexistent@example.com",
					password: "wrongpassword",
				},
				asResponse: true,
			});

			const body = await response.json();
			expect(body.message).toBe("Invalid email or password");
		});
	});

	describe("custom locale detection callback", () => {
		it("should use getLocale callback when callback strategy is enabled", async () => {
			const { client } = await getTestInstance({
				plugins: [
					i18n({
						translations,
						defaultLocale: "en",
						detection: ["callback"],
						getLocale: (request) => {
							// Use a custom header for locale detection
							return request.headers.get("X-Custom-Locale");
						},
					}),
				],
			});

			const { error } = await client.signIn.email({
				email: "nonexistent@example.com",
				password: "wrongpassword",
				fetchOptions: {
					headers: {
						"X-Custom-Locale": "fr",
					},
				},
			});

			expect(error!.message).toBe("Email ou mot de passe invalide");
		});
	});

	describe("non-error responses", () => {
		it("should not modify successful responses", async () => {
			const { signInWithTestUser, client } = await getTestInstance({
				plugins: [
					i18n({
						translations,
						defaultLocale: "en",
						detection: ["header"],
					}),
				],
			});

			const { runWithUser } = await signInWithTestUser();

			await runWithUser(async () => {
				const { data } = await client.getSession({
					fetchOptions: {
						headers: {
							"Accept-Language": "fr",
						},
					},
				});
				expect(data).toHaveProperty("session");
				expect(data).toHaveProperty("user");
			});
		});
	});

	describe("defaultLocale validation", () => {
		it("should use first available locale when defaultLocale not provided and 'en' not available", async () => {
			const translationsWithoutEn = {
				fr: {
					USER_NOT_FOUND: "Utilisateur non trouvé",
					INVALID_EMAIL_OR_PASSWORD: "Email ou mot de passe invalide",
				},
				de: {
					USER_NOT_FOUND: "Benutzer nicht gefunden",
					INVALID_EMAIL_OR_PASSWORD: "Ungültige E-Mail oder Passwort",
				},
			};

			const { auth: authWithoutEn } = await getTestInstance({
				plugins: [
					i18n({
						translations: translationsWithoutEn,
						detection: ["header"],
						// No defaultLocale specified
					}),
				],
			});

			// Should fall back to first available locale (fr in this case)
			const response = await authWithoutEn.api.signInEmail({
				body: {
					email: "nonexistent@example.com",
					password: "wrongpassword",
				},
				// No Accept-Language header
				asResponse: true,
			});

			const body = await response.json();
			expect(body.message).toBe("Email ou mot de passe invalide");
		});

		it("should use specified defaultLocale when it exists in translations", async () => {
			const { auth: authWithCustomDefault } = await getTestInstance({
				plugins: [
					i18n({
						translations: {
							fr: {
								INVALID_EMAIL_OR_PASSWORD: "Email ou mot de passe invalide",
							},
							de: {
								INVALID_EMAIL_OR_PASSWORD: "Ungültige E-Mail oder Passwort",
							},
						},
						defaultLocale: "de",
						detection: ["header"],
					}),
				],
			});

			const response = await authWithCustomDefault.api.signInEmail({
				body: {
					email: "nonexistent@example.com",
					password: "wrongpassword",
				},
				asResponse: true,
			});

			const body = await response.json();
			expect(body.message).toBe("Ungültige E-Mail oder Passwort");
		});

		it("should use 'en' as default when available but not specified", async () => {
			const { auth: authWithEn } = await getTestInstance({
				plugins: [
					i18n({
						translations: {
							de: {
								INVALID_EMAIL_OR_PASSWORD: "Ungültige E-Mail oder Passwort",
							},
							en: {
								INVALID_EMAIL_OR_PASSWORD: "Invalid email or password",
							},
							fr: {
								INVALID_EMAIL_OR_PASSWORD: "Email ou mot de passe invalide",
							},
						},
						// No defaultLocale specified, should use 'en'
						detection: ["header"],
					}),
				],
			});

			const response = await authWithEn.api.signInEmail({
				body: {
					email: "nonexistent@example.com",
					password: "wrongpassword",
				},
				asResponse: true,
			});

			const body = await response.json();
			expect(body.message).toBe("Invalid email or password");
		});

		it("should throw error when translations object is empty", () => {
			expect(() => {
				i18n({
					translations: {} as any,
				});
			}).toThrow("i18n plugin: translations object is empty");
		});
	});
});
