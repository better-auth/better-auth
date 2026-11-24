import type { BetterAuthOptions } from "@better-auth/core";
import { describe, expect, it, vi } from "vitest";
import { parseSetCookieHeader } from "../cookies/cookie-utils";
import { magicLink } from "../plugins/magic-link";
import { oneTimeToken } from "../plugins/one-time-token";
import { siwe } from "../plugins/siwe";
import { twoFactor } from "../plugins/two-factor";
import { convertSetCookieToCookie } from "../test-utils/headers";
import { getTestInstance } from "../test-utils/test-instance";

/**
 * A `verification.create.before` hook that vetoes only while `veto.active` is
 * set, so each test can finish its setup before the call under test.
 */
function vetoingHooks() {
	const veto = { active: false };
	const databaseHooks: BetterAuthOptions["databaseHooks"] = {
		verification: {
			create: {
				async before() {
					return veto.active ? false : undefined;
				},
			},
		},
	};
	return { veto, databaseHooks };
}

async function expectVerificationFailure(res: Response) {
	expect(res.status).toBe(500);
	expect((await res.json()).code).toBe("FAILED_TO_CREATE_VERIFICATION");
}

/**
 * @see https://better-auth.com/docs/concepts/database#database-hooks
 */
describe("verification records vetoed by a database hook", () => {
	it("does not send a magic link that was not stored", async () => {
		const { veto, databaseHooks } = vetoingHooks();
		const sendMagicLink = vi.fn();
		const { auth } = await getTestInstance({
			databaseHooks,
			plugins: [magicLink({ sendMagicLink })],
		});
		veto.active = true;

		await expectVerificationFailure(
			await auth.api.signInMagicLink({
				body: { email: "veto@test.com" },
				headers: new Headers(),
				asResponse: true,
			}),
		);
		expect(sendMagicLink).not.toHaveBeenCalled();
	});

	it("does not send a password reset link that was not stored, and does not reveal the account", async () => {
		const { veto, databaseHooks } = vetoingHooks();
		const sendResetPassword = vi.fn();
		const { auth, testUser } = await getTestInstance({
			databaseHooks,
			emailAndPassword: { enabled: true, sendResetPassword },
		});
		veto.active = true;
		const request = (email: string) =>
			auth.api.requestPasswordReset({ body: { email }, asResponse: true });

		const known = await request(testUser.email);
		const unknown = await request("missing@test.com");

		expect(known.status).toBe(200);
		expect(await known.json()).toEqual(await unknown.json());
		expect(sendResetPassword).not.toHaveBeenCalled();
	});

	it("does not send an account deletion link that was not stored", async () => {
		const { veto, databaseHooks } = vetoingHooks();
		const sendDeleteAccountVerification = vi.fn();
		const { auth, signInWithTestUser } = await getTestInstance({
			databaseHooks,
			user: { deleteUser: { enabled: true, sendDeleteAccountVerification } },
		});
		const { headers } = await signInWithTestUser();
		veto.active = true;

		await expectVerificationFailure(
			await auth.api.deleteUser({ body: {}, headers, asResponse: true }),
		);
		expect(sendDeleteAccountVerification).not.toHaveBeenCalled();
	});

	it("does not return a one-time token that was not stored", async () => {
		const { veto, databaseHooks } = vetoingHooks();
		const { auth, signInWithTestUser } = await getTestInstance({
			databaseHooks,
			plugins: [oneTimeToken()],
		});
		const { headers } = await signInWithTestUser();
		veto.active = true;

		await expectVerificationFailure(
			await auth.api.generateOneTimeToken({ headers, asResponse: true }),
		);
	});

	it("does not return a SIWE nonce that was not stored", async () => {
		const { veto, databaseHooks } = vetoingHooks();
		const { auth } = await getTestInstance({
			databaseHooks,
			plugins: [
				siwe({
					domain: "example.com",
					async getNonce() {
						return "A1b2C3d4E5f6G7h8J";
					},
					async verifyMessage() {
						return true;
					},
				}),
			],
		});
		veto.active = true;

		await expectVerificationFailure(
			await auth.api.getSiweNonce({ asResponse: true }),
		);
	});

	describe("two-factor", () => {
		async function setup() {
			const { veto, databaseHooks } = vetoingHooks();
			const sentCodes: string[] = [];
			const sendOTP = vi.fn(({ otp }: { otp: string }) => {
				sentCodes.push(otp);
			});
			const { auth, testUser } = await getTestInstance({
				databaseHooks,
				plugins: [twoFactor({ otpOptions: { sendOTP } })],
			});
			const ctx = await auth.$context;
			const found = await ctx.internalAdapter.findUserByEmail(testUser.email);
			const userId = found!.user.id;
			await ctx.internalAdapter.updateUser(userId, {
				twoFactorEnabled: true,
			});
			const signIn = () =>
				auth.api.signInEmail({
					body: { email: testUser.email, password: testUser.password },
					asResponse: true,
				});
			return {
				auth,
				ctx,
				veto,
				sendOTP,
				sentCodes,
				userId,
				signIn,
				testUserEmail: testUser.email,
				testUserPassword: testUser.password,
			};
		}

		it("fails sign-in without a session when the challenge is not stored", async () => {
			const { ctx, veto, userId, signIn } = await setup();
			const sessionIds = async () =>
				(await ctx.internalAdapter.listSessions(userId)).map((s) => s.id);
			const before = await sessionIds();
			veto.active = true;

			const res = await signIn();

			await expectVerificationFailure(res);
			const cookies = parseSetCookieHeader(res.headers.get("set-cookie") ?? "");
			expect(cookies.get("better-auth.session_token")?.value ?? "").toBe("");
			expect(await sessionIds()).toEqual(before);
		});

		it("does not send a two-factor OTP that was not stored", async () => {
			const { auth, veto, sendOTP, signIn } = await setup();
			const challenge = convertSetCookieToCookie((await signIn()).headers);
			veto.active = true;

			await expectVerificationFailure(
				await auth.api.sendTwoFactorOTP({
					headers: challenge,
					body: {},
					asResponse: true,
				}),
			);
			expect(sendOTP).not.toHaveBeenCalled();
		});

		it("does not set a trust-device cookie when the trust record is not stored", async () => {
			const { auth, veto, sentCodes, signIn } = await setup();
			const challenge = convertSetCookieToCookie((await signIn()).headers);
			await auth.api.sendTwoFactorOTP({ headers: challenge, body: {} });
			veto.active = true;

			const res = await auth.api.verifyTwoFactorOTP({
				headers: challenge,
				body: { code: sentCodes[0]!, trustDevice: true },
				asResponse: true,
			});

			expect(res.status).toBe(200);
			const cookies = parseSetCookieHeader(res.headers.get("set-cookie") ?? "");
			expect(cookies.get("better-auth.session_token")?.value).toBeTruthy();
			expect(cookies.has("better-auth.trust_device")).toBe(false);
		});

		it("stops trusting a device when the rotated trust record is not stored", async () => {
			const { auth, veto, sentCodes, signIn, testUserEmail, testUserPassword } =
				await setup();
			const challenge = convertSetCookieToCookie((await signIn()).headers);
			await auth.api.sendTwoFactorOTP({ headers: challenge, body: {} });
			const verified = await auth.api.verifyTwoFactorOTP({
				headers: challenge,
				body: { code: sentCodes[0]!, trustDevice: true },
				asResponse: true,
			});
			const trustCookie = parseSetCookieHeader(
				verified.headers.get("set-cookie") ?? "",
			).get("better-auth.trust_device")?.value;
			expect(trustCookie).toBeTruthy();
			veto.active = true;

			const res = await auth.api.signInEmail({
				body: { email: testUserEmail, password: testUserPassword },
				headers: new Headers({
					cookie: `better-auth.trust_device=${trustCookie}`,
				}),
				asResponse: true,
			});

			expect(res.status).toBe(200);
			const cookies = parseSetCookieHeader(res.headers.get("set-cookie") ?? "");
			expect(cookies.get("better-auth.session_token")?.value).toBeTruthy();
			expect(cookies.get("better-auth.trust_device")?.value).toBe("");
		});
	});
});
