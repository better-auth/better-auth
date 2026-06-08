import { createOTP } from "@better-auth/utils/otp";
import { describe, expect, it } from "vitest";
import { symmetricDecrypt } from "../../crypto";
import {
	expectNoTwoFactorChallenge,
	expectTwoFactorChallenge,
	getTestInstance,
} from "../../test-utils";
import { convertSetCookieToCookie } from "../../test-utils/headers";
import { DEFAULT_SECRET } from "../../utils/constants";
import { twoFactor } from ".";
import type { TwoFactorTotpSecret } from "./types";

describe("two-factor method-first journeys", () => {
	it("returns method descriptors for TOTP sign-in challenges and exposes the pending challenge via cookie state", async () => {
		const { auth, testUser, db } = await getTestInstance({
			secret: DEFAULT_SECRET,
			plugins: [twoFactor()],
		});

		const initialSignIn = await auth.api.signInEmail({
			body: {
				email: testUser.email,
				password: testUser.password,
			},
			asResponse: true,
		});
		const sessionHeaders = convertSetCookieToCookie(initialSignIn.headers);

		const enableResponse = await auth.api.enableTwoFactorTotp({
			body: {
				password: testUser.password,
				label: "Authenticator app",
			},
			headers: sessionHeaders,
		});

		const totpRecord = await db.findOne<TwoFactorTotpSecret>({
			model: "twoFactorTotp",
			where: [{ field: "methodId", value: enableResponse.method.id }],
		});
		const totpSecret = await symmetricDecrypt({
			key: DEFAULT_SECRET,
			data: totpRecord!.secret,
		});
		const totpCode = await createOTP(totpSecret).totp();

		await auth.api.verifyTwoFactor({
			body: {
				methodId: enableResponse.method.id,
				code: totpCode,
			},
			headers: sessionHeaders,
		});

		const challengeResponse = await auth.api.signInEmail({
			body: {
				email: testUser.email,
				password: testUser.password,
			},
			asResponse: true,
		});
		const challengeHeaders = convertSetCookieToCookie(
			challengeResponse.headers,
		);
		const challengeBody = await challengeResponse.json();

		expectTwoFactorChallenge(challengeBody);
		expect(challengeBody.challenge.methods).toHaveLength(2);
		expect(challengeBody.challenge.methods).toEqual(
			expect.arrayContaining([
				{
					id: enableResponse.method.id,
					kind: "totp",
					label: "Authenticator app",
				},
				expect.objectContaining({
					kind: "recovery-code",
					label: null,
				}),
			]),
		);

		const pendingChallenge = await auth.api.getPendingTwoFactorChallenge({
			headers: challengeHeaders,
		});
		expect(pendingChallenge).toEqual({
			kind: "two-factor",
			attemptId: challengeBody.challenge.attemptId,
			methods: challengeBody.challenge.methods,
		});
	});

	it("enrolls OTP as an explicit method and completes sign-in through send-code plus verify", async () => {
		let latestOTP = "";
		const { auth, testUser } = await getTestInstance({
			secret: DEFAULT_SECRET,
			plugins: [
				twoFactor({
					otpOptions: {
						sendOTP({ otp }) {
							latestOTP = otp;
						},
					},
				}),
			],
		});

		const initialSignIn = await auth.api.signInEmail({
			body: {
				email: testUser.email,
				password: testUser.password,
			},
			asResponse: true,
		});
		const sessionHeaders = convertSetCookieToCookie(initialSignIn.headers);

		const enableResponse = await auth.api.enableTwoFactorOtp({
			body: {
				password: testUser.password,
				label: "Email OTP",
			},
			headers: sessionHeaders,
		});
		expect(enableResponse.codeSent).toBe(true);
		expect(latestOTP).not.toBe("");

		await auth.api.verifyTwoFactor({
			body: {
				methodId: enableResponse.method.id,
				code: latestOTP,
			},
			headers: sessionHeaders,
		});

		const challengeResponse = await auth.api.signInEmail({
			body: {
				email: testUser.email,
				password: testUser.password,
			},
			asResponse: true,
		});
		const challengeHeaders = convertSetCookieToCookie(
			challengeResponse.headers,
		);
		const challengeBody = await challengeResponse.json();

		expectTwoFactorChallenge(challengeBody);
		expect(challengeBody.challenge.methods).toEqual(
			expect.arrayContaining([
				{
					id: enableResponse.method.id,
					kind: "otp",
					label: "Email OTP",
				},
				expect.objectContaining({
					kind: "recovery-code",
					label: null,
				}),
			]),
		);

		latestOTP = "";
		await auth.api.sendTwoFactorCode({
			body: {
				methodId: enableResponse.method.id,
			},
			headers: challengeHeaders,
		});
		expect(latestOTP).not.toBe("");

		const verifyResponse = await auth.api.verifyTwoFactor({
			body: {
				methodId: enableResponse.method.id,
				code: latestOTP,
			},
			headers: challengeHeaders,
		});
		expect(verifyResponse.token).toBeDefined();
	});

	it("persists trusted devices as first-class records that can be revoked", async () => {
		let latestOTP = "";
		const { auth, testUser } = await getTestInstance({
			secret: DEFAULT_SECRET,
			plugins: [
				twoFactor({
					otpOptions: {
						sendOTP({ otp }) {
							latestOTP = otp;
						},
					},
				}),
			],
		});

		const initialSignIn = await auth.api.signInEmail({
			body: {
				email: testUser.email,
				password: testUser.password,
			},
			asResponse: true,
		});
		const sessionHeaders = convertSetCookieToCookie(initialSignIn.headers);

		const enableResponse = await auth.api.enableTwoFactorOtp({
			body: { password: testUser.password },
			headers: sessionHeaders,
		});
		await auth.api.verifyTwoFactor({
			body: {
				methodId: enableResponse.method.id,
				code: latestOTP,
			},
			headers: sessionHeaders,
		});

		const challengeResponse = await auth.api.signInEmail({
			body: {
				email: testUser.email,
				password: testUser.password,
			},
			asResponse: true,
		});
		const challengeHeaders = convertSetCookieToCookie(
			challengeResponse.headers,
		);
		const challengeBody = await challengeResponse.json();

		expectTwoFactorChallenge(challengeBody);
		latestOTP = "";
		await auth.api.sendTwoFactorCode({
			body: { methodId: enableResponse.method.id },
			headers: challengeHeaders,
		});
		const verifyResponse = await auth.api.verifyTwoFactor({
			body: {
				methodId: enableResponse.method.id,
				code: latestOTP,
				trustDevice: true,
			},
			headers: challengeHeaders,
			asResponse: true,
		});
		const trustedHeaders = convertSetCookieToCookie(verifyResponse.headers);

		const trustedDevices = await auth.api.listTwoFactorTrustedDevices({
			headers: trustedHeaders,
		});
		expect(trustedDevices.devices).toHaveLength(1);
		expect(trustedDevices.devices[0]?.isCurrent).toBe(true);

		const trustedSignIn = await auth.api.signInEmail({
			body: {
				email: testUser.email,
				password: testUser.password,
			},
			headers: trustedHeaders,
		});
		expectNoTwoFactorChallenge(trustedSignIn);
		expect(trustedSignIn.user.id).toBeDefined();

		await auth.api.revokeTwoFactorTrustedDevice({
			body: {
				deviceId: trustedDevices.devices[0]!.id,
			},
			headers: trustedHeaders,
		});

		const afterRevokeResponse = await auth.api.signInEmail({
			body: {
				email: testUser.email,
				password: testUser.password,
			},
			asResponse: true,
		});
		expectTwoFactorChallenge(await afterRevokeResponse.json());
	});
});
