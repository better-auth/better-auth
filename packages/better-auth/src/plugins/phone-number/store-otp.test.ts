import { describe, expect, it } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { phoneNumber } from ".";
import type { PhoneNumberOptions } from "./types";

const TEST_PHONE_NUMBER = "+251911121314";

async function instance(options: Partial<PhoneNumberOptions> = {}) {
	let otp = "";
	let resetOtp = "";
	const t = await getTestInstance(
		{
			plugins: [
				phoneNumber({
					async sendOTP({ code }) {
						otp = code;
					},
					async sendPasswordResetOTP({ code }) {
						resetOtp = code;
					},
					signUpOnVerification: {
						getTempEmail(phoneNumber) {
							return `temp-${phoneNumber}`;
						},
					},
					...options,
				}),
			],
			logger: { level: "error" },
		},
		{ disableTestUser: true },
	);
	const readIdentifier = async (identifier: string) =>
		(
			await t.auth.$context.then((c) =>
				c.internalAdapter.findVerificationValue(identifier),
			)
		)?.value;
	return {
		...t,
		getOTP: () => otp,
		getResetOTP: () => resetOtp,
		readIdentifier,
		readStoredValue: async () => readIdentifier(TEST_PHONE_NUMBER),
	};
}

describe("phone-number storeOTP", () => {
	it("CONTROL — stores the OTP in plain text by default", async () => {
		const { auth, getOTP, readStoredValue } = await instance();

		await auth.api.sendPhoneNumberOTP({
			body: { phoneNumber: TEST_PHONE_NUMBER },
		});

		const stored = await readStoredValue();
		expect(stored).toBeDefined();
		// Documents today's behaviour: the SMS code sits in the database verbatim.
		expect(stored).toContain(getOTP());
	});

	it("does not persist the plaintext OTP when storeOTP is 'hashed'", async () => {
		const { auth, getOTP, readStoredValue } = await instance({
			storeOTP: "hashed",
		});

		await auth.api.sendPhoneNumberOTP({
			body: { phoneNumber: TEST_PHONE_NUMBER },
		});

		const otp = getOTP();
		expect(otp).toHaveLength(6);

		const stored = await readStoredValue();
		expect(stored).toBeDefined();
		expect(stored).not.toContain(otp);
	});

	it("still verifies a correct OTP when storeOTP is 'hashed'", async () => {
		const { auth, getOTP } = await instance({ storeOTP: "hashed" });

		await auth.api.sendPhoneNumberOTP({
			body: { phoneNumber: TEST_PHONE_NUMBER },
		});

		const res = await auth.api.verifyPhoneNumber({
			body: { phoneNumber: TEST_PHONE_NUMBER, code: getOTP() },
		});
		expect(res.status).toBe(true);
	});

	it("still rejects an incorrect OTP when storeOTP is 'hashed'", async () => {
		const { auth } = await instance({ storeOTP: "hashed" });

		await auth.api.sendPhoneNumberOTP({
			body: { phoneNumber: TEST_PHONE_NUMBER },
		});

		await expect(
			auth.api.verifyPhoneNumber({
				body: { phoneNumber: TEST_PHONE_NUMBER, code: "000000" },
			}),
		).rejects.toThrow();
	});

	// The transformed value deliberately contains colons: the attempt counter is
	// appended as a `:<n>` suffix, so parsing has to split on the *last* colon.
	// With a naive `split(":")` this test fails.
	it("supports a custom hasher whose output contains colons", async () => {
		const { auth, getOTP, readStoredValue } = await instance({
			storeOTP: { hash: async (otp) => `custom:${otp}:hashed` },
		});

		await auth.api.sendPhoneNumberOTP({
			body: { phoneNumber: TEST_PHONE_NUMBER },
		});

		const stored = await readStoredValue();
		expect(stored).toBe(`custom:${getOTP()}:hashed:0`);

		const res = await auth.api.verifyPhoneNumber({
			body: { phoneNumber: TEST_PHONE_NUMBER, code: getOTP() },
		});
		expect(res.status).toBe(true);
	});

	it("round-trips a custom encryptor whose output contains colons", async () => {
		const { auth, getOTP, readStoredValue } = await instance({
			storeOTP: {
				encrypt: async (otp) => `enc:${otp.split("").reverse().join("")}`,
				decrypt: async (stored) =>
					stored.replace(/^enc:/, "").split("").reverse().join(""),
			},
		});

		await auth.api.sendPhoneNumberOTP({
			body: { phoneNumber: TEST_PHONE_NUMBER },
		});

		const otp = getOTP();
		const stored = await readStoredValue();
		expect(stored).toBe(`enc:${otp.split("").reverse().join("")}:0`);

		const res = await auth.api.verifyPhoneNumber({
			body: { phoneNumber: TEST_PHONE_NUMBER, code: otp },
		});
		expect(res.status).toBe(true);
	});

	// The three OTP write sites are independent, so cover each one under
	// `hashed`: otherwise a single site could regress to plaintext while the
	// shared-helper tests keep passing.
	it("does not persist the plaintext OTP on the password-reset write site", async () => {
		const { auth, getResetOTP, readIdentifier } = await instance({
			storeOTP: "hashed",
		});

		await auth.api.signUpEmail({
			body: {
				email: "reset-user@test.com",
				password: "password1234",
				name: "Reset User",
			},
		});
		await auth.$context.then((c) =>
			c.internalAdapter.updateUserByEmail("reset-user@test.com", {
				phoneNumber: TEST_PHONE_NUMBER,
				phoneNumberVerified: true,
			}),
		);

		await auth.api.requestPasswordResetPhoneNumber({
			body: { phoneNumber: TEST_PHONE_NUMBER },
		});

		const stored = await readIdentifier(
			`${TEST_PHONE_NUMBER}-request-password-reset`,
		);
		expect(stored).toBeDefined();
		expect(getResetOTP()).toHaveLength(6);
		expect(stored).not.toContain(getResetOTP());
	});

	it("does not persist the plaintext OTP on the require-verification sign-in write site", async () => {
		const { auth, getOTP, readStoredValue } = await instance({
			storeOTP: "hashed",
			requireVerification: true,
		});

		await auth.api.signUpEmail({
			body: {
				email: "unverified@test.com",
				password: "password1234",
				name: "Unverified User",
			},
		});
		await auth.$context.then((c) =>
			c.internalAdapter.updateUserByEmail("unverified@test.com", {
				phoneNumber: TEST_PHONE_NUMBER,
				phoneNumberVerified: false,
			}),
		);

		await expect(
			auth.api.signInPhoneNumber({
				body: { phoneNumber: TEST_PHONE_NUMBER, password: "password1234" },
			}),
		).rejects.toThrow();

		const stored = await readStoredValue();
		expect(stored).toBeDefined();
		expect(getOTP()).toHaveLength(6);
		expect(stored).not.toContain(getOTP());
	});

	it("round-trips an encrypted OTP", async () => {
		const { auth, getOTP, readStoredValue } = await instance({
			storeOTP: "encrypted",
		});

		await auth.api.sendPhoneNumberOTP({
			body: { phoneNumber: TEST_PHONE_NUMBER },
		});

		const stored = await readStoredValue();
		expect(stored).toBeDefined();
		// Compare against the exact plaintext representation rather than using
		// `not.toContain`, which would be probabilistic against ciphertext.
		expect(stored).not.toBe(`${getOTP()}:0`);

		const res = await auth.api.verifyPhoneNumber({
			body: { phoneNumber: TEST_PHONE_NUMBER, code: getOTP() },
		});
		expect(res.status).toBe(true);
	});
});
