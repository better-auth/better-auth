import { describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { twoFactor, twoFactorClient } from ".";
import { createAuthClient } from "../../client";
import { parseSetCookieHeader } from "../../cookies";
import type { TwoFactorTable, UserWithTwoFactor } from "./types";
import { TOTPController } from "oslo/otp";
import { TimeSpan } from "oslo";
import { DEFAULT_SECRET } from "../../utils/constants";
import { symmetricDecrypt } from "../../crypto";
import { APIError } from "better-call";
import { convertSetCookieToCookie } from "../../test-utils/headers";

describe("two factor", async () => {
	let OTP = "";
	const { testUser, customFetchImpl, sessionSetter, db, auth } =
		await getTestInstance({
			secret: DEFAULT_SECRET,
			plugins: [
				twoFactor({
					otpOptions: {
						sendOTP({ otp }) {
							OTP = otp;
						},
					},
				}),
			],
		});

	const headers = new Headers();

	const client = createAuthClient({
		plugins: [twoFactorClient()],
		fetchOptions: {
			customFetchImpl,
			baseURL: "http://localhost:3000/api/auth",
		},
	});
	const session = await client.signIn.email({
		email: testUser.email,
		password: testUser.password,
		fetchOptions: {
			onSuccess: sessionSetter(headers),
		},
	});
	if (!session) {
		throw new Error("No session");
	}

	it("should return uri and backup codes and shouldn't enable twoFactor yet", async () => {
		const res = await client.twoFactor.enable({
			password: testUser.password,
			fetchOptions: {
				headers,
			},
		});

		expect(res.data?.backupCodes.length).toEqual(10);
		expect(res.data?.totpURI).toBeDefined();
		const dbUser = await db.findOne<UserWithTwoFactor>({
			model: "user",
			where: [
				{
					field: "id",
					value: session.data?.user.id as string,
				},
			],
		});
		const twoFactor = await db.findOne<TwoFactorTable>({
			model: "twoFactor",
			where: [
				{
					field: "userId",
					value: session.data?.user.id as string,
				},
			],
		});
		expect(dbUser?.twoFactorEnabled).toBe(null);
		expect(twoFactor?.secret).toBeDefined();
		expect(twoFactor?.backupCodes).toBeDefined();
	});

	it("should enable twoFactor", async () => {
		const totp = new TOTPController({
			digits: 6,
			period: new TimeSpan(30, "s"),
		});
		const twoFactor = await db.findOne<TwoFactorTable>({
			model: "twoFactor",
			where: [
				{
					field: "userId",
					value: session.data?.user.id as string,
				},
			],
		});
		if (!twoFactor) {
			throw new Error("No two factor");
		}

		const decrypted = await symmetricDecrypt({
			key: DEFAULT_SECRET,
			data: twoFactor.secret,
		});
		const code = await totp.generate(Buffer.from(decrypted));

		const res = await client.twoFactor.verifyTotp({
			code,
			fetchOptions: {
				headers,
			},
		});
		expect(res.data?.session).toBeDefined();
	});

	it("should require two factor", async () => {
		const headers = new Headers();
		const res = await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			fetchOptions: {
				onSuccess(context) {
					const parsed = parseSetCookieHeader(
						context.response.headers.get("Set-Cookie") || "",
					);
					expect(parsed.get("better-auth.session_token")?.value).toBe("");
					expect(parsed.get("better-auth.two_factor")?.value).toBeDefined();
					headers.append(
						"cookie",
						`better-auth.two_factor=${
							parsed.get("better-auth.two_factor")?.value
						}`,
					);
				},
			},
		});
		expect((res.data as any)?.twoFactorRedirect).toBe(true);
		await client.twoFactor.sendOtp({
			fetchOptions: {
				headers,
				onSuccess(context) {
					const parsed = parseSetCookieHeader(
						context.response.headers.get("Set-Cookie") || "",
					);
					headers.append(
						"cookie",
						`better-auth.otp_counter=${
							parsed.get("better-auth.otp_counter")?.value
						}`,
					);
				},
			},
		});

		const verifyRes = await client.twoFactor.verifyOtp({
			code: OTP,
			fetchOptions: {
				headers,
				onSuccess(context) {
					const parsed = parseSetCookieHeader(
						context.response.headers.get("Set-Cookie") || "",
					);
					expect(parsed.get("better-auth.session_token")?.value).toBeDefined();
				},
			},
		});
		expect(verifyRes.data?.session).toBeDefined();
	});

	let backupCodes: string[] = [];
	it("should generate backup codes", async () => {
		await client.twoFactor.enable({
			password: testUser.password,
			fetchOptions: {
				headers,
			},
		});
		const backupCodesRes = await client.twoFactor.generateBackupCodes({
			fetchOptions: {
				headers,
			},
			password: testUser.password,
		});
		expect(backupCodesRes.data?.backupCodes).toBeDefined();
		backupCodes = backupCodesRes.data?.backupCodes || [];
	});

	it("should allow sign in with backup code", async () => {
		await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			fetchOptions: {
				onSuccess(context) {
					const parsed = parseSetCookieHeader(
						context.response.headers.get("Set-Cookie") || "",
					);
					const token = parsed.get("better-auth.session_token")?.value;
					expect(token).toBe("");
				},
			},
		});
		const backupCode = backupCodes[0];
		await client.twoFactor.verifyBackupCode({
			code: backupCode,
			fetchOptions: {
				headers,
				onSuccess(context) {
					const parsed = parseSetCookieHeader(
						context.response.headers.get("Set-Cookie") || "",
					);
					const token = parsed.get("better-auth.session_token")?.value;
					expect(token?.length).toBeGreaterThan(0);
				},
			},
		});
		const currentBackupCodes = await auth.api.viewBackupCodes({
			body: {
				userId: session.data?.user.id!,
			},
		});
		expect(currentBackupCodes.backupCodes).toBeDefined();
		expect(currentBackupCodes.backupCodes).not.toContain(backupCode);

		const res = await client.twoFactor.verifyBackupCode({
			code: "invalid-code",
			fetchOptions: {
				headers,
				onSuccess(context) {
					const parsed = parseSetCookieHeader(
						context.response.headers.get("Set-Cookie") || "",
					);
					const token = parsed.get("better-auth.session_token")?.value;
					expect(token?.length).toBeGreaterThan(0);
				},
			},
		});
		expect(res.error?.message).toBe("Invalid backup code");
	});

	it("should trust device", async () => {
		const headers = new Headers();
		const res = await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			fetchOptions: {
				onSuccess(context) {
					const parsed = parseSetCookieHeader(
						context.response.headers.get("Set-Cookie") || "",
					);
					headers.append(
						"cookie",
						`better-auth.two_factor=${
							parsed.get("better-auth.two_factor")?.value
						}`,
					);
				},
			},
		});
		expect((res.data as any)?.twoFactorRedirect).toBe(true);
		const otpRes = await client.twoFactor.sendOtp({
			fetchOptions: {
				headers,
				onSuccess(context) {
					const parsed = parseSetCookieHeader(
						context.response.headers.get("Set-Cookie") || "",
					);
					headers.append(
						"cookie",
						`better-auth.otp.counter=${
							parsed.get("better-auth.otp_counter")?.value
						}`,
					);
				},
			},
		});
		const newHeaders = new Headers();
		await client.twoFactor.verifyOtp({
			trustDevice: true,
			code: OTP,
			fetchOptions: {
				headers,
				onSuccess(context) {
					const parsed = parseSetCookieHeader(
						context.response.headers.get("Set-Cookie") || "",
					);
					newHeaders.set(
						"cookie",
						`better-auth.trust_device=${
							parsed.get("better-auth.trust_device")?.value
						}`,
					);
				},
			},
		});

		const signInRes = await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			fetchOptions: {
				headers: newHeaders,
			},
		});
		expect(signInRes.data?.user).toBeDefined();
	});

	it("should disable two factor", async () => {
		const res = await client.twoFactor.disable({
			password: testUser.password,
			fetchOptions: {
				headers,
			},
		});

		expect(res.data?.status).toBe(true);
		const dbUser = await db.findOne<UserWithTwoFactor>({
			model: "user",
			where: [
				{
					field: "id",
					value: session.data?.user.id as string,
				},
			],
		});
		expect(dbUser?.twoFactorEnabled).toBe(false);

		const signInRes = await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
		});
		expect(signInRes.data?.user).toBeDefined();
	});
});

describe("two factor auth api", async () => {
	let OTP = "";
	const sendOTP = vi.fn();
	const { auth, signInWithTestUser, testUser } = await getTestInstance({
		secret: DEFAULT_SECRET,
		plugins: [
			twoFactor({
				otpOptions: {
					sendOTP({ otp }) {
						OTP = otp;
						sendOTP(otp);
					},
				},
				skipVerificationOnEnable: true,
			}),
		],
	});
	let { headers } = await signInWithTestUser();

	it("enable two factor", async () => {
		const res = await auth.api.enableTwoFactor({
			body: {
				password: testUser.password,
			},
			headers,
		});
		expect(res.backupCodes.length).toBe(10);
		expect(res.totpURI).toBeDefined();

		const session = await auth.api.getSession({
			headers,
		});
		expect(session?.user.twoFactorEnabled).toBe(true);
	});

	it("should get totp uri", async () => {
		const res = await auth.api.getTOTPURI({
			headers,
			body: {
				password: testUser.password,
			},
		});
		expect(res.totpURI).toBeDefined();
	});

	it("should request second factor", async () => {
		const signInRes = await auth.api.signInEmail({
			body: {
				email: testUser.email,
				password: testUser.password,
			},
			asResponse: true,
		});

		headers = convertSetCookieToCookie(signInRes.headers);

		expect(signInRes).toBeInstanceOf(Response);
		expect(signInRes.status).toBe(200);
		const parsed = parseSetCookieHeader(
			signInRes.headers.get("Set-Cookie") || "",
		);
		const twoFactorCookie = parsed.get("better-auth.two_factor");
		expect(twoFactorCookie).toBeDefined();
		const sessionToken = parsed.get("better-auth.session_token");
		expect(sessionToken?.value).toBeFalsy();
	});

	it("should send otp", async () => {
		await auth.api.sendTwoFactorOTP({
			headers,
			body: {
				trustDevice: false,
			},
		});
		expect(OTP.length).toBe(6);
		expect(sendOTP).toHaveBeenCalledWith(OTP);
	});

	it("should verify otp", async () => {
		const res = await auth.api.verifyTwoFactorOTP({
			headers,
			body: {
				code: OTP,
			},
			asResponse: true,
		});
		expect(res.status).toBe(200);
		expect(res.headers.get("Set-Cookie")).toBeDefined();
		headers = convertSetCookieToCookie(res.headers);
	});

	it("should disable two factor", async () => {
		const res = await auth.api.disableTwoFactor({
			headers,
			body: {
				password: testUser.password,
			},
		});
		expect(res.status).toBe(true);
		const session = await auth.api.getSession({
			headers,
		});
		expect(session?.user.twoFactorEnabled).toBe(false);
	});
});
