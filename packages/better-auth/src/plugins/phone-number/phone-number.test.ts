import type { SecondaryStorage } from "@better-auth/core/db";
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	expectTypeOf,
	it,
	vi,
} from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { bearer } from "../bearer";
import { emailOTP } from "../email-otp";
import { phoneNumber } from ".";
import { phoneNumberClient } from "./client";

describe("phone-number", async () => {
	let otp = "";

	const { client, sessionSetter } = await getTestInstance(
		{
			plugins: [
				phoneNumber({
					async sendOTP({ code }) {
						otp = code;
					},
					signUpOnVerification: {
						getTempEmail(phoneNumber) {
							return `temp-${phoneNumber}`;
						},
					},
				}),
			],
		},
		{
			clientOptions: {
				plugins: [phoneNumberClient()],
			},
		},
	);

	const headers = new Headers();

	const testPhoneNumber = "+251911121314";

	afterEach(() => {
		vi.useRealTimers();
	});

	it("should send verification code", async () => {
		const res = await client.phoneNumber.sendOtp({
			phoneNumber: testPhoneNumber,
		});
		expect(res.error).toBe(null);
		expect(otp).toHaveLength(6);
	});

	it("should verify phone number", async () => {
		const res = await client.phoneNumber.verify(
			{
				phoneNumber: testPhoneNumber,
				code: otp,
			},
			{
				onSuccess: sessionSetter(headers),
			},
		);
		expect(res.error).toBe(null);
		expect(res.data?.status).toBe(true);
	});

	it("shouldn't verify again with the same code", async () => {
		const res = await client.phoneNumber.verify({
			phoneNumber: testPhoneNumber,
			code: otp,
		});
		expect(res.error?.status).toBe(400);
	});

	it("should update phone number", async () => {
		const newPhoneNumber = "+0123456789";
		await client.phoneNumber.sendOtp({
			phoneNumber: newPhoneNumber,
			fetchOptions: {
				headers,
			},
		});
		await client.phoneNumber.verify({
			phoneNumber: newPhoneNumber,
			updatePhoneNumber: true,
			code: otp,
			fetchOptions: {
				headers,
			},
		});
		const user = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(user.data?.user.phoneNumber).toBe(newPhoneNumber);
		expect(user.data?.user.phoneNumberVerified).toBe(true);
	});

	it("should not verify if code expired", async () => {
		vi.useFakeTimers();
		await client.phoneNumber.sendOtp({
			phoneNumber: "+25120201212",
		});
		vi.advanceTimersByTime(1000 * 60 * 5 + 1); // 5 minutes + 1ms
		const res = await client.phoneNumber.verify({
			phoneNumber: "+25120201212",
			code: otp,
		});
		expect(res.error?.status).toBe(400);
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/9754
 */
describe("consume phone-number OTP", async () => {
	let otp = "";
	const callbackOnVerification = vi.fn();
	const { auth, client, db } = await getTestInstance(
		{
			plugins: [
				phoneNumber({
					async sendOTP({ code }) {
						otp = code;
					},
					callbackOnVerification,
				}),
			],
		},
		{
			disableTestUser: true,
			clientOptions: {
				plugins: [phoneNumberClient()],
			},
		},
	);

	it("consumes an OTP server-side without creating a user or session", async () => {
		const phoneNumber = "+251911121301";
		await client.phoneNumber.sendOtp({ phoneNumber });

		const result = await auth.api.consumePhoneNumberOTP({
			body: { phoneNumber, code: otp },
		});

		expect(result).toEqual({ status: true });
		expect(callbackOnVerification).not.toHaveBeenCalled();
		expect(
			await db.findMany({
				model: "user",
				where: [{ field: "phoneNumber", value: phoneNumber }],
			}),
		).toHaveLength(0);
		expect(
			await (await auth.$context).internalAdapter.findVerificationValue(
				`phone-number-otp-${phoneNumber}`,
			),
		).toBeNull();
	});

	it("keeps a reset request from replacing another number's code", async () => {
		const phoneNumber = "+251911121302";
		const lookalike = `${phoneNumber}-request-password-reset`;
		await client.phoneNumber.sendOtp({ phoneNumber: lookalike });

		await client.phoneNumber.requestPasswordReset({ phoneNumber });

		await expect(
			auth.api.consumePhoneNumberOTP({
				body: {
					phoneNumber: lookalike,
					code: otp,
				},
			}),
		).resolves.toEqual({ status: true });
	});

	it("is exposed through the server API only", async () => {
		expectTypeOf<typeof auth.api>().toHaveProperty("consumePhoneNumberOTP");
		expectTypeOf<typeof client.phoneNumber>().not.toHaveProperty("consumeOtp");

		const response = await client.$fetch("/phone-number/consume-otp", {
			method: "POST",
			body: { phoneNumber: "+251911121302", code: "123456" },
		});
		expect(response.error?.status).toBe(404);
	});

	it("keeps attempt limiting active when a stored attempt count is corrupt", async () => {
		const phoneNumber = "+251911121303";
		await client.phoneNumber.sendOtp({ phoneNumber });
		await (await auth.$context).internalAdapter.updateVerificationByIdentifier(
			phoneNumber,
			{
				value: `${otp}:not-a-number`,
			},
		);

		for (let attempt = 0; attempt < 3; attempt++) {
			const res = await client.phoneNumber.verify({
				phoneNumber,
				code: "000000",
			});
			expect(res.error?.status).toBe(400);
			expect(res.error?.message).toBe("Invalid OTP");
		}

		const blocked = await client.phoneNumber.verify({
			phoneNumber,
			code: "000000",
		});
		expect(blocked.error?.status).toBe(403);
		expect(blocked.error?.message).toBe("Too many attempts");
	});

	it("honors allowedAttempts set to 0", async () => {
		let zeroAttemptOtp = "";
		const { auth: zeroAttemptAuth, client: zeroAttemptClient } =
			await getTestInstance(
				{
					plugins: [
						phoneNumber({
							async sendOTP({ code }) {
								zeroAttemptOtp = code;
							},
							allowedAttempts: 0,
						}),
					],
				},
				{
					disableTestUser: true,
					clientOptions: {
						plugins: [phoneNumberClient()],
					},
				},
			);
		const testPhoneNumber = "+251911121304";
		await zeroAttemptClient.phoneNumber.sendOtp({
			phoneNumber: testPhoneNumber,
		});

		await expect(
			zeroAttemptAuth.api.consumePhoneNumberOTP({
				body: { phoneNumber: testPhoneNumber, code: zeroAttemptOtp },
			}),
		).rejects.toThrow("Too many attempts");
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/4839
 */
describe("phone-number callbackOnVerification on updatePhoneNumber", async () => {
	let otp = "";
	const callbackOnVerification = vi.fn();

	const { client, sessionSetter } = await getTestInstance(
		{
			plugins: [
				phoneNumber({
					async sendOTP({ code }) {
						otp = code;
					},
					callbackOnVerification,
					signUpOnVerification: {
						getTempEmail(phoneNumber) {
							return `temp-${phoneNumber}`;
						},
					},
				}),
			],
		},
		{
			clientOptions: {
				plugins: [phoneNumberClient()],
			},
		},
	);

	const headers = new Headers();
	const initialPhoneNumber = "+251911121314";
	const updatedPhoneNumber = "+0123456789";

	it("fires when verifying a new phone number on an authenticated session", async () => {
		await client.phoneNumber.sendOtp({ phoneNumber: initialPhoneNumber });
		await client.phoneNumber.verify(
			{ phoneNumber: initialPhoneNumber, code: otp },
			{ onSuccess: sessionSetter(headers) },
		);
		callbackOnVerification.mockClear();

		await client.phoneNumber.sendOtp({
			phoneNumber: updatedPhoneNumber,
			fetchOptions: { headers },
		});
		const res = await client.phoneNumber.verify({
			phoneNumber: updatedPhoneNumber,
			updatePhoneNumber: true,
			code: otp,
			fetchOptions: { headers },
		});

		expect(res.error).toBe(null);
		expect(res.data?.status).toBe(true);
		expect(callbackOnVerification).toHaveBeenCalledTimes(1);
		expect(callbackOnVerification).toHaveBeenCalledWith(
			expect.objectContaining({
				phoneNumber: updatedPhoneNumber,
				user: expect.objectContaining({
					phoneNumber: updatedPhoneNumber,
					phoneNumberVerified: true,
				}),
			}),
			expect.any(Object),
		);
	});
});

describe("phone-number send otp error handling", async () => {
	const sendOTP = vi.fn(async () => {
		throw new Error("SMS provider error");
	});

	const { client } = await getTestInstance(
		{
			plugins: [
				phoneNumber({
					sendOTP,
				}),
			],
		},
		{
			clientOptions: {
				plugins: [phoneNumberClient()],
			},
		},
	);

	it("should return an error when sendOTP fails without background tasks", async () => {
		const res = await client.phoneNumber.sendOtp({
			phoneNumber: "+251922334455",
		});

		expect(sendOTP).toHaveBeenCalledOnce();
		expect(res.error?.status).toBe(500);
		expect(res.data).toBe(null);
	});
});

describe("phone-number send otp background task handling", async () => {
	const sendOTP = vi.fn(async () => {
		throw new Error("SMS provider error");
	});
	const backgroundTaskHandler = vi.fn((promise: Promise<unknown>) => {
		void promise;
	});

	const { client } = await getTestInstance(
		{
			advanced: {
				backgroundTasks: {
					handler: backgroundTaskHandler,
				},
			},
			plugins: [
				phoneNumber({
					sendOTP,
				}),
			],
		},
		{
			clientOptions: {
				plugins: [phoneNumberClient()],
			},
		},
	);

	it("should keep succeeding when sendOTP fails in a background task", async () => {
		const res = await client.phoneNumber.sendOtp({
			phoneNumber: "+251955667788",
		});

		expect(sendOTP).toHaveBeenCalledOnce();
		expect(backgroundTaskHandler).toHaveBeenCalledOnce();
		expect(res.error).toBe(null);
		expect(res.data?.message).toBe("code sent");
	});
});

describe("phone-number send otp background handler failures", async () => {
	const sendOTP = vi.fn(async () => {});
	const backgroundTaskHandler = vi.fn(() => {
		throw new Error("Background task handler error");
	});

	const { client } = await getTestInstance(
		{
			advanced: {
				backgroundTasks: {
					handler: backgroundTaskHandler,
				},
			},
			plugins: [
				phoneNumber({
					sendOTP,
				}),
			],
		},
		{
			clientOptions: {
				plugins: [phoneNumberClient()],
			},
		},
	);

	it("should keep succeeding when the background task handler throws", async () => {
		const res = await client.phoneNumber.sendOtp({
			phoneNumber: "+251988776655",
		});

		expect(sendOTP).toHaveBeenCalledOnce();
		expect(backgroundTaskHandler).toHaveBeenCalledOnce();
		expect(res.error).toBe(null);
		expect(res.data?.message).toBe("code sent");
	});
});

describe("phone auth flow", async () => {
	let otp = "";

	const { client, sessionSetter, auth } = await getTestInstance(
		{
			plugins: [
				phoneNumber({
					async sendOTP({ code }) {
						otp = code;
					},
					signUpOnVerification: {
						getTempEmail(phoneNumber) {
							return `temp-${phoneNumber}`;
						},
					},
				}),
				bearer(),
			],
			user: {
				changeEmail: {
					enabled: true,
					updateEmailWithoutVerification: true,
				},
			},
		},
		{
			clientOptions: {
				plugins: [phoneNumberClient()],
			},
		},
	);

	it("should send otp", async () => {
		const res = await client.phoneNumber.sendOtp({
			phoneNumber: "+251911121314",
		});
		expect(res.error).toBe(null);
		expect(otp).toHaveLength(6);
	});

	it("should verify phone number and create user & session", async () => {
		const res = await client.phoneNumber.verify({
			phoneNumber: "+251911121314",
			code: otp,
		});
		const session = await client.getSession({
			fetchOptions: {
				headers: {
					Authorization: `Bearer ${res.data?.token}`,
				},
				throw: true,
			},
		});
		expect(session?.user.phoneNumberVerified).toBe(true);
		expect(session?.user.email).toBe("temp-+251911121314");
		expect(session?.session.token).toBeDefined();
	});

	const headers = new Headers();
	it("should go through send-verify and sign-in the user", async () => {
		await client.phoneNumber.sendOtp({
			phoneNumber: "+251911121314",
		});
		const res = await client.phoneNumber.verify(
			{
				phoneNumber: "+251911121314",
				code: otp,
			},
			{
				onSuccess: sessionSetter(headers),
			},
		);
		expect(res.data?.status).toBe(true);
	});

	const newEmail = "new-email@email.com";
	it("should set password and update user", async () => {
		await auth.api.setPassword({
			body: {
				newPassword: "password",
			},
			headers,
		});
		const changedEmailRes = await client.changeEmail({
			newEmail,
			fetchOptions: {
				headers,
			},
		});
		expect(changedEmailRes.error).toBe(null);
		expect(changedEmailRes.data?.status).toBe(true);
		const session = await client.getSession({
			fetchOptions: { headers, throw: true },
		});
		const userId = session!.user.id;
		await expect(
			(await auth.$context).internalAdapter.findCredentialAccount(userId),
		).resolves.toMatchObject({
			userId,
			providerId: "credential",
			accountId: userId,
		});
		const emailSignIn = await client.signIn.email({
			email: newEmail,
			password: "password",
		});
		expect(emailSignIn.data?.user.id).toBe(userId);
	});

	it("should sign in with phone number and password", async () => {
		const res = await client.signIn.phoneNumber({
			phoneNumber: "+251911121314",
			password: "password",
		});
		expect(res.data?.token).toBeDefined();
	});

	it("should sign in with new email", async () => {
		const res = await client.signIn.email({
			email: newEmail,
			password: "password",
		});
		console.log(res);
		expect(res.error).toBe(null);
	});
});

describe("verify phone-number", async () => {
	let otp = "";

	const { client, sessionSetter } = await getTestInstance(
		{
			plugins: [
				phoneNumber({
					async sendOTP({ code }) {
						otp = code;
					},
					signUpOnVerification: {
						getTempEmail(phoneNumber) {
							return `temp-${phoneNumber}`;
						},
					},
					allowedAttempts: 3,
				}),
			],
		},
		{
			clientOptions: {
				plugins: [phoneNumberClient()],
			},
		},
	);

	const headers = new Headers();

	const testPhoneNumber = "+251911121314";

	afterEach(() => {
		vi.useRealTimers();
	});

	it("should verify the last code", async () => {
		await client.phoneNumber.sendOtp({
			phoneNumber: testPhoneNumber,
		});
		vi.useFakeTimers();
		vi.advanceTimersByTime(1000);
		await client.phoneNumber.sendOtp({
			phoneNumber: testPhoneNumber,
		});
		vi.advanceTimersByTime(1000);
		await client.phoneNumber.sendOtp({
			phoneNumber: testPhoneNumber,
		});
		const res = await client.phoneNumber.verify(
			{
				phoneNumber: testPhoneNumber,
				code: otp,
			},
			{
				onSuccess: sessionSetter(headers),
			},
		);
		expect(res.error).toBe(null);
		expect(res.data?.status).toBe(true);
	});

	it("should block after exceeding allowed attempts", async () => {
		await client.phoneNumber.sendOtp({
			phoneNumber: testPhoneNumber,
		});

		for (let i = 0; i < 3; i++) {
			const res = await client.phoneNumber.verify({
				phoneNumber: testPhoneNumber,
				code: "000000",
			});
			expect(res.error?.status).toBe(400);
			expect(res.error?.message).toBe("Invalid OTP");
		}

		//Try one more time - should be blocked
		const res = await client.phoneNumber.verify({
			phoneNumber: testPhoneNumber,
			code: "000000",
		});
		expect(res.error?.status).toBe(403);
		expect(res.error?.message).toBe("Too many attempts");
	});
});

describe("verify phone-number race condition protection", async () => {
	let otp = "";

	const { client, auth } = await getTestInstance(
		{
			plugins: [
				phoneNumber({
					async sendOTP({ code }) {
						otp = code;
					},
					signUpOnVerification: {
						getTempEmail(phoneNumber) {
							return `temp-${phoneNumber}`;
						},
					},
					allowedAttempts: 3,
				}),
			],
		},
		{
			clientOptions: {
				plugins: [phoneNumberClient()],
			},
		},
	);
	const authCtx = await auth.$context;

	it("should allow exactly one success when the same code is verified concurrently", async () => {
		const phoneNumber = "+251900000001";
		await client.phoneNumber.sendOtp({ phoneNumber });

		// Force both verifications to read the live OTP row before either
		// consumes it. Without an atomic consume gate, both would read a valid
		// code and both would mint a session; the gate must let only one win.
		const originalFind = authCtx.internalAdapter.findVerificationValue;
		let entered = 0;
		let releaseBarrier!: () => void;
		const barrier = new Promise<void>((resolve) => {
			releaseBarrier = resolve;
		});
		authCtx.internalAdapter.findVerificationValue = (async (
			identifier: string,
			...rest: unknown[]
		) => {
			const result = await (
				originalFind as (...args: unknown[]) => Promise<unknown>
			)(identifier, ...rest);
			if (identifier === `phone-number-otp-${phoneNumber}`) {
				entered++;
				if (entered >= 2) releaseBarrier();
				await barrier;
			}
			return result;
		}) as typeof authCtx.internalAdapter.findVerificationValue;

		try {
			const results = await Promise.all([
				client.phoneNumber.verify({ phoneNumber, code: otp }),
				client.phoneNumber.verify({ phoneNumber, code: otp }),
			]);

			const successes = results.filter((r) => r.data?.status === true);
			const failures = results.filter((r) => r.error);
			expect(successes).toHaveLength(1);
			expect(failures).toHaveLength(1);
			// The loser must be cleanly rejected by the OTP gate, not fail by
			// accident downstream after both consumed the same code.
			expect(failures[0]!.error?.status).toBe(400);
			expect(failures[0]!.error?.message).toBe("Invalid OTP");
		} finally {
			authCtx.internalAdapter.findVerificationValue = originalFind;
		}

		const verificationValue =
			await authCtx.internalAdapter.findVerificationValue(
				`phone-number-otp-${phoneNumber}`,
			);
		expect(verificationValue).toBeNull();
	});

	it("should increment the stored attempt counter by exactly one per wrong code", async () => {
		const phoneNumber = "+251900000002";
		await client.phoneNumber.sendOtp({ phoneNumber });
		const correctCode = otp;

		for (let expectedAttempts = 1; expectedAttempts <= 2; expectedAttempts++) {
			const res = await client.phoneNumber.verify({
				phoneNumber,
				code: "000000",
			});
			expect(res.error?.status).toBe(400);
			expect(res.error?.message).toBe("Invalid OTP");

			const stored = await authCtx.internalAdapter.findVerificationValue(
				`phone-number-otp-${phoneNumber}`,
			);
			expect(stored).not.toBeNull();
			const [storedValue, attempts] = stored!.value.split(":");
			// The original code survives each wrong attempt so the user can
			// still redeem it, and the counter advances by exactly one.
			expect(storedValue).toBe(correctCode);
			expect(attempts).toBe(String(expectedAttempts));
		}

		const res = await client.phoneNumber.verify({
			phoneNumber,
			code: correctCode,
		});
		expect(res.error).toBe(null);
		expect(res.data?.status).toBe(true);

		const consumed = await authCtx.internalAdapter.findVerificationValue(
			`phone-number-otp-${phoneNumber}`,
		);
		expect(consumed).toBeNull();
	});
});

describe("reset password flow attempts", async () => {
	let otp = "";
	let resetOtp = "";

	const { auth, client, db } = await getTestInstance(
		{
			plugins: [
				phoneNumber({
					async sendOTP({ code }) {
						console.log("sendOTP", code);
						otp = code;
					},
					sendPasswordResetOTP(data, request) {
						resetOtp = data.code;
					},
					signUpOnVerification: {
						getTempEmail(phoneNumber) {
							return `temp-${phoneNumber}`;
						},
					},
					allowedAttempts: 3,
				}),
			],
		},
		{
			clientOptions: {
				plugins: [phoneNumberClient()],
			},
		},
	);

	const testPhoneNumber = "+251911121314";

	it("should block reset password after exceeding allowed attempts", async () => {
		//register phone number
		await client.phoneNumber.sendOtp({
			phoneNumber: testPhoneNumber,
		});
		await client.phoneNumber.verify({
			phoneNumber: testPhoneNumber,
			code: otp,
		});

		await client.phoneNumber.requestPasswordReset({
			phoneNumber: testPhoneNumber,
		});

		for (let i = 0; i < 3; i++) {
			const res = await client.phoneNumber.resetPassword({
				phoneNumber: testPhoneNumber,
				otp: otp,
				newPassword: "password",
			});
			expect(res.error?.status).toBe(400);
			expect(res.error?.message).toBe("Invalid OTP");
		}

		const res = await client.phoneNumber.resetPassword({
			phoneNumber: testPhoneNumber,
			otp: otp,
			newPassword: "password",
		});
		expect(res.error?.status).toBe(403);
		expect(res.error?.message).toBe("Too many attempts");
	});

	it("should successfully reset password with correct code", async () => {
		await client.phoneNumber.requestPasswordReset({
			phoneNumber: testPhoneNumber,
		});

		const resetPasswordRes = await client.phoneNumber.resetPassword({
			phoneNumber: testPhoneNumber,
			otp: resetOtp,
			newPassword: "password",
		});

		expect(resetPasswordRes.error).toBe(null);
		expect(resetPasswordRes.data?.status).toBe(true);
	});

	it("should reset password and create credential account", async () => {
		const testUser2 = {
			email: "test-user2@email.com",
			phoneNumber: "+2519111213142",
		};
		await client.phoneNumber.sendOtp({
			phoneNumber: testUser2.phoneNumber,
		});
		await db.create({
			model: "user",
			data: {
				name: "Test User",
				email: testUser2.email,
				phoneNumber: testUser2.phoneNumber,
			},
		});
		await client.phoneNumber.requestPasswordReset({
			phoneNumber: testUser2.phoneNumber,
		});
		await client.phoneNumber.resetPassword({
			phoneNumber: testUser2.phoneNumber,
			otp: resetOtp,
			newPassword: "password",
		});
		const res = await client.signIn.email({
			email: testUser2.email,
			password: "password",
		});
		expect(res.data?.token).toBeDefined();
		const userId = res.data!.user.id;
		await expect(
			(await auth.$context).internalAdapter.findCredentialAccount(userId),
		).resolves.toMatchObject({
			userId,
			providerId: "credential",
			accountId: userId,
		});
	});

	it("shouldn't allow to re-use the same OTP code", async () => {
		const res = await client.phoneNumber.resetPassword({
			phoneNumber: testPhoneNumber,
			otp: resetOtp,
			newPassword: "password",
		});
		expect(res.error?.status).toBe(400);
	});
});

describe("reset password guess accounting", async () => {
	let otp = "";
	let resetOtp = "";
	const { auth, client } = await getTestInstance(
		{
			plugins: [
				phoneNumber({
					async sendOTP({ code }) {
						otp = code;
					},
					sendPasswordResetOTP({ code }) {
						resetOtp = code;
					},
					signUpOnVerification: {
						getTempEmail(phoneNumber) {
							return `temp-${phoneNumber}`;
						},
					},
				}),
			],
		},
		{
			disableTestUser: true,
			clientOptions: {
				plugins: [phoneNumberClient()],
			},
		},
	);

	it("compares no more than the allowed attempts of concurrent reset guesses", async () => {
		const phoneNumber = "+251911121320";
		const identifier = `phone-number-reset-${phoneNumber}`;
		await client.phoneNumber.sendOtp({ phoneNumber });
		await client.phoneNumber.verify({ phoneNumber, code: otp });
		await client.phoneNumber.requestPasswordReset({ phoneNumber });
		const wrong = resetOtp === "000000" ? "111111" : "000000";

		const { internalAdapter } = await auth.$context;
		const verify = internalAdapter.verifyVerificationValue;
		let compared = 0;
		const spy = vi
			.spyOn(internalAdapter, "verifyVerificationValue")
			.mockImplementation((id, options) =>
				verify(id, {
					...options,
					async matches(storedCode) {
						compared++;
						await new Promise((resolve) => setTimeout(resolve, 5));
						return options.matches(storedCode);
					},
				}),
			);
		const burst = await Promise.all(
			Array.from({ length: 5 }, () =>
				client.phoneNumber.resetPassword({
					phoneNumber,
					otp: wrong,
					newPassword: "new-password",
				}),
			),
		);
		spy.mockRestore();

		expect(compared).toBe(3);
		for (const res of burst) {
			expect(["INVALID_OTP", "TOO_MANY_ATTEMPTS", "OTP_NOT_FOUND"]).toContain(
				res.error?.code,
			);
		}
		const reset = await client.phoneNumber.resetPassword({
			phoneNumber,
			otp: resetOtp,
			newPassword: "new-password",
		});
		expect(reset.data).toBeNull();
		expect(await internalAdapter.findVerificationValue(identifier)).toBeNull();
	});
});

describe("reset password with requireVerification", async () => {
	let otp = "";
	const sendPasswordResetOTP = vi.fn();
	const { auth, client, db } = await getTestInstance(
		{
			plugins: [
				phoneNumber({
					async sendOTP({ code }) {
						otp = code;
					},
					sendPasswordResetOTP,
					requireVerification: true,
					signUpOnVerification: {
						getTempEmail(phoneNumber) {
							return `temp-${phoneNumber}`;
						},
					},
				}),
			],
		},
		{
			disableTestUser: true,
			clientOptions: {
				plugins: [phoneNumberClient()],
			},
		},
	);

	beforeEach(() => {
		sendPasswordResetOTP.mockClear();
	});

	it("does not reset the password through an unverified number", async () => {
		const phoneNumber = "+251911121340";
		const email = "unverified-phone@test.com";
		const signUp = await client.signUp.email({
			email,
			password: "old-password",
			name: "unverified",
		});
		await db.update({
			model: "user",
			where: [{ field: "id", value: signUp.data!.user.id }],
			update: { phoneNumber },
		});

		const requested = await client.phoneNumber.requestPasswordReset({
			phoneNumber,
		});
		expect(requested.data?.status).toBe(true);
		expect(sendPasswordResetOTP).not.toHaveBeenCalled();

		const stored = await (
			await auth.$context
		).internalAdapter.findVerificationValue(
			`phone-number-reset-${phoneNumber}`,
		);
		const reset = await client.phoneNumber.resetPassword({
			phoneNumber,
			otp: stored!.value.split(":")[0]!,
			newPassword: "new-password",
		});
		expect(reset.error?.code).toBe("PHONE_NUMBER_PENDING_VERIFICATION");
		const signIn = await client.signIn.email({
			email,
			password: "old-password",
		});
		expect(signIn.error).toBeNull();
	});

	it("does not add a password to a passwordless account through an unverified number", async () => {
		const phoneNumber = "+251911121342";
		const user = await db.create<{ id: string }>({
			model: "user",
			data: {
				name: "passwordless",
				email: "passwordless-phone@test.com",
				phoneNumber,
			},
		});
		await client.phoneNumber.requestPasswordReset({ phoneNumber });
		const stored = await (
			await auth.$context
		).internalAdapter.findVerificationValue(
			`phone-number-reset-${phoneNumber}`,
		);

		const reset = await client.phoneNumber.resetPassword({
			phoneNumber,
			otp: stored!.value.split(":")[0]!,
			newPassword: "new-password",
		});

		expect(reset.error?.code).toBe("PHONE_NUMBER_PENDING_VERIFICATION");
		expect(
			await (await auth.$context).internalAdapter.findCredentialAccount(
				user.id,
			),
		).toBeNull();
	});

	it("resets the password through a verified number", async () => {
		const phoneNumber = "+251911121341";
		await client.phoneNumber.sendOtp({ phoneNumber });
		await client.phoneNumber.verify({ phoneNumber, code: otp });

		await client.phoneNumber.requestPasswordReset({ phoneNumber });
		expect(sendPasswordResetOTP).toHaveBeenCalledOnce();
		const reset = await client.phoneNumber.resetPassword({
			phoneNumber,
			otp: sendPasswordResetOTP.mock.calls[0]![0].code,
			newPassword: "new-password",
		});
		expect(reset.error).toBeNull();
	});
});

describe("reset password session revocation", async () => {
	let otp = "";
	let resetOtp = "";

	const { auth, client, sessionSetter } = await getTestInstance(
		{
			emailAndPassword: {
				enabled: true,
				revokeSessionsOnPasswordReset: true,
			},
			plugins: [
				phoneNumber({
					async sendOTP({ code }) {
						otp = code;
					},
					sendPasswordResetOTP(data, request) {
						resetOtp = data.code;
					},
					signUpOnVerification: {
						getTempEmail(phoneNumber) {
							return `temp-${phoneNumber}`;
						},
					},
				}),
			],
		},
		{
			clientOptions: {
				plugins: [phoneNumberClient()],
			},
		},
	);

	const testPhoneNumber = "+251911000000";

	it("should revoke all sessions after password reset when configured", async () => {
		const headers = new Headers();

		await client.phoneNumber.sendOtp({
			phoneNumber: testPhoneNumber,
		});

		const verifyRes = await client.phoneNumber.verify(
			{
				phoneNumber: testPhoneNumber,
				code: otp,
			},
			{
				onSuccess: sessionSetter(headers),
			},
		);

		expect(verifyRes.error).toBe(null);

		const sessionBefore = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(sessionBefore.data?.user).toBeTruthy();

		await client.phoneNumber.requestPasswordReset({
			phoneNumber: testPhoneNumber,
		});

		const resetRes = await client.phoneNumber.resetPassword({
			phoneNumber: testPhoneNumber,
			otp: resetOtp,
			newPassword: "new-secure-password",
		});

		expect(resetRes.error).toBe(null);
		expect(resetRes.data?.status).toBe(true);

		const sessionAfter = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(sessionAfter.data).toBe(null);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11597
	 */
	it("keeps the old password and sessions when session revocation fails", async () => {
		const phoneNumber = "+251911000001";
		const headers = new Headers();
		await client.phoneNumber.sendOtp({ phoneNumber });
		await client.phoneNumber.verify(
			{ phoneNumber, code: otp },
			{ onSuccess: sessionSetter(headers) },
		);
		const ctx = await auth.$context;
		const revoke = vi
			.spyOn(ctx.internalAdapter, "deleteUserSessions")
			.mockRejectedValue(new Error("session store unavailable"));

		await client.phoneNumber.requestPasswordReset({ phoneNumber });
		const resetRes = await client.phoneNumber.resetPassword({
			phoneNumber,
			otp: resetOtp,
			newPassword: "new-secure-password",
		});
		revoke.mockRestore();

		expect(resetRes.error?.status).toBe(500);
		const signInRes = await client.signIn.phoneNumber({
			phoneNumber,
			password: "new-secure-password",
		});
		expect(signInRes.error).not.toBeNull();
		const session = await client.getSession({ fetchOptions: { headers } });
		expect(session.data?.user).toBeTruthy();
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/10632
	 */
	it("leaves the OTP usable when the new password is rejected", async () => {
		const phoneNumber = "+251911000002";
		await client.phoneNumber.sendOtp({ phoneNumber });
		await client.phoneNumber.verify({ phoneNumber, code: otp });
		const ctx = await auth.$context;
		const hash = vi
			.spyOn(ctx.password, "hash")
			.mockRejectedValueOnce(new Error("password rejected"));
		await client.phoneNumber.requestPasswordReset({ phoneNumber });
		const resetWith = (newPassword: string) =>
			client.phoneNumber.resetPassword({
				phoneNumber,
				otp: resetOtp,
				newPassword,
			});

		expect((await resetWith("pwned-password")).error).not.toBeNull();
		hash.mockRestore();
		expect((await resetWith("safe-password")).data?.status).toBe(true);
		const signInRes = await client.signIn.phoneNumber({
			phoneNumber,
			password: "safe-password",
		});
		expect(signInRes.data).not.toBeNull();
	});
});

describe("reset password onPasswordReset callback", async () => {
	let otp = "";
	let resetOtp = "";
	const onPasswordReset = vi.fn();

	const { client, sessionSetter } = await getTestInstance(
		{
			emailAndPassword: {
				enabled: true,
				onPasswordReset,
			},
			plugins: [
				phoneNumber({
					async sendOTP({ code }) {
						otp = code;
					},
					sendPasswordResetOTP(data) {
						resetOtp = data.code;
					},
					signUpOnVerification: {
						getTempEmail(phoneNumber) {
							return `temp-${phoneNumber}`;
						},
					},
				}),
			],
		},
		{
			clientOptions: {
				plugins: [phoneNumberClient()],
			},
		},
	);

	const testPhoneNumber = "+251911999888";

	it("should call onPasswordReset after phone number password reset", async () => {
		const headers = new Headers();

		await client.phoneNumber.sendOtp({
			phoneNumber: testPhoneNumber,
		});
		await client.phoneNumber.verify(
			{
				phoneNumber: testPhoneNumber,
				code: otp,
			},
			{
				onSuccess: sessionSetter(headers),
			},
		);

		await client.phoneNumber.requestPasswordReset({
			phoneNumber: testPhoneNumber,
		});

		const res = await client.phoneNumber.resetPassword({
			phoneNumber: testPhoneNumber,
			otp: resetOtp,
			newPassword: "new-password-123",
		});

		expect(res.error).toBe(null);
		expect(res.data?.status).toBe(true);
		expect(onPasswordReset).toHaveBeenCalledOnce();
		expect(onPasswordReset).toHaveBeenCalledWith(
			expect.objectContaining({
				user: expect.objectContaining({
					phoneNumber: testPhoneNumber,
				}),
			}),
			expect.anything(),
		);
	});
});

describe("phone number verification requirement", async () => {
	let otp = "";
	const { client, db } = await getTestInstance(
		{
			plugins: [
				phoneNumber({
					async sendOTP({ code }) {
						otp = code;
					},
					requireVerification: true,
					signUpOnVerification: {
						getTempEmail(phoneNumber) {
							return `temp-${phoneNumber}`;
						},
					},
				}),
			],
			user: {
				changeEmail: {
					enabled: true,
				},
			},
		},
		{
			clientOptions: {
				plugins: [phoneNumberClient()],
			},
		},
	);

	const testPhoneNumber = "+251911121314";
	const testPassword = "password123";
	const testEmail = "test2@test.com";

	it("should not allow sign in with unverified phone number and trigger OTP send", async () => {
		const signUp = await client.signUp.email({
			email: testEmail,
			password: testPassword,
			name: "test",
		});
		await db.update({
			model: "user",
			where: [{ field: "id", value: signUp.data!.user.id }],
			update: { phoneNumber: testPhoneNumber },
		});
		const signInRes = await client.signIn.phoneNumber({
			phoneNumber: testPhoneNumber,
			password: testPassword,
		});
		expect(signInRes.error?.status).toBe(401);
		expect(signInRes.error?.code).toMatch("PHONE_NUMBER_NOT_VERIFIED");
		expect(otp).toHaveLength(6);
	});
});

describe("phone number at user creation", () => {
	const phoneNumberValue = "+251911121330";

	it("rejects a phone number sent with email sign-up", async () => {
		const { client, db } = await getTestInstance(
			{
				plugins: [phoneNumber()],
			},
			{
				disableTestUser: true,
				clientOptions: {
					plugins: [phoneNumberClient()],
				},
			},
		);

		const res = await client.signUp.email({
			email: "claimant@test.com",
			password: "password123",
			name: "claimant",
			phoneNumber: phoneNumberValue,
		});

		expect(res.error?.code).toBe("PHONE_NUMBER_CANNOT_BE_SET");
		expect(
			await db.findMany({
				model: "user",
				where: [{ field: "phoneNumber", value: phoneNumberValue }],
			}),
		).toHaveLength(0);
	});

	it("treats an empty phone number on email sign-up as no number", async () => {
		const { client, db } = await getTestInstance(
			{
				plugins: [phoneNumber()],
			},
			{
				disableTestUser: true,
				clientOptions: {
					plugins: [phoneNumberClient()],
				},
			},
		);

		for (const email of ["empty-1@test.com", "empty-2@test.com"]) {
			const res = await client.signUp.email({
				email,
				password: "password123",
				name: "empty",
				phoneNumber: "",
			});
			expect(res.error).toBeNull();
		}
		expect(
			await db.findMany({
				model: "user",
				where: [{ field: "phoneNumber", value: "" }],
			}),
		).toHaveLength(0);
	});

	it("rejects a phone number sent with email OTP sign-in", async () => {
		let otp = "";
		const { auth, db } = await getTestInstance(
			{
				plugins: [
					phoneNumber(),
					emailOTP({
						async sendVerificationOTP(data) {
							otp = data.otp;
						},
					}),
				],
			},
			{
				disableTestUser: true,
			},
		);
		const email = "otp-claimant@test.com";
		await auth.api.sendVerificationOTP({
			body: {
				email,
				type: "sign-in",
			},
		});

		await expect(
			auth.api.signInEmailOTP({
				body: {
					email,
					otp,
					phoneNumber: phoneNumberValue,
				},
			}),
		).rejects.toMatchObject({
			body: {
				code: "PHONE_NUMBER_CANNOT_BE_SET",
			},
		});
		expect(
			await db.findMany({
				model: "user",
				where: [{ field: "phoneNumber", value: phoneNumberValue }],
			}),
		).toHaveLength(0);
	});

	it("drops a phone number mapped from a social provider profile", async () => {
		const email = "social-claimant@test.com";
		const { auth, db } = await getTestInstance(
			{
				plugins: [phoneNumber()],
				socialProviders: {
					google: {
						clientId: "test-client",
						clientSecret: "test-secret",
						verifyIdToken: async () => true,
						mapProfileToUser: () => ({
							phoneNumber: phoneNumberValue,
						}),
					},
				},
			},
			{
				disableTestUser: true,
			},
		);
		const claims = {
			sub: "google-social-claimant",
			email,
			email_verified: true,
			name: "Social Claimant",
		};
		const encode = (value: object) =>
			Buffer.from(JSON.stringify(value)).toString("base64url");
		const idToken = `${encode({ alg: "none" })}.${encode(claims)}.signature`;

		const res = await auth.api.signInSocial({
			body: {
				provider: "google",
				idToken: {
					token: idToken,
				},
			},
		});

		expect(res).toMatchObject({
			user: {
				email,
			},
		});
		const user = await db.findOne<{ phoneNumber: string | null }>({
			model: "user",
			where: [{ field: "email", value: email }],
		});
		expect(user?.phoneNumber ?? null).toBeNull();
	});

	it("still stores a number verified through the plugin", async () => {
		let otp = "";
		const { client, db } = await getTestInstance(
			{
				plugins: [
					phoneNumber({
						async sendOTP({ code }) {
							otp = code;
						},
						signUpOnVerification: {
							getTempEmail(phoneNumber) {
								return `temp-${phoneNumber}`;
							},
						},
					}),
				],
			},
			{
				disableTestUser: true,
				clientOptions: {
					plugins: [phoneNumberClient()],
				},
			},
		);
		await client.phoneNumber.sendOtp({ phoneNumber: phoneNumberValue });

		const res = await client.phoneNumber.verify({
			phoneNumber: phoneNumberValue,
			code: otp,
		});

		expect(res.error).toBeNull();
		expect(
			await db.findOne({
				model: "user",
				where: [{ field: "phoneNumber", value: phoneNumberValue }],
			}),
		).toMatchObject({
			phoneNumberVerified: true,
		});
	});
});

/**
 * @see https://owasp.org/www-community/attacks/Account_Takeover
 */
describe("phone number on account linking", () => {
	const phoneNumberValue = "+251911121331";
	const email = "linked@test.com";
	const encode = (value: object) =>
		Buffer.from(JSON.stringify(value)).toString("base64url");
	const idToken = `${encode({ alg: "none" })}.${encode({
		sub: "google-linked",
		email,
		email_verified: true,
		name: "Linked",
	})}.signature`;

	const setup = async (mappedPhoneNumber = phoneNumberValue) => {
		const { auth, db } = await getTestInstance(
			{
				plugins: [phoneNumber()],
				account: {
					accountLinking: {
						updateUserInfoOnLink: true,
					},
				},
				socialProviders: {
					google: {
						clientId: "test-client",
						clientSecret: "test-secret",
						verifyIdToken: async () => true,
						mapProfileToUser: () => ({
							phoneNumber: mappedPhoneNumber,
						}),
					},
				},
			},
			{
				disableTestUser: true,
			},
		);
		const ctx = await auth.$context;
		const user = await ctx.internalAdapter.createUser(
			{
				email,
				name: "Linked",
				emailVerified: true,
			},
			{ method: "test" },
		);
		const link = () =>
			auth.api.signInSocial({
				body: {
					provider: "google",
					idToken: {
						token: idToken,
					},
				},
			});
		const stored = () =>
			db.findOne<{
				phoneNumber: string | null;
				phoneNumberVerified: boolean | null;
			}>({
				model: "user",
				where: [{ field: "id", value: user.id }],
			});
		return { ctx, user, link, stored };
	};

	it("does not store a number mapped from the linked provider profile", async () => {
		const { link, stored } = await setup();

		await link();

		expect((await stored())?.phoneNumber ?? null).toBeNull();
	});

	it("keeps a verified number when the provider maps the same number", async () => {
		const { ctx, user, link, stored } = await setup();
		await ctx.internalAdapter.updateUser(user.id, {
			phoneNumber: phoneNumberValue,
			phoneNumberVerified: true,
		});

		await link();

		expect(await stored()).toMatchObject({
			phoneNumber: phoneNumberValue,
			phoneNumberVerified: true,
		});
	});

	it("keeps a verified number when the provider maps an empty number", async () => {
		const { ctx, user, link, stored } = await setup("");
		await ctx.internalAdapter.updateUser(user.id, {
			phoneNumber: phoneNumberValue,
			phoneNumberVerified: true,
		});

		await link();

		expect(await stored()).toMatchObject({
			phoneNumber: phoneNumberValue,
			phoneNumberVerified: true,
		});
	});

	it("control: stores a number written by server code outside a request", async () => {
		const { ctx, user, stored } = await setup();

		await ctx.internalAdapter.updateUser(user.id, {
			phoneNumber: phoneNumberValue,
		});

		expect((await stored())?.phoneNumber).toBe(phoneNumberValue);
	});
});

describe("updateUser phone number update prevention", async () => {
	let otp = "";

	const { client, sessionSetter } = await getTestInstance(
		{
			plugins: [
				phoneNumber({
					async sendOTP({ code }) {
						otp = code;
					},
					signUpOnVerification: {
						getTempEmail(phoneNumber) {
							return `temp-${phoneNumber}`;
						},
					},
				}),
			],
		},
		{
			clientOptions: {
				plugins: [phoneNumberClient()],
			},
		},
	);

	const headers = new Headers();
	const initialPhoneNumber = "+251911121314";
	const newPhoneNumber = "+9876543210";

	it("should prevent updating phone number via updateUser", async () => {
		// First, verify a phone number to set phoneNumberVerified to true
		await client.phoneNumber.sendOtp({
			phoneNumber: initialPhoneNumber,
		});
		const verifyRes = await client.phoneNumber.verify(
			{
				phoneNumber: initialPhoneNumber,
				code: otp,
			},
			{
				onSuccess: sessionSetter(headers),
			},
		);
		expect(verifyRes.error).toBe(null);
		expect(verifyRes.data?.status).toBe(true);

		// Verify that phoneNumberVerified is true after verification
		const sessionBeforeUpdate = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(sessionBeforeUpdate.data?.user.phoneNumberVerified).toBe(true);
		expect(sessionBeforeUpdate.data?.user.phoneNumber).toBe(initialPhoneNumber);

		// Attempt to update the phone number via updateUser - should throw an error
		const updateRes = await client.updateUser({
			phoneNumber: newPhoneNumber,
			fetchOptions: {
				headers,
			},
		});
		expect(updateRes.error).not.toBe(null);
		expect(updateRes.error?.status).toBe(400);
		expect(updateRes.error?.message).toBe("Phone number cannot be updated");

		// Verify that the phone number hasn't changed and phoneNumberVerified is still true
		const sessionAfterUpdate = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(sessionAfterUpdate.data?.user.phoneNumberVerified).toBe(true);
		expect(sessionAfterUpdate.data?.user.phoneNumber).toBe(initialPhoneNumber);
	});
});

describe("updateUser phone number disassociation", async () => {
	let otp = "";

	const { client, sessionSetter } = await getTestInstance(
		{
			plugins: [
				phoneNumber({
					async sendOTP({ code }) {
						otp = code;
					},
					signUpOnVerification: {
						getTempEmail(phoneNumber) {
							return `temp-${phoneNumber}`;
						},
					},
				}),
			],
		},
		{
			clientOptions: {
				plugins: [phoneNumberClient()],
			},
		},
	);

	const originalHeaders = new Headers();
	const reclaimerHeaders = new Headers();
	const sharedPhoneNumber = "+251911121314";

	it("should null phone number and reset verified flag atomically", async () => {
		await client.phoneNumber.sendOtp({ phoneNumber: sharedPhoneNumber });
		const verifyRes = await client.phoneNumber.verify(
			{ phoneNumber: sharedPhoneNumber, code: otp },
			{ onSuccess: sessionSetter(originalHeaders) },
		);
		expect(verifyRes.error).toBe(null);

		const updateRes = await client.updateUser({
			phoneNumber: null,
			fetchOptions: { headers: originalHeaders },
		});
		expect(updateRes.error).toBe(null);

		const session = await client.getSession({
			fetchOptions: { headers: originalHeaders },
		});
		expect(session.data?.user.phoneNumber).toBe(null);
		expect(session.data?.user.phoneNumberVerified).toBe(false);
	});

	it("should let another user claim the released number via verify", async () => {
		await client.signUp.email(
			{
				email: "reclaimer@test.com",
				password: "password123",
				name: "reclaimer",
			},
			{ onSuccess: sessionSetter(reclaimerHeaders) },
		);

		await client.phoneNumber.sendOtp({
			phoneNumber: sharedPhoneNumber,
			fetchOptions: { headers: reclaimerHeaders },
		});
		const verifyRes = await client.phoneNumber.verify({
			phoneNumber: sharedPhoneNumber,
			code: otp,
			updatePhoneNumber: true,
			fetchOptions: { headers: reclaimerHeaders },
		});
		expect(verifyRes.error).toBe(null);

		const reclaimerSession = await client.getSession({
			fetchOptions: { headers: reclaimerHeaders },
		});
		expect(reclaimerSession.data?.user.phoneNumber).toBe(sharedPhoneNumber);
		expect(reclaimerSession.data?.user.phoneNumberVerified).toBe(true);

		const originalSession = await client.getSession({
			fetchOptions: { headers: originalHeaders },
		});
		expect(originalSession.data?.user.phoneNumber).toBe(null);
	});
});

describe("signUpOnVerification with additionalFields", async () => {
	let otp = "";

	const { client } = await getTestInstance(
		{
			user: {
				additionalFields: {
					lastName: {
						type: "string",
						required: true,
					},
					dateOfBirth: {
						type: "date",
						required: false,
					},
				},
			},
			plugins: [
				phoneNumber({
					async sendOTP({ code }) {
						otp = code;
					},
					signUpOnVerification: {
						getTempEmail(phoneNumber) {
							return `temp-${phoneNumber}@example.com`;
						},
					},
				}),
			],
		},
		{
			disableTestUser: true,
			clientOptions: {
				plugins: [phoneNumberClient()],
			},
		},
	);

	const testPhoneNumber = "+1234567890";

	it("should create user with additional fields from body", async () => {
		await client.phoneNumber.sendOtp({
			phoneNumber: testPhoneNumber,
		});

		const res = await client.phoneNumber.verify({
			phoneNumber: testPhoneNumber,
			code: otp,
			lastName: "Doe",
		});

		expect(res.error).toBe(null);
		expect(res.data?.status).toBe(true);
		expect(res.data?.user).not.toBe(null);
		// @ts-expect-error - additionalFields not yet inferred in plugin response type
		expect(res.data?.user.lastName).toBe("Doe");
	});
});

describe("custom verifyOTP", async () => {
	const mockVerifyOTP = vi.fn();
	let resetOtp = "";

	const { auth, client, sessionSetter } = await getTestInstance(
		{
			plugins: [
				phoneNumber({
					async sendOTP() {},
					async sendPasswordResetOTP({ code }) {
						resetOtp = code;
					},
					verifyOTP: mockVerifyOTP,
					signUpOnVerification: {
						getTempEmail(phoneNumber) {
							return `temp-${phoneNumber}`;
						},
					},
				}),
			],
		},
		{
			clientOptions: {
				plugins: [phoneNumberClient()],
			},
		},
	);

	const headers = new Headers();
	const testPhoneNumber = "+1234567890";

	it("should call custom verifyOTP when provided", async () => {
		// Send OTP first
		await client.phoneNumber.sendOtp({
			phoneNumber: testPhoneNumber,
		});

		// Mock verifyOTP to return true (valid)
		mockVerifyOTP.mockResolvedValueOnce(true);

		const res = await client.phoneNumber.verify(
			{
				phoneNumber: testPhoneNumber,
				code: "123456", // Any code
			},
			{
				onSuccess: sessionSetter(headers),
			},
		);

		expect(res.error).toBe(null);
		expect(res.data?.status).toBe(true);
		expect(mockVerifyOTP).toHaveBeenCalledWith(
			{
				phoneNumber: testPhoneNumber,
				code: "123456",
			},
			expect.anything(),
		);
	});

	it("should reject verification when custom verifyOTP returns false", async () => {
		const newPhoneNumber = "+9876543210";
		await client.phoneNumber.sendOtp({
			phoneNumber: newPhoneNumber,
		});

		// Mock verifyOTP to return false (invalid)
		mockVerifyOTP.mockResolvedValueOnce(false);

		const res = await client.phoneNumber.verify({
			phoneNumber: newPhoneNumber,
			code: "wrong-code",
		});

		expect(res.error).not.toBe(null);
		expect(res.error?.status).toBe(400);
		expect(res.error?.message).toBe("Invalid OTP");
		expect(mockVerifyOTP).toHaveBeenCalledWith(
			{
				phoneNumber: newPhoneNumber,
				code: "wrong-code",
			},
			expect.anything(),
		);
	});

	it("should not use internal verification logic when custom verifyOTP is provided", async () => {
		const anotherPhoneNumber = "+5555555555";

		// Don't send OTP through sendOtp endpoint (simulating external SMS provider)
		// This means there's no OTP in the database

		// Mock verifyOTP to return true
		mockVerifyOTP.mockResolvedValueOnce(true);

		const res = await client.phoneNumber.verify({
			phoneNumber: anotherPhoneNumber,
			code: "external-code",
		});

		// Should succeed because custom verifyOTP is used, not internal DB lookup
		expect(res.error).toBe(null);
		expect(res.data?.status).toBe(true);
		expect(mockVerifyOTP).toHaveBeenCalledWith(
			{
				phoneNumber: anotherPhoneNumber,
				code: "external-code",
			},
			expect.anything(),
		);
	});

	it("should work with updatePhoneNumber using custom verifyOTP", async () => {
		const updatedPhoneNumber = "+1111111111";

		// Mock verifyOTP to return true
		mockVerifyOTP.mockResolvedValueOnce(true);

		const res = await client.phoneNumber.verify({
			phoneNumber: updatedPhoneNumber,
			code: "123456",
			updatePhoneNumber: true,
			fetchOptions: {
				headers,
			},
		});

		expect(res.error).toBe(null);
		expect(res.data?.status).toBe(true);

		// Verify phone number was updated
		const user = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(user.data?.user.phoneNumber).toBe(updatedPhoneNumber);
		expect(user.data?.user.phoneNumberVerified).toBe(true);
	});

	/** Signs up `phoneNumber` through the custom verifier and requests a reset. */
	async function signUpAndRequestReset(phoneNumber: string) {
		mockVerifyOTP.mockResolvedValueOnce(true);
		await client.phoneNumber.verify({ phoneNumber, code: "123456" });
		await client.phoneNumber.requestPasswordReset({ phoneNumber });
		mockVerifyOTP.mockClear();
	}

	/**
	 * @see https://github.com/better-auth/better-auth/issues/10697
	 */
	describe("password reset", () => {
		it("should use custom verifyOTP when resetting the password", async () => {
			const phoneNumber = "+1222333444";
			const newPassword = "new-password-123";
			await signUpAndRequestReset(phoneNumber);
			// The provider accepts a code that is not the stored one.
			mockVerifyOTP.mockResolvedValueOnce(true);

			const res = await client.phoneNumber.resetPassword({
				phoneNumber,
				otp: "999999",
				newPassword,
			});

			expect(res.error).toBe(null);
			expect(mockVerifyOTP).toHaveBeenCalledWith(
				{ phoneNumber, code: "999999" },
				expect.anything(),
			);
			const signIn = await client.signIn.phoneNumber({
				phoneNumber,
				password: newPassword,
			});
			expect(signIn.error).toBe(null);
		});

		it("should not spend the provider code when the new password is rejected", async () => {
			const phoneNumber = "+1222333555";
			await signUpAndRequestReset(phoneNumber);

			const res = await client.phoneNumber.resetPassword({
				phoneNumber,
				otp: "999999",
				newPassword: "short",
			});

			expect(res.error?.code).toBe("PASSWORD_TOO_SHORT");
			expect(mockVerifyOTP).not.toHaveBeenCalled();
		});

		it("should reject a reset code that custom verifyOTP refuses", async () => {
			const phoneNumber = "+1222333666";
			await signUpAndRequestReset(phoneNumber);
			// The stored code would pass the built-in check, so only the custom
			// verifier can reject it.
			mockVerifyOTP.mockResolvedValueOnce(false);

			const res = await client.phoneNumber.resetPassword({
				phoneNumber,
				otp: resetOtp,
				newPassword: "new-password-123",
			});

			expect(res.error?.code).toBe("INVALID_OTP");
			expect(mockVerifyOTP).toHaveBeenCalledWith(
				{ phoneNumber, code: resetOtp },
				expect.anything(),
			);
		});
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9754
	 */
	it("should delegate server-side consumption to custom verifyOTP without an internal record", async () => {
		const externalPhoneNumber = "+12223334444";
		mockVerifyOTP.mockResolvedValueOnce(true);

		const result = await auth.api.consumePhoneNumberOTP({
			body: {
				phoneNumber: externalPhoneNumber,
				code: "external-code",
			},
		});

		expect(result).toEqual({ status: true });
		expect(mockVerifyOTP).toHaveBeenCalledWith(
			{
				phoneNumber: externalPhoneNumber,
				code: "external-code",
			},
			expect.anything(),
		);
	});
});

// The provisioning gate reaches phone-number sign-up through the createUser
// seam, even though this plugin never calls the gate itself.
describe("phone-number validateUserInfo provisioning gate", async () => {
	let otp = "";
	const { client } = await getTestInstance(
		{
			user: {
				validateUserInfo({ source }) {
					if (source.method !== "phone-number") {
						return;
					}
					expect(source.action).toBe("create-user");
					return {
						error: "phone_blocked",
						errorDescription: "Phone sign-up is not allowed",
					};
				},
			},
			plugins: [
				phoneNumber({
					async sendOTP({ code }) {
						otp = code;
					},
					signUpOnVerification: {
						getTempEmail(phoneNumber) {
							return `temp-${phoneNumber}`;
						},
					},
				}),
			],
		},
		{
			clientOptions: {
				plugins: [phoneNumberClient()],
			},
			disableTestUser: true,
		},
	);

	it("rejects phone-number sign-up when validateUserInfo returns error", async () => {
		const blockedPhone = "+251900000000";
		await client.phoneNumber.sendOtp({ phoneNumber: blockedPhone });
		const res = await client.phoneNumber.verify({
			phoneNumber: blockedPhone,
			code: otp,
		});
		expect(res.error?.status).toBe(403);
		expect(res.error?.code).toBe("phone_blocked");
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/11323
 */
describe("phone-number sign-in password length", async () => {
	const hash = vi.fn(async (password: string) => `hashed:${password}`);
	const verify = vi.fn(
		async ({ hash, password }: { hash: string; password: string }) =>
			hash === `hashed:${password}`,
	);
	const { auth } = await getTestInstance({
		emailAndPassword: {
			enabled: true,
			password: { hash, verify },
		},
		plugins: [phoneNumber()],
	});

	it("should reject a password longer than maxPasswordLength before hashing", async () => {
		const { user } = await auth.api.signUpEmail({
			body: {
				email: "long-password@test.com",
				password: "password",
				name: "Long Password",
			},
		});
		await (await auth.$context).internalAdapter.updateUser(user.id, {
			phoneNumber: "+251911121314",
		});
		hash.mockClear();
		verify.mockClear();

		await expect(
			auth.api.signInPhoneNumber({
				body: {
					phoneNumber: "+251911121314",
					password: "x".repeat(129),
				},
			}),
		).rejects.toMatchObject({
			status: "BAD_REQUEST",
			body: { code: "PASSWORD_TOO_LONG" },
		});

		expect(hash).not.toHaveBeenCalled();
		expect(verify).not.toHaveBeenCalled();
	});
});

describe("updateUser with a request that has no body", async () => {
	const { auth } = await getTestInstance(
		{
			plugins: [
				phoneNumber({
					async sendOTP() {},
				}),
			],
		},
		{
			disableTestUser: true,
		},
	);

	it.each([undefined, "null", '"phoneNumber"'])(
		"should answer with 400 when the body is %s",
		async (body) => {
			const response = await auth.handler(
				new Request("http://localhost:3000/api/auth/update-user", {
					method: "POST",
					headers: body
						? {
								"content-type": "application/json",
							}
						: undefined,
					body,
				}),
			);

			expect(response.status).toBe(400);
		},
	);
});

describe("phone-number verification rows", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/10449
	 */
	it.for([
		["send-otp", "phone-number-otp-"],
		["request-password-reset", "phone-number-reset-"],
		["sign-in", "phone-number-otp-"],
	] as const)(
		"keeps one row per identifier when %s is requested again",
		async ([route, prefix]) => {
			const { client, db } = await getTestInstance(
				{
					plugins: [
						phoneNumber({
							async sendOTP() {},
							async sendPasswordResetOTP() {},
							requireVerification: route === "sign-in",
						}),
					],
				},
				{ clientOptions: { plugins: [phoneNumberClient()] } },
			);
			const number = "+15550000001";
			const password = "password123";
			const signUp = await client.signUp.email({
				email: "rows@example.com",
				password,
				name: "rows",
			});
			await db.update({
				model: "user",
				where: [{ field: "id", value: signUp.data!.user.id }],
				update: { phoneNumber: number },
			});
			const request = () => {
				if (route === "send-otp") {
					return client.phoneNumber.sendOtp({ phoneNumber: number });
				}
				if (route === "request-password-reset") {
					return client.phoneNumber.requestPasswordReset({
						phoneNumber: number,
					});
				}
				return client.signIn.phoneNumber({ phoneNumber: number, password });
			};
			await request();
			await request();

			const rows = await db.findMany({
				model: "verification",
				where: [{ field: "identifier", value: `${prefix}${number}` }],
			});
			expect(rows).toHaveLength(1);
		},
	);

	/**
	 * @see https://github.com/better-auth/better-auth/issues/10449
	 */
	it("reports an unregistered number when sign-up on verification is off", async () => {
		let code = "";
		const { client } = await getTestInstance(
			{
				plugins: [
					phoneNumber({
						async sendOTP({ code: sent }) {
							code = sent;
						},
					}),
				],
			},
			{ clientOptions: { plugins: [phoneNumberClient()] } },
		);
		const number = "+15550000002";
		await client.phoneNumber.sendOtp({ phoneNumber: number });

		const res = await client.phoneNumber.verify({ phoneNumber: number, code });
		expect(res.error?.status).toBe(400);
		expect(res.error?.code).toBe("PHONE_NUMBER_NOT_EXIST");
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11105
	 */
	it("accepts the newest code sent while a wrong guess is checked", async () => {
		const number = "+15550000003";
		const codes: string[] = [];
		let sendDuringCheck = false;
		const { client, auth } = await getTestInstance(
			{
				plugins: [
					phoneNumber({
						async sendOTP({ code }) {
							codes.push(code);
						},
						signUpOnVerification: {
							getTempEmail: (phoneNumber) => `${phoneNumber}@example.com`,
						},
					}),
				],
			},
			{ clientOptions: { plugins: [phoneNumberClient()] } },
		);
		const { internalAdapter } = await auth.$context;
		const verify = internalAdapter.verifyVerificationValue;
		// Sends while the wrong guess is compared.
		vi.spyOn(internalAdapter, "verifyVerificationValue").mockImplementation(
			(id, options) =>
				verify(id, {
					...options,
					async matches(storedCode) {
						if (sendDuringCheck) {
							sendDuringCheck = false;
							vi.setSystemTime(new Date("2026-01-01T00:00:02.000Z"));
							await auth.api.sendPhoneNumberOTP({
								body: { phoneNumber: number },
							});
							vi.setSystemTime(new Date("2026-01-01T00:00:03.000Z"));
						}
						return options.matches(storedCode);
					},
				}),
		);
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
		await auth.api.sendPhoneNumberOTP({ body: { phoneNumber: number } });

		sendDuringCheck = true;
		vi.setSystemTime(new Date("2026-01-01T00:00:01.000Z"));
		const guess = await client.phoneNumber.verify({
			phoneNumber: number,
			code: codes[0] === "000000" ? "111111" : "000000",
		});

		expect(codes).toHaveLength(2);
		expect(guess.error?.code).toBe("INVALID_OTP");
		const latest = await client.phoneNumber.verify({
			phoneNumber: number,
			code: codes[1]!,
		});
		expect(latest.data?.status).toBe(true);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11105
	 */
	it("accepts the newest code sent while a wrong guess is checked in secondary storage", async () => {
		const number = "+15550000006";
		const codes: string[] = [];
		const values = new Map<string, string>();
		let sendDuringCheck = false;
		const secondaryStorage: SecondaryStorage = {
			get: (key) => values.get(key) ?? null,
			getAndDelete: (key) => {
				const value = values.get(key) ?? null;
				values.delete(key);
				return value;
			},
			increment: (key) => {
				const value = Number(values.get(key) ?? 0) + 1;
				values.set(key, String(value));
				return value;
			},
			set: (key, value) => {
				values.set(key, value);
			},
			delete: (key) => {
				values.delete(key);
			},
		};
		const { client, auth } = await getTestInstance(
			{
				secondaryStorage,
				plugins: [
					phoneNumber({
						async sendOTP({ code }) {
							codes.push(code);
						},
						signUpOnVerification: {
							getTempEmail: (phoneNumber) => `${phoneNumber}@example.com`,
						},
					}),
				],
			},
			{ clientOptions: { plugins: [phoneNumberClient()] } },
		);
		await auth.api.sendPhoneNumberOTP({ body: { phoneNumber: number } });
		const { internalAdapter } = await auth.$context;
		const verify = internalAdapter.verifyVerificationValue;
		// Sends while the wrong guess is compared.
		vi.spyOn(internalAdapter, "verifyVerificationValue").mockImplementation(
			(id, options) =>
				verify(id, {
					...options,
					async matches(storedCode) {
						if (sendDuringCheck) {
							sendDuringCheck = false;
							await auth.api.sendPhoneNumberOTP({
								body: { phoneNumber: number },
							});
						}
						return options.matches(storedCode);
					},
				}),
		);

		sendDuringCheck = true;
		const guess = await client.phoneNumber.verify({
			phoneNumber: number,
			code: codes[0] === "000000" ? "111111" : "000000",
		});

		expect(codes).toHaveLength(2);
		expect(guess.error?.code).toBe("INVALID_OTP");
		const stored = await (
			await auth.$context
		).internalAdapter.findVerificationValue(`phone-number-otp-${number}`);
		expect(stored?.value).toBe(`${codes[1]}:0`);
		const latest = await client.phoneNumber.verify({
			phoneNumber: number,
			code: codes[1]!,
		});
		expect(latest.data?.status).toBe(true);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11105
	 */
	it("keeps a code sent while an exhausted code is checked", async () => {
		const number = "+15550000004";
		const codes: string[] = [];
		let sendDuringCheck = false;
		const { client, auth } = await getTestInstance(
			{
				databaseHooks: {
					verification: {
						delete: {
							async before() {
								if (!sendDuringCheck) return;
								sendDuringCheck = false;
								await auth.api.sendPhoneNumberOTP({
									body: { phoneNumber: number },
								});
							},
						},
					},
				},
				plugins: [
					phoneNumber({
						async sendOTP({ code }) {
							codes.push(code);
						},
						signUpOnVerification: {
							getTempEmail: (phoneNumber) => `${phoneNumber}@example.com`,
						},
					}),
				],
			},
			{ clientOptions: { plugins: [phoneNumberClient()] } },
		);
		await auth.api.sendPhoneNumberOTP({ body: { phoneNumber: number } });
		const wrong = codes[0] === "000000" ? "111111" : "000000";
		for (let i = 0; i < 3; i++) {
			const res = await client.phoneNumber.verify({
				phoneNumber: number,
				code: wrong,
			});
			expect(res.error?.code).toBe("INVALID_OTP");
		}

		sendDuringCheck = true;
		const exhausted = await client.phoneNumber.verify({
			phoneNumber: number,
			code: wrong,
		});

		expect(codes).toHaveLength(2);
		expect(exhausted.error?.code).toBe("TOO_MANY_ATTEMPTS");
		const latest = await client.phoneNumber.verify({
			phoneNumber: number,
			code: codes[1]!,
		});
		expect(latest.data?.status).toBe(true);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11105
	 */
	it("keeps every delivered code valid when concurrent sends collide", async () => {
		const number = "+15550000005";
		let arrivals = 0;
		let openBarrier: () => void = () => {};
		const barrier = new Promise<void>((resolve) => {
			openBarrier = resolve;
		});
		const codes: string[] = [];
		const { client, auth } = await getTestInstance(
			{
				databaseHooks: {
					verification: {
						create: {
							// Hold the first two inserts until both requests reach them.
							async before() {
								arrivals++;
								if (arrivals === 2) openBarrier();
								if (arrivals <= 2) await barrier;
							},
						},
					},
				},
				plugins: [
					phoneNumber({
						async sendOTP({ code }) {
							codes.push(code);
						},
						signUpOnVerification: {
							getTempEmail: (phoneNumber) => `${phoneNumber}@example.com`,
						},
					}),
				],
			},
			{ clientOptions: { plugins: [phoneNumberClient()] } },
		);

		await Promise.all([
			auth.api.sendPhoneNumberOTP({ body: { phoneNumber: number } }),
			auth.api.sendPhoneNumberOTP({ body: { phoneNumber: number } }),
		]);

		expect(codes).toHaveLength(2);
		expect(codes[1]).toBe(codes[0]);
		const res = await client.phoneNumber.verify({
			phoneNumber: number,
			code: codes[0]!,
		});
		expect(res.data?.status).toBe(true);
	});
});

/**
 * @see https://better-auth.com/docs/concepts/database#database-hooks
 */
describe("phone number OTP issuance vetoed by a verification hook", () => {
	const phoneNumberValue = "+251911121314";

	async function setup() {
		const sendOTP = vi.fn();
		const sendPasswordResetOTP = vi.fn();
		const { auth, testUser } = await getTestInstance({
			databaseHooks: {
				verification: {
					create: {
						async before() {
							return false;
						},
					},
				},
			},
			plugins: [phoneNumber({ sendOTP, sendPasswordResetOTP })],
		});
		const ctx = await auth.$context;
		const user = await ctx.internalAdapter.findUserByEmail(testUser.email);
		await ctx.internalAdapter.updateUser(user!.user.id, {
			phoneNumber: phoneNumberValue,
			phoneNumberVerified: true,
		});
		return { auth, sendOTP, sendPasswordResetOTP };
	}

	it("refuses to send a verification code that was not stored", async () => {
		const { auth, sendOTP } = await setup();

		const res = await auth.api.sendPhoneNumberOTP({
			body: { phoneNumber: phoneNumberValue },
			asResponse: true,
		});

		expect(res.status).toBe(500);
		expect((await res.json()).code).toBe("FAILED_TO_CREATE_VERIFICATION");
		expect(sendOTP).not.toHaveBeenCalled();
	});

	it("refuses to send a replacement code that was not stored after a colliding send", async () => {
		const sendOTP = vi.fn();
		let collide = true;
		const { auth } = await getTestInstance({
			databaseHooks: {
				verification: {
					create: {
						// Store a used-up code under the same id before this send's create.
						async before(verification) {
							if (!collide) return;
							collide = false;
							const ctx = await auth.$context;
							await ctx.internalAdapter.createVerificationValue({
								...verification,
								value: "000000:3",
							});
						},
					},
					update: {
						async before() {
							return false;
						},
					},
				},
			},
			plugins: [phoneNumber({ sendOTP })],
		});

		const res = await auth.api.sendPhoneNumberOTP({
			body: { phoneNumber: phoneNumberValue },
			asResponse: true,
		});

		expect(res.status).toBe(500);
		expect((await res.json()).code).toBe("FAILED_TO_CREATE_VERIFICATION");
		expect(sendOTP).not.toHaveBeenCalled();
	});

	it("does not send a password reset code that was not stored, and does not reveal the account", async () => {
		const { auth, sendPasswordResetOTP } = await setup();
		const request = (phoneNumber: string) =>
			auth.api.requestPasswordResetPhoneNumber({
				body: { phoneNumber },
				asResponse: true,
			});

		const known = await request(phoneNumberValue);
		const unknown = await request("+251900000000");

		expect(known.status).toBe(200);
		expect(unknown.status).toBe(200);
		expect(await known.json()).toEqual(await unknown.json());
		expect(sendPasswordResetOTP).not.toHaveBeenCalled();
	});
});

/**
 * A code sent and used while a wrong code is compared against an older one
 * must stay the only valid one.
 *
 * @see https://github.com/better-auth/better-auth/issues/11105
 */
describe("phone number OTP guessed while a newer code was sent", () => {
	function createSecondaryStorage(): SecondaryStorage {
		const values = new Map<string, string>();
		return {
			get: (key) => values.get(key) ?? null,
			getAndDelete: (key) => {
				const value = values.get(key) ?? null;
				values.delete(key);
				return value;
			},
			increment: (key) => {
				const value = Number(values.get(key) ?? 0) + 1;
				values.set(key, String(value));
				return value;
			},
			set: (key, value) => {
				values.set(key, value);
			},
			delete: (key) => {
				values.delete(key);
			},
		};
	}

	it.for([
		"database",
		"database with custom ids",
		"database with hashed identifiers",
		"secondary",
		"secondary with hashed identifiers",
		"mirrored",
	] as const)(
		"does not revive the older code after the newer one was used in %s storage",
		async (storage) => {
			const number = "+15550000101";
			const identifier = `phone-number-otp-${number}`;
			const codes: string[] = [];
			const { client, auth } = await getTestInstance(
				{
					...(storage === "database with custom ids"
						? {
								advanced: {
									database: { generateId: () => crypto.randomUUID() },
								},
							}
						: {}),
					...(storage.startsWith("secondary") || storage === "mirrored"
						? { secondaryStorage: createSecondaryStorage() }
						: {}),
					verification: {
						...(storage.endsWith("hashed identifiers")
							? { storeIdentifier: "hashed" as const }
							: {}),
						...(storage === "mirrored" ? { storeInDatabase: true } : {}),
					},
					plugins: [
						phoneNumber({
							async sendOTP({ code }) {
								codes.push(code);
							},
							signUpOnVerification: {
								getTempEmail: (phoneNumber) => `${phoneNumber}@example.com`,
							},
						}),
					],
				},
				{ clientOptions: { plugins: [phoneNumberClient()] } },
			);
			const { internalAdapter } = await auth.$context;
			await auth.api.sendPhoneNumberOTP({ body: { phoneNumber: number } });

			let releaseCheck: () => void = () => {};
			const checkReleased = new Promise<void>((resolve) => {
				releaseCheck = resolve;
			});
			let signalCheck: () => void = () => {};
			const checkStarted = new Promise<void>((resolve) => {
				signalCheck = resolve;
			});
			const verify = internalAdapter.verifyVerificationValue;
			// Hold the wrong code while it is compared.
			vi.spyOn(
				internalAdapter,
				"verifyVerificationValue",
			).mockImplementationOnce((id, options) =>
				verify(id, {
					...options,
					async matches(storedCode) {
						signalCheck();
						await checkReleased;
						return options.matches(storedCode);
					},
				}),
			);
			const guess = client.phoneNumber.verify({
				phoneNumber: number,
				code: codes[0] === "000000" ? "111111" : "000000",
			});
			await checkStarted;
			await auth.api.sendPhoneNumberOTP({ body: { phoneNumber: number } });
			const newer = await client.phoneNumber.verify({
				phoneNumber: number,
				code: codes[1]!,
			});
			releaseCheck();

			expect(newer.data?.status).toBe(true);
			expect((await guess).error?.code).toBe("INVALID_OTP");
			expect(
				await internalAdapter.findVerificationValue(identifier),
			).toBeNull();
			expect(
				(
					await client.phoneNumber.verify({
						phoneNumber: number,
						code: codes[0]!,
					})
				).error?.code,
			).toBe("OTP_NOT_FOUND");
		},
	);
});

/**
 * @see https://github.com/better-auth/better-auth/issues/11105
 */
describe("phone number OTP attempts counted in place", () => {
	const storages = [
		"database",
		"database with custom ids",
		"database with hashed identifiers",
		"secondary",
		"secondary with hashed identifiers",
		"mirrored",
	] as const;

	async function setup(storage: (typeof storages)[number]) {
		const values = new Map<string, string>();
		const secondaryStorage: SecondaryStorage = {
			get: (key) => values.get(key) ?? null,
			getAndDelete: (key) => {
				const value = values.get(key) ?? null;
				values.delete(key);
				return value;
			},
			increment: (key) => {
				const value = Number(values.get(key) ?? 0) + 1;
				values.set(key, String(value));
				return value;
			},
			set: (key, value) => {
				values.set(key, value);
			},
			delete: (key) => {
				values.delete(key);
			},
		};
		const codes: string[] = [];
		const instance = await getTestInstance(
			{
				...(storage === "database with custom ids"
					? {
							advanced: {
								database: { generateId: () => crypto.randomUUID() },
							},
						}
					: {}),
				...(storage.startsWith("secondary") || storage === "mirrored"
					? { secondaryStorage }
					: {}),
				verification: {
					...(storage.endsWith("hashed identifiers")
						? { storeIdentifier: "hashed" as const }
						: {}),
					...(storage === "mirrored" ? { storeInDatabase: true } : {}),
				},
				plugins: [
					phoneNumber({
						allowedAttempts: 3,
						async sendOTP({ code }) {
							codes.push(code);
						},
						signUpOnVerification: {
							getTempEmail: (phoneNumber) => `${phoneNumber}@example.com`,
						},
					}),
				],
			},
			{ clientOptions: { plugins: [phoneNumberClient()] } },
		);
		const { internalAdapter } = await instance.auth.$context;
		let compared = 0;
		const verify = internalAdapter.verifyVerificationValue;
		// Slow every comparison so concurrent requests overlap.
		vi.spyOn(internalAdapter, "verifyVerificationValue").mockImplementation(
			(id, options) =>
				verify(id, {
					...options,
					async matches(storedCode) {
						compared++;
						await new Promise((resolve) => setTimeout(resolve, 5));
						return options.matches(storedCode);
					},
				}),
		);
		return { ...instance, codes, compared: () => compared };
	}

	it.for(storages)(
		"verifies once when the same code is submitted twice at once in %s storage",
		async (storage) => {
			const number = "+15550000102";
			const { auth, client, codes } = await setup(storage);
			await auth.api.sendPhoneNumberOTP({ body: { phoneNumber: number } });

			const results = await Promise.all([
				client.phoneNumber.verify({ phoneNumber: number, code: codes[0]! }),
				client.phoneNumber.verify({ phoneNumber: number, code: codes[0]! }),
			]);

			expect(results.filter((result) => result.data?.status)).toHaveLength(1);
			expect(results.map((result) => result.error?.code ?? null)).toContain(
				"INVALID_OTP",
			);
		},
	);

	it.for(storages)(
		"compares no more than the allowed attempts of a burst of codes in %s storage",
		async (storage) => {
			const number = "+15550000103";
			const { auth, client, codes, compared } = await setup(storage);
			await auth.api.sendPhoneNumberOTP({ body: { phoneNumber: number } });
			const wrong = (index: number) =>
				String((Number(codes[0]) + index + 1) % 1_000_000).padStart(6, "0");

			const results = await Promise.all(
				Array.from({ length: 10 }, (_, index) =>
					client.phoneNumber.verify({
						phoneNumber: number,
						code: wrong(index),
					}),
				),
			);

			expect(compared()).toBe(3);
			for (const result of results) {
				expect(["INVALID_OTP", "TOO_MANY_ATTEMPTS", "OTP_NOT_FOUND"]).toContain(
					result.error?.code,
				);
			}
			expect(
				(
					await client.phoneNumber.verify({
						phoneNumber: number,
						code: codes[0]!,
					})
				).data,
			).toBeNull();
		},
	);
});
