import { describe, expect, it } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { phoneNumber } from ".";
import type { PhoneNumberOptions } from "./types";

const TEST_PHONE_NUMBER = "+251911121314";

async function instance(options: Partial<PhoneNumberOptions> = {}) {
	let otp = "";
	const t = await getTestInstance(
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
					...options,
				}),
			],
			logger: { level: "error" },
		},
		{ disableTestUser: true },
	);
	return {
		...t,
		getOTP: () => otp,
		readStoredValue: async () =>
			(
				await t.auth.$context.then((c) =>
					c.internalAdapter.findVerificationValue(TEST_PHONE_NUMBER),
				)
			)?.value,
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

	it("supports a custom hasher", async () => {
		const { auth, getOTP, readStoredValue } = await instance({
			storeOTP: { hash: async (otp) => `custom-${otp}-hashed` },
		});

		await auth.api.sendPhoneNumberOTP({
			body: { phoneNumber: TEST_PHONE_NUMBER },
		});

		const stored = await readStoredValue();
		expect(stored).toBe(`custom-${getOTP()}-hashed:0`);

		const res = await auth.api.verifyPhoneNumber({
			body: { phoneNumber: TEST_PHONE_NUMBER, code: getOTP() },
		});
		expect(res.status).toBe(true);
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
		expect(stored).not.toContain(getOTP());

		const res = await auth.api.verifyPhoneNumber({
			body: { phoneNumber: TEST_PHONE_NUMBER, code: getOTP() },
		});
		expect(res.status).toBe(true);
	});
});
