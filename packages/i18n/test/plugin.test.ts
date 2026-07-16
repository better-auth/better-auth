import { apiKey } from "@better-auth/api-key";
import { apiKeyClient } from "@better-auth/api-key/client";
import { electron } from "@better-auth/electron";
import { passkey } from "@better-auth/passkey";
import { passkeyClient } from "@better-auth/passkey/client";
import { sso } from "@better-auth/sso";
import { ssoClient } from "@better-auth/sso/client";
import { stripe } from "@better-auth/stripe";
import { stripeClient } from "@better-auth/stripe/client";
import { getTestInstance } from "better-auth/test";
import { describe, expect, it } from "vitest";
import { admin } from "../../better-auth/src/plugins/admin";
import { adminClient } from "../../better-auth/src/plugins/admin/client";
import { anonymous } from "../../better-auth/src/plugins/anonymous";
import { anonymousClient } from "../../better-auth/src/plugins/anonymous/client";
import { emailOTP } from "../../better-auth/src/plugins/email-otp";
import { multiSession } from "../../better-auth/src/plugins/multi-session";
import { multiSessionClient } from "../../better-auth/src/plugins/multi-session/client";
import { organization } from "../../better-auth/src/plugins/organization";
import { organizationClient } from "../../better-auth/src/plugins/organization/client";
import { phoneNumber } from "../../better-auth/src/plugins/phone-number";
import { twoFactor } from "../../better-auth/src/plugins/two-factor";
import { username } from "../../better-auth/src/plugins/username";
import { i18n } from "../src";
import * as locales from "../src/locales";

describe("i18n plugin - Plugins", async () => {
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

		it("should translate multi-session errors to French when Accept-Language is fr", async () => {
			const { client } = (await getTestInstance(
				{
					plugins: [
						multiSession(),
						i18n({
							translations: locales,
							defaultLocale: "en",
							detection: ["header"],
						}),
					],
				},
				{
					clientOptions: {
						plugins: [multiSessionClient() as any],
					},
				},
			)) as any;

			const { error } = await client.multiSession.setActive({
				sessionToken: "invalid-token",
				fetchOptions: {
					headers: {
						"Accept-Language": "fr",
					},
				},
			});

			expect(error!.code).toBe("INVALID_SESSION_TOKEN");
			expect(error!.message).toBe("Jeton de session invalide");
		});

		it("should translate passkey errors to German when Accept-Language is de", async () => {
			const { client } = (await getTestInstance(
				{
					plugins: [
						passkey({
							registration: {
								requireSession: false,
							},
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
						plugins: [passkeyClient()],
					},
				},
			)) as any;

			const { error } = await client.$fetch(
				"/passkey/generate-register-options",
				{
					method: "GET",
					headers: {
						"Accept-Language": "de",
					},
				},
			);

			expect(error!.code).toBe("RESOLVE_USER_REQUIRED");
			expect(error!.message).toBe(
				"Die Passkey-Registrierung erfordert entweder eine authentifizierte Sitzung oder einen resolveUser-Callback, wenn requireSession false ist",
			);
		});

		it("should translate api-key errors to French when Accept-Language is fr", async () => {
			const { client } = await getTestInstance(
				{
					plugins: [
						apiKey(),
						i18n({
							translations: locales,
							defaultLocale: "en",
							detection: ["header"],
						}),
					],
				},
				{
					clientOptions: {
						plugins: [apiKeyClient()],
					},
				},
			);

			const { error } = await client.apiKey.create(
				{
					name: "test",
				},
				{
					headers: {
						"Accept-Language": "fr",
					},
				},
			);

			expect(error!.code).toBe("UNAUTHORIZED_SESSION");
			expect(error!.message).toBe("Session non autorisée ou invalide");
		});

		it("should translate stripe errors to French when Accept-Language is fr", async () => {
			const { client } = await getTestInstance(
				{
					plugins: [
						stripe({
							stripeClient: {} as any,
							stripeWebhookSecret: "mock-secret",
							subscription: {
								enabled: true,
								plans: [],
							},
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
						plugins: [stripeClient({ subscription: true })],
					},
				},
			);

			const { error } = await client.subscription.upgrade(
				{
					plan: "premium",
				},
				{
					headers: {
						"Accept-Language": "fr",
					},
				},
			);

			expect(error!.code).toBe("UNAUTHORIZED");
			expect(error!.message).toBe("Accès non autorisé");
		});

		it("should translate sso errors to French when Accept-Language is fr", async () => {
			const { client } = (await getTestInstance(
				{
					plugins: [
						sso(),
						i18n({
							translations: locales,
							defaultLocale: "en",
							detection: ["header"],
						}),
					],
				},
				{
					clientOptions: {
						plugins: [ssoClient()],
					},
				},
			)) as any;

			const { error } = await client.$fetch(
				"/sso/saml2/sp/slo/nonexistent-provider",
				{
					method: "POST",
					headers: {
						"Accept-Language": "fr",
					},
				},
			);

			expect(error!.code).toBe("SINGLE_LOGOUT_NOT_ENABLED");
			expect(error!.message).toBe(
				"La déconnexion unique (Single Logout) n'est pas activée",
			);
		});

		it("should translate electron errors to French when Accept-Language is fr", async () => {
			const { client } = (await getTestInstance({
				plugins: [
					electron(),
					i18n({
						translations: locales,
						defaultLocale: "en",
						detection: ["header"],
					}),
				],
			})) as any;

			const { error } = await client.$fetch("/electron/token", {
				method: "POST",
				body: {
					token: "fake-token",
					state: "fake-state",
					code_verifier: "fake-verifier",
				},
				headers: {
					"Accept-Language": "fr",
				},
			});

			expect(error!.code).toBe("INVALID_TOKEN");
			expect(error!.message).toBe("Jeton invalide ou expiré.");
		});
	});
});
