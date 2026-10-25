import { describe, expect, it } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { PIN_ERROR_CODES, pin } from ".";
import { pinClient } from "./client";

/**
 * @see https://github.com/better-auth/better-auth/issues/6000
 */
describe("pin", async () => {
	const password = "test123456";
	const { client, signInWithTestUser } = await getTestInstance(
		{
			plugins: [pin()],
		},
		{
			clientOptions: {
				plugins: [pinClient()],
			},
		},
	);
	const { headers } = await signInWithTestUser();

	it("requires the account password to set a PIN", async () => {
		const res = await client.pin.set({ pin: "1234" }, { headers });
		expect(res.error?.status).toBe(400);
		expect(res.error?.code).toBe(PIN_ERROR_CODES.PASSWORD_REQUIRED.code);
	});

	it("rejects an incorrect password when setting a PIN", async () => {
		const res = await client.pin.set(
			{ pin: "1234", password: "wrong-password" },
			{ headers },
		);
		expect(res.error?.status).toBe(400);
		expect(res.error?.code).toBe(PIN_ERROR_CODES.INVALID_PASSWORD.code);
	});

	it("validates the PIN format", async () => {
		const tooShort = await client.pin.set({ pin: "12", password }, { headers });
		expect(tooShort.error?.code).toBe(PIN_ERROR_CODES.PIN_TOO_SHORT.code);

		const notNumeric = await client.pin.set(
			{ pin: "12ab", password },
			{ headers },
		);
		expect(notNumeric.error?.code).toBe(
			PIN_ERROR_CODES.INVALID_PIN_FORMAT.code,
		);
	});

	it("sets a PIN", async () => {
		const res = await client.pin.set({ pin: "1234", password }, { headers });
		expect(res.error).toBeNull();
		expect(res.data?.status).toBe(true);
	});

	it("rejects setting a second PIN", async () => {
		const res = await client.pin.set({ pin: "5678", password }, { headers });
		expect(res.error?.code).toBe(PIN_ERROR_CODES.PIN_ALREADY_SET.code);
	});

	it("reports PIN status without exposing the hash", async () => {
		const res = await client.pin.status({ fetchOptions: { headers } });
		expect(res.error).toBeNull();
		expect(res.data?.hasPin).toBe(true);
		expect(res.data?.stepUpValid).toBe(false);
		expect(res.data).not.toHaveProperty("hash");
	});

	it("rejects an incorrect PIN without upgrading the session", async () => {
		const res = await client.pin.verify({ pin: "0000" }, { headers });
		expect(res.error?.code).toBe(PIN_ERROR_CODES.INVALID_PIN.code);

		const session = await client.getSession({
			fetchOptions: { headers },
		});
		expect(session.data?.session.stepUpExpiresAt).toBeFalsy();
	});

	it("verifies the PIN and upgrades the current session", async () => {
		const res = await client.pin.verify({ pin: "1234" }, { headers });
		expect(res.error).toBeNull();
		expect(res.data?.verified).toBe(true);
		expect(res.data?.expiresAt).toBeTruthy();

		const session = await client.getSession({
			fetchOptions: { headers },
		});
		expect(session.data?.session.stepUpExpiresAt).toBeTruthy();

		const status = await client.pin.status({ fetchOptions: { headers } });
		expect(status.data?.stepUpValid).toBe(true);
	});

	it("changes the PIN", async () => {
		const wrongCurrent = await client.pin.change(
			{ currentPin: "0000", newPin: "5678" },
			{ headers },
		);
		expect(wrongCurrent.error?.code).toBe(
			PIN_ERROR_CODES.INVALID_CURRENT_PIN.code,
		);

		const res = await client.pin.change(
			{ currentPin: "1234", newPin: "5678" },
			{ headers },
		);
		expect(res.error).toBeNull();
		expect(res.data?.status).toBe(true);

		const oldPin = await client.pin.verify({ pin: "1234" }, { headers });
		expect(oldPin.error?.code).toBe(PIN_ERROR_CODES.INVALID_PIN.code);

		const newPin = await client.pin.verify({ pin: "5678" }, { headers });
		expect(newPin.error).toBeNull();
	});

	it("requires the account password to disable the PIN", async () => {
		const wrongPassword = await client.pin.disable(
			{ password: "wrong-password" },
			{ headers },
		);
		expect(wrongPassword.error?.code).toBe(
			PIN_ERROR_CODES.INVALID_PASSWORD.code,
		);

		const missingPassword = await client.pin.disable({}, { headers });
		expect(missingPassword.error?.code).toBe(
			PIN_ERROR_CODES.PASSWORD_REQUIRED.code,
		);
	});

	it("disables the PIN and clears the step-up state", async () => {
		const res = await client.pin.disable({ password }, { headers });
		expect(res.error).toBeNull();
		expect(res.data?.status).toBe(true);

		const status = await client.pin.status({ fetchOptions: { headers } });
		expect(status.data?.hasPin).toBe(false);
		expect(status.data?.stepUpValid).toBe(false);

		const verify = await client.pin.verify({ pin: "5678" }, { headers });
		expect(verify.error?.code).toBe(PIN_ERROR_CODES.PIN_NOT_SET.code);
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/6000
 */
describe("pin lockout", async () => {
	const password = "test123456";
	const { client, signInWithTestUser } = await getTestInstance(
		{
			plugins: [
				pin({
					maxAttempts: 2,
					lockoutDuration: 60,
				}),
			],
		},
		{
			clientOptions: {
				plugins: [pinClient()],
			},
		},
	);
	const { headers } = await signInWithTestUser();

	it("locks the PIN after too many failed attempts", async () => {
		await client.pin.set({ pin: "1234", password }, { headers });

		const first = await client.pin.verify({ pin: "0000" }, { headers });
		expect(first.error?.code).toBe(PIN_ERROR_CODES.INVALID_PIN.code);

		const second = await client.pin.verify({ pin: "0000" }, { headers });
		expect(second.error?.code).toBe(PIN_ERROR_CODES.INVALID_PIN.code);

		const locked = await client.pin.verify({ pin: "1234" }, { headers });
		expect(locked.error?.status).toBe(429);
		expect(locked.error?.code).toBe(PIN_ERROR_CODES.PIN_LOCKED.code);
	});
});
