import { getTestInstance } from "better-auth/test";
import { describe, expect, it } from "vitest";
import { admin } from "../../better-auth/src/plugins/admin";
import { adminClient } from "../../better-auth/src/plugins/admin/client";
import { anonymous } from "../../better-auth/src/plugins/anonymous";
import { anonymousClient } from "../../better-auth/src/plugins/anonymous/client";
import { emailOTP } from "../../better-auth/src/plugins/email-otp";
import { organization } from "../../better-auth/src/plugins/organization";
import { organizationClient } from "../../better-auth/src/plugins/organization/client";
import { phoneNumber } from "../../better-auth/src/plugins/phone-number";
import { twoFactor } from "../../better-auth/src/plugins/two-factor";
import { username } from "../../better-auth/src/plugins/username";
import { i18n } from ".";
import * as locales from "./locales";

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
						getLocale: (ctx) => {
							return ctx.headers?.get("X-Custom-Locale") ?? null;
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

		/**
		 * @see https://github.com/better-auth/better-auth/issues/7805
		 */
		it("should call getLocale callback even when request is undefined (auth.api)", async () => {
			const { auth: authWithCallback } = await getTestInstance({
				plugins: [
					i18n({
						translations,
						defaultLocale: "en",
						detection: ["callback"],
						getLocale: () => {
							return "fr";
						},
					}),
				],
			});

			const response = await authWithCallback.api.signInEmail({
				body: {
					email: "nonexistent@example.com",
					password: "wrongpassword",
				},
				asResponse: true,
			});

			const body = await response.json();
			expect(body.code).toBe("INVALID_EMAIL_OR_PASSWORD");
			expect(body.message).toBe("Email ou mot de passe invalide");
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
		it("should use default 'en' locale when defaultLocale not provided and 'en' not available on translations", async () => {
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

			// Should keep the original built-in English message because the
			// default locale resolves to "en" and no translations.en is provided.
			const response = await authWithoutEn.api.signInEmail({
				body: {
					email: "nonexistent@example.com",
					password: "wrongpassword",
				},
				// No Accept-Language header
				asResponse: true,
			});

			const body = await response.json();
			expect(body.message).toBe("Invalid email or password");
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

	describe("built-in locales", () => {
		it("should export all expected built-in locales", () => {
			const expectedLocales = ["de", "en", "fr"];

			for (const locale of expectedLocales) {
				expect(locales).toHaveProperty(locale);
				expect(typeof (locales as Record<string, unknown>)[locale]).toBe(
					"object",
				);
			}
		});

		it("should translate errors using built-in locales", async () => {
			const { auth: authWithBuiltInLocales } = await getTestInstance({
				plugins: [
					i18n({
						translations: locales,
						defaultLocale: "en",
						detection: ["header"],
					}),
				],
			});

			const response = await authWithBuiltInLocales.api.signInEmail({
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
			expect(body.message).toBe(locales.fr.INVALID_EMAIL_OR_PASSWORD);
		});

		it("should contain common error codes in every built-in locale", () => {
			const requiredKeys = [
				"USER_NOT_FOUND",
				"INVALID_PASSWORD",
				"INVALID_EMAIL",
				"INVALID_EMAIL_OR_PASSWORD",
				"EMAIL_NOT_VERIFIED",
				"PASSWORD_TOO_SHORT",
				"PASSWORD_TOO_LONG",
				"USER_ALREADY_EXISTS",
				"SESSION_EXPIRED",
				"ACCOUNT_NOT_FOUND",
			];

			for (const [locale, dict] of Object.entries(locales)) {
				for (const key of requiredKeys) {
					expect(
						dict,
						`Locale "${locale}" is missing key "${key}"`,
					).toHaveProperty(key);
					expect(
						typeof (dict as Record<string, unknown>)[key],
						`Locale "${locale}" key "${key}" must be a non-empty string`,
					).toBe("string");
					const value = (dict as Record<string, string>)[key];
					expect(
						value?.length ?? 0,
						`Locale "${locale}" key "${key}" must not be empty`,
					).toBeGreaterThan(0);
				}
			}
		});
	});

	describe("plugin-specific translations integration", () => {
		it("should translate email OTP errors to French when Accept-Language is fr", async () => {
			const { auth } = await getTestInstance({
				plugins: [
					emailOTP({
						sendVerificationOTP: async () => {},
					}),
					i18n({
						translations: locales,
						defaultLocale: "en",
						detection: ["header"],
					}),
				],
			});

			const response = await auth.api.verifyEmailOTP({
				body: {
					email: "test@example.com",
					otp: "wrong-code",
				},
				headers: {
					"Accept-Language": "fr",
				},
				asResponse: true,
			});

			const body = await response.json();
			expect(body.code).toBe("INVALID_OTP");
			expect(body.message).toBe("Code OTP invalide");
		});

		it("should translate two-factor cookie errors to German when Accept-Language is de", async () => {
			const { auth } = await getTestInstance({
				plugins: [
					twoFactor(),
					i18n({
						translations: locales,
						defaultLocale: "en",
						detection: ["header"],
					}),
				],
			});

			const response = await auth.api.verifyBackupCode({
				body: {
					code: "invalid-backup-code",
				},
				headers: {
					"Accept-Language": "de",
				},
				asResponse: true,
			});

			const body = await response.json();
			expect(body.code).toBe("INVALID_TWO_FACTOR_COOKIE");
			expect(body.message).toBe("Ungültiges Zwei-Faktor-Cookie");
		});

		it("should translate username errors to French when Accept-Language is fr", async () => {
			const { auth } = await getTestInstance({
				plugins: [
					username(),
					i18n({
						translations: locales,
						defaultLocale: "en",
						detection: ["header"],
					}),
				],
			});

			const response = await auth.api.signInUsername({
				body: {
					username: "nonexistent",
					password: "wrongpassword",
				},
				headers: {
					"Accept-Language": "fr",
				},
				asResponse: true,
			});

			const body = await response.json();
			expect(body.code).toBe("INVALID_USERNAME_OR_PASSWORD");
			expect(body.message).toBe("Nom d'utilisateur ou mot de passe invalide");
		});

		it("should translate phone-number errors to French when Accept-Language is fr", async () => {
			const { auth } = await getTestInstance({
				plugins: [
					phoneNumber({
						sendOTP: async () => {},
					}),
					i18n({
						translations: locales,
						defaultLocale: "en",
						detection: ["header"],
					}),
				],
			});

			const response = await auth.api.signInPhoneNumber({
				body: {
					phoneNumber: "+1234567890",
					password: "wrongpassword",
				},
				headers: {
					"Accept-Language": "fr",
				},
				asResponse: true,
			});

			const body = await response.json();
			expect(body.code).toBe("INVALID_PHONE_NUMBER_OR_PASSWORD");
			expect(body.message).toBe("Numéro de téléphone ou mot de passe invalide");
		});

		it("should translate anonymous errors to French when Accept-Language is fr", async () => {
			const { client, sessionSetter } = await getTestInstance(
				{
					plugins: [
						anonymous({
							disableDeleteAnonymousUser: true,
						}),
						i18n({
							translations: locales,
							defaultLocale: "en",
							detection: ["header"],
						}),
					],
				},
				{
					clientOptions: {
						plugins: [anonymousClient()],
					},
				},
			);

			const headers = new Headers();
			await client.signIn.anonymous({
				fetchOptions: { onSuccess: sessionSetter(headers) },
			});

			headers.set("Accept-Language", "fr");

			const { error } = await client.deleteAnonymousUser({
				fetchOptions: {
					headers,
				},
			});

			expect(error!.code).toBe("DELETE_ANONYMOUS_USER_DISABLED");
			expect(error!.message).toBe(
				"La suppression des utilisateurs anonymes est désactivée",
			);
		});

		it("should translate admin errors to French when Accept-Language is fr", async () => {
			const { client, signInWithTestUser } = await getTestInstance(
				{
					plugins: [
						admin(),
						i18n({
							translations: locales,
							defaultLocale: "en",
							detection: ["header"],
						}),
					],
				},
				{
					clientOptions: {
						plugins: [adminClient()],
					},
				},
			);

			const { headers } = await signInWithTestUser();
			headers.set("Accept-Language", "fr");

			const { error } = await client.admin.impersonateUser({
				userId: "non-existent-id",
				fetchOptions: {
					headers,
				},
			});

			expect(error!.code).toBe("YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS");
			expect(error!.message).toBe(
				"Vous n'êtes pas autorisé à usurper l'identité d'utilisateurs",
			);
		});

		it("should translate organization errors to French when Accept-Language is fr", async () => {
			const { client, signInWithTestUser } = (await getTestInstance(
				{
					plugins: [
						organization(),
						i18n({
							translations: locales,
							defaultLocale: "en",
							detection: ["header"],
						}),
					],
				},
				{
					clientOptions: {
						plugins: [organizationClient() as any],
					},
				},
			)) as any;

			const { headers } = await signInWithTestUser();
			headers.set("Accept-Language", "fr");

			const { error } = await client.organization.acceptInvitation({
				invitationId: "non-existent-id",
				fetchOptions: {
					headers,
				},
			});

			expect(error!.code).toBe("INVITATION_NOT_FOUND");
			expect(error!.message).toBe("Invitation non trouvée");
		});
	});
});
