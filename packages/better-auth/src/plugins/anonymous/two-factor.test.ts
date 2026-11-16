import { getTestInstance } from "better-auth/test";
import { describe, expect, it, vi } from "vitest";
import { applySetCookies } from "../../cookies/cookie-utils";
import { twoFactor } from "../two-factor";
import { anonymous } from ".";

/**
 * A password sign-in to an account with two-factor enabled is not complete
 * until the second factor is verified, whichever order the plugins run in.
 */
describe("anonymous linking waits for a pending second factor", () => {
	it.for(["anonymous-first", "two-factor-first"] as const)(
		"does not link or delete the anonymous user (%s)",
		async (order) => {
			const onLinkAccount = vi.fn();
			const anon = anonymous({ onLinkAccount });
			const secondFactor = twoFactor({
				skipVerificationOnEnable: true,
				otpOptions: { sendOTP() {} },
			});
			const { auth, signInWithTestUser, testUser } = await getTestInstance({
				plugins:
					order === "anonymous-first"
						? [anon, secondFactor]
						: [secondFactor, anon],
			});
			const { headers } = await signInWithTestUser();
			await auth.api.enableTwoFactor({
				body: { password: testUser.password },
				headers,
			});
			const anonymousSignIn = await auth.api.signInAnonymous({
				returnHeaders: true,
			});
			const cookie = anonymousSignIn.headers.get("set-cookie")!.split(";")[0]!;
			const anonymousUserId = anonymousSignIn.response!.user.id;

			const signIn = await auth.api.signInEmail({
				body: {
					email: testUser.email,
					password: testUser.password,
				},
				headers: new Headers({ cookie }),
			});

			expect(signIn).toMatchObject({ twoFactorRedirect: true });
			expect(onLinkAccount).not.toHaveBeenCalled();
			const ctx = await auth.$context;
			expect(
				await ctx.internalAdapter.findUserById(anonymousUserId),
			).not.toBeNull();
		},
	);
});

/**
 * A trusted device completes sign-in without another second-factor challenge.
 *
 * @see https://www.better-auth.com/docs/plugins/2fa#trusted-devices
 */
it.for(["anonymous-first", "two-factor-first"] as const)(
	"links the anonymous account when a trusted device completes two-factor sign-in (%s)",
	async (order) => {
		const codes: string[] = [];
		const onLinkAccount = vi.fn();
		const anon = anonymous({
			onLinkAccount,
		});
		const secondFactor = twoFactor({
			skipVerificationOnEnable: true,
			otpOptions: {
				sendOTP({ otp }) {
					codes.push(otp);
				},
			},
		});
		const { auth, signInWithTestUser, testUser } = await getTestInstance({
			plugins:
				order === "anonymous-first"
					? [anon, secondFactor]
					: [secondFactor, anon],
		});
		const { headers } = await signInWithTestUser();
		await auth.api.enableTwoFactor({
			body: {
				password: testUser.password,
			},
			headers,
		});
		const challenge = await auth.api.signInEmail({
			body: {
				email: testUser.email,
				password: testUser.password,
			},
			returnHeaders: true,
		});
		const challengeHeaders = new Headers();
		applySetCookies(challengeHeaders, challenge.headers.getSetCookie());
		await auth.api.sendTwoFactorOTP({
			headers: challengeHeaders,
		});
		const verification = await auth.api.verifyTwoFactorOTP({
			body: {
				code: codes.at(-1)!,
				trustDevice: true,
			},
			headers: challengeHeaders,
			returnHeaders: true,
		});
		const trustCookie = verification.headers
			.getSetCookie()
			.find((cookie) => cookie.startsWith("better-auth.trust_device="))!
			.split(";")[0]!;
		const anonymousSignIn = await auth.api.signInAnonymous({
			returnHeaders: true,
		});
		const anonymousCookie = anonymousSignIn.headers
			.get("set-cookie")!
			.split(";")[0]!;
		const anonymousUserId = anonymousSignIn.response!.user.id;
		const signIn = await auth.api.signInEmail({
			body: {
				email: testUser.email,
				password: testUser.password,
			},
			headers: new Headers({
				cookie: `${anonymousCookie}; ${trustCookie}`,
			}),
		});

		expect(signIn).toMatchObject({
			token: expect.any(String),
			user: {
				email: testUser.email,
			},
		});
		expect(onLinkAccount).toHaveBeenCalledWith(
			expect.objectContaining({
				anonymousUser: expect.objectContaining({
					user: expect.objectContaining({
						id: anonymousUserId,
					}),
				}),
				newUser: expect.objectContaining({
					user: expect.objectContaining({
						email: testUser.email,
					}),
				}),
			}),
		);
		const ctx = await auth.$context;
		expect(await ctx.internalAdapter.findUserById(anonymousUserId)).toBeNull();
	},
);
