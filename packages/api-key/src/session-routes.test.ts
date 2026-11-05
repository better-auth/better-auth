import { base32 } from "@better-auth/utils/base32";
import { createOTP } from "@better-auth/utils/otp";
import { organization } from "better-auth/plugins/organization";
import { phoneNumber } from "better-auth/plugins/phone-number";
import { twoFactor } from "better-auth/plugins/two-factor";
import { getTestInstance } from "better-auth/test";
import { assert, describe, expect, it } from "vitest";
import { apiKey } from ".";

/**
 * Sessions synthesized from an API key keep working on routes that read the
 * request's session, and on phone number replacement, which re-reads stored
 * sessions only.
 */
describe("API-key sessions on session routes", () => {
	async function setup() {
		let otp = "";
		const instance = await getTestInstance({
			plugins: [
				apiKey({
					enableSessionForAPIKeys: true,
				}),
				organization(),
				twoFactor(),
				phoneNumber({
					sendOTP: async ({ code }) => {
						otp = code;
					},
				}),
			],
		});
		const { headers, user } = await instance.signInWithTestUser();
		const created = await instance.auth.api.createApiKey({
			body: {
				name: "automation",
			},
			headers,
		});
		const apiKeyHeaders = new Headers({
			"x-api-key": created.key,
		});
		return {
			...instance,
			headers,
			user,
			apiKeyHeaders,
			readOTP: () => otp,
		};
	}

	it("invites an organization member", async () => {
		const { auth, headers, apiKeyHeaders } = await setup();
		const org = await auth.api.createOrganization({
			body: {
				name: "Acme",
				slug: "acme-api-key",
			},
			headers,
		});

		const invitation = await auth.api.createInvitation({
			body: {
				organizationId: org!.id,
				email: "invitee@example.com",
				role: "member",
			},
			headers: apiKeyHeaders,
		});

		expect(invitation.email).toBe("invitee@example.com");
	});

	it("starts TOTP enrollment", async () => {
		const { auth, testUser, apiKeyHeaders } = await setup();

		const enrollment = await auth.api.enableTwoFactor({
			body: {
				password: testUser.password,
			},
			headers: apiKeyHeaders,
		});

		expect(enrollment.method).toBe("totp");
	});

	it("finishes TOTP enrollment", async () => {
		const { auth, testUser, user, apiKeyHeaders } = await setup();
		const enrollment = await auth.api.enableTwoFactor({
			body: {
				password: testUser.password,
			},
			headers: apiKeyHeaders,
		});
		assert(enrollment.method === "totp");
		const secret = new URL(enrollment.totpURI).searchParams.get("secret")!;
		const code = await createOTP(base32.decode(secret)).totp();

		await expect(
			auth.api.verifyTOTP({
				body: {
					code,
				},
				headers: apiKeyHeaders,
			}),
		).resolves.toMatchObject({
			user: {
				id: user.id,
			},
		});

		const context = await auth.$context;
		const stored = await context.internalAdapter.findUserById(user.id);
		expect(stored).toMatchObject({
			twoFactorEnabled: true,
		});
	});

	it("replaces the phone number", async () => {
		const { auth, user, apiKeyHeaders, readOTP } = await setup();
		const number = "+15555550123";
		await auth.api.sendPhoneNumberOTP({
			body: {
				phoneNumber: number,
			},
		});

		await auth.api.verifyPhoneNumber({
			body: {
				phoneNumber: number,
				code: readOTP(),
				updatePhoneNumber: true,
			},
			headers: apiKeyHeaders,
		});

		const context = await auth.$context;
		const stored = await context.internalAdapter.findUserById(user.id);
		expect(stored).toMatchObject({
			phoneNumber: number,
		});
	});
});
