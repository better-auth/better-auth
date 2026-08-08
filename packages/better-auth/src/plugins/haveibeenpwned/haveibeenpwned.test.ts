import { createHash } from "@better-auth/utils/hash";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { admin } from "../admin/admin";
import { adminClient } from "../admin/client";
import { emailOTP } from "../email-otp";
import { emailOTPClient } from "../email-otp/client";
import { phoneNumber } from "../phone-number";
import { phoneNumberClient } from "../phone-number/client";
import { haveIBeenPwned } from "./index";

/**
 * Stubs the Have I Been Pwned range API so the given password is reported as
 * breached. The plugin sends only the first five hash characters; the response
 * must carry the remaining suffix for the comparison to match.
 */
async function mockBreached(password: string) {
	const sha1Hash = (
		await createHash("SHA-1", "hex").digest(password)
	).toUpperCase();
	const suffix = sha1Hash.substring(5);
	const realFetch = globalThis.fetch;
	vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
		const url = input instanceof Request ? input.url : input.toString();
		if (url.startsWith("https://api.pwnedpasswords.com/range/")) {
			return new Response(`${suffix}:42\n`, { status: 200 });
		}
		return realFetch(input, init);
	});
}

describe("have-i-been-pwned", async () => {
	const { client, auth } = await getTestInstance(
		{
			plugins: [haveIBeenPwned()],
		},
		{
			disableTestUser: true,
		},
	);
	const ctx = await auth.$context;

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("should prevent account creation with compromised password", async () => {
		const uniqueEmail = `test-${Date.now()}@example.com`;
		const compromisedPassword = "123456789";

		const result = await client.signUp.email({
			email: uniqueEmail,
			password: compromisedPassword,
			name: "Test User",
		});
		const user = await ctx.internalAdapter.findUserByEmail(uniqueEmail);
		expect(user).toBeNull();
		expect(result.error).not.toBeNull();
		expect(result.error?.status).toBe(400);
		expect(result.error?.code).toBe("PASSWORD_COMPROMISED");
	});

	it("should allow account creation with strong, uncompromised password", async () => {
		const uniqueEmail = `test-${Date.now()}@example.com`;
		const strongPassword = `Str0ng!P@ssw0rd-${Date.now()}`;

		const result = await client.signUp.email({
			email: uniqueEmail,
			password: strongPassword,
			name: "Test User",
		});
		expect(result.data?.user).toBeDefined();
	});

	it("should prevent password update to compromised password", async () => {
		const uniqueEmail = `test-${Date.now()}@example.com`;
		const initialPassword = `Str0ng!P@ssw0rd-${Date.now()}`;

		const res = await client.signUp.email({
			email: uniqueEmail,
			password: initialPassword,
			name: "Test User",
		});
		const result = await client.changePassword(
			{
				currentPassword: initialPassword,
				newPassword: "123456789",
			},
			{
				headers: {
					authorization: `Bearer ${res.data?.token}`,
				},
			},
		);
		expect(result.error).toBeDefined();
		expect(result.error?.status).toBe(400);
	});

	it("should not burn the reset-password token when HIBP rejects the password", async () => {
		let resetToken = "";
		const { client: resetClient, auth: resetAuth } = await getTestInstance(
			{
				emailAndPassword: {
					enabled: true,
					async sendResetPassword({ token }) {
						resetToken = token;
					},
				},
				plugins: [haveIBeenPwned()],
			},
			{
				disableTestUser: true,
			},
		);
		const resetCtx = await resetAuth.$context;
		const email = `reset-hibp-${Date.now()}@example.com`;
		const initialPassword = `Str0ng!P@ssw0rd-${Date.now()}`;
		const safePassword = `another-unique-passphrase-${Date.now()}-qz7`;

		await resetClient.signUp.email({
			email,
			password: initialPassword,
			name: "Reset User",
		});
		await resetClient.requestPasswordReset({
			email,
			redirectTo: "http://localhost:3000",
		});
		expect(resetToken.length).toBeGreaterThan(10);

		const breached = "Password123!";
		await mockBreached(breached);
		const first = await resetClient.resetPassword({
			newPassword: breached,
			token: resetToken,
		});
		expect(first.error?.status).toBe(400);
		expect(first.error?.code).toBe("PASSWORD_COMPROMISED");

		const stillPresent = await resetCtx.internalAdapter.findVerificationValue(
			`reset-password:${resetToken}`,
		);
		expect(stillPresent).toBeTruthy();

		vi.restoreAllMocks();
		const second = await resetClient.resetPassword({
			newPassword: safePassword,
			token: resetToken,
		});
		expect(second.data?.status).toBe(true);

		const signIn = await resetClient.signIn.email({
			email,
			password: safePassword,
		});
		expect(signIn.data?.user).toBeDefined();
	});

	describe("when enabled is false", async () => {
		const { client: disabledClient } = await getTestInstance(
			{
				plugins: [haveIBeenPwned({ enabled: false })],
			},
			{
				disableTestUser: true,
			},
		);

		it("should allow account creation with compromised password", async () => {
			const uniqueEmail = `test-${Date.now()}@example.com`;

			const result = await disabledClient.signUp.email({
				email: uniqueEmail,
				password: "123456789",
				name: "Test User",
			});

			expect(result.error).toBeNull();
			expect(result.data?.user).toBeDefined();
		});
	});

	describe("reset password with email OTP", async () => {
		let otp = "";
		const { client } = await getTestInstance(
			{
				plugins: [
					haveIBeenPwned(),
					emailOTP({
						async sendVerificationOTP({ otp: _otp }) {
							otp = _otp;
						},
					}),
				],
			},
			{
				disableTestUser: true,
				clientOptions: {
					plugins: [emailOTPClient()],
				},
			},
		);

		afterEach(() => {
			vi.restoreAllMocks();
		});

		it("should reject a compromised password on /email-otp/reset-password", async () => {
			const email = `email-otp-${Date.now()}@example.com`;
			await client.signUp.email({
				email,
				password: `Str0ng!P@ssw0rd-${Date.now()}`,
				name: "Test User",
			});
			await client.emailOtp.requestPasswordReset({ email });

			const breached = "breached-via-email-otp";
			await mockBreached(breached);
			const result = await client.emailOtp.resetPassword({
				email,
				otp,
				password: breached,
			});

			expect(result.error?.status).toBe(400);
			expect(result.error?.code).toBe("PASSWORD_COMPROMISED");
		});

		it("should allow retry with the same OTP after a HIBP rejection", async () => {
			const email = `email-otp-retry-${Date.now()}@example.com`;
			const safePassword = `safe-email-otp-${Date.now()}-qz7`;
			await client.signUp.email({
				email,
				password: `Str0ng!P@ssw0rd-${Date.now()}`,
				name: "Test User",
			});
			await client.emailOtp.requestPasswordReset({ email });
			const reusedOtp = otp;

			const breached = "breached-email-otp-retry";
			await mockBreached(breached);
			const first = await client.emailOtp.resetPassword({
				email,
				otp: reusedOtp,
				password: breached,
			});
			expect(first.error?.code).toBe("PASSWORD_COMPROMISED");

			vi.restoreAllMocks();
			const second = await client.emailOtp.resetPassword({
				email,
				otp: reusedOtp,
				password: safePassword,
			});
			expect(second.data?.success).toBe(true);
		});
	});

	describe("reset password with phone number OTP", async () => {
		let resetOtp = "";
		let signUpOtp = "";
		const { client } = await getTestInstance(
			{
				plugins: [
					haveIBeenPwned(),
					phoneNumber({
						async sendOTP({ code }) {
							signUpOtp = code;
						},
						sendPasswordResetOTP({ code }) {
							resetOtp = code;
						},
						signUpOnVerification: {
							getTempEmail(phone) {
								return `temp-${phone}@example.com`;
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

		afterEach(() => {
			vi.restoreAllMocks();
		});

		it("should reject a compromised password on /phone-number/reset-password", async () => {
			const phone = `+1555${Date.now().toString().slice(-7)}`;
			await client.phoneNumber.sendOtp({ phoneNumber: phone });
			await client.phoneNumber.verify({ phoneNumber: phone, code: signUpOtp });
			await client.phoneNumber.requestPasswordReset({ phoneNumber: phone });

			const breached = "breached-via-phone-otp";
			await mockBreached(breached);
			const result = await client.phoneNumber.resetPassword({
				phoneNumber: phone,
				otp: resetOtp,
				newPassword: breached,
			});

			expect(result.error?.status).toBe(400);
			expect(result.error?.code).toBe("PASSWORD_COMPROMISED");
		});

		it("should allow retry with the same OTP after a HIBP rejection", async () => {
			const phone = `+1555${Date.now().toString().slice(-7)}`;
			const safePassword = `safe-phone-otp-${Date.now()}-qz7`;
			await client.phoneNumber.sendOtp({ phoneNumber: phone });
			await client.phoneNumber.verify({ phoneNumber: phone, code: signUpOtp });
			await client.phoneNumber.requestPasswordReset({ phoneNumber: phone });
			const reusedOtp = resetOtp;

			const breached = "breached-phone-otp-retry";
			await mockBreached(breached);
			const first = await client.phoneNumber.resetPassword({
				phoneNumber: phone,
				otp: reusedOtp,
				newPassword: breached,
			});
			expect(first.error?.code).toBe("PASSWORD_COMPROMISED");

			vi.restoreAllMocks();
			const second = await client.phoneNumber.resetPassword({
				phoneNumber: phone,
				otp: reusedOtp,
				newPassword: safePassword,
			});
			expect(second.data?.status).toBe(true);
		});
	});

	describe("admin password endpoints", async () => {
		const { client, signInWithUser } = await getTestInstance(
			{
				plugins: [haveIBeenPwned(), admin()],
				databaseHooks: {
					user: {
						create: {
							before: async (user) => ({
								data: {
									...user,
									...(user.name === "Admin" ? { role: "admin" } : {}),
								},
							}),
						},
					},
				},
			},
			{
				disableTestUser: true,
				clientOptions: {
					plugins: [adminClient()],
				},
			},
		);
		const adminEmail = `admin-${Date.now()}@example.com`;
		const adminPassword = `Str0ng!P@ssw0rd-${Date.now()}`;
		await client.signUp.email({
			email: adminEmail,
			password: adminPassword,
			name: "Admin",
		});
		const { headers: adminHeaders } = await signInWithUser(
			adminEmail,
			adminPassword,
		);

		afterEach(() => {
			vi.restoreAllMocks();
		});

		it("should reject a compromised password on /admin/create-user", async () => {
			const breached = "breached-via-admin-create";
			await mockBreached(breached);
			const result = await client.admin.createUser(
				{
					name: "Created User",
					email: `admin-create-${Date.now()}@example.com`,
					password: breached,
				},
				{ headers: adminHeaders },
			);

			expect(result.error?.status).toBe(400);
			expect(result.error?.code).toBe("PASSWORD_COMPROMISED");
		});

		it("should reject a compromised password on /admin/set-user-password", async () => {
			const createRes = await client.admin.createUser(
				{
					name: "Target User",
					email: `admin-set-${Date.now()}@example.com`,
					password: `Str0ng!P@ssw0rd-${Date.now()}`,
				},
				{ headers: adminHeaders },
			);
			const userId = createRes.data?.user.id || "";

			const breached = "breached-via-admin-set";
			await mockBreached(breached);
			const result = await client.admin.setUserPassword(
				{
					userId,
					newPassword: breached,
				},
				{ headers: adminHeaders },
			);

			expect(result.error?.status).toBe(400);
			expect(result.error?.code).toBe("PASSWORD_COMPROMISED");
		});
	});
});
