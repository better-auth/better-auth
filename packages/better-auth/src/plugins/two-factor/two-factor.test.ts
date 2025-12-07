import { createOTP } from "@better-auth/utils/otp";
import { describe, expect, it, vi } from "vitest";
import { createAuthClient } from "../../client";
import { parseSetCookieHeader } from "../../cookies";
import { symmetricDecrypt } from "../../crypto";
import { convertSetCookieToCookie } from "../../test-utils/headers";
import { getTestInstance } from "../../test-utils/test-instance";
import { DEFAULT_SECRET } from "../../utils/constants";
import { TWO_FACTOR_ERROR_CODES, twoFactor, twoFactorClient } from ".";
import type { TwoFactorTable, UserWithTwoFactor } from "./types";

describe("two factor", async () => {
	let OTP = "";
	const { testUser, customFetchImpl, sessionSetter, db, auth } =
		await getTestInstance({
			secret: DEFAULT_SECRET,
			session: {
				cookieCache: {
					enabled: true,
				},
			},
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
		expect(dbUser?.twoFactorEnabled).toBe(false);
		expect(twoFactor?.secret).toBeDefined();
		expect(twoFactor?.backupCodes).toBeDefined();
	});

	it("should use custom issuer from request parameter", async () => {
		const CUSTOM_ISSUER = "Custom App Name";
		const res = await client.twoFactor.enable({
			password: testUser.password,
			issuer: CUSTOM_ISSUER,
			fetchOptions: {
				headers,
			},
		});

		const totpURI = res.data?.totpURI;
		expect(totpURI).toMatch(
			new RegExp(`^otpauth://totp/${encodeURIComponent(CUSTOM_ISSUER)}:`),
		);
		expect(totpURI).toContain(`&issuer=Custom+App+Name&`);
	});

	it("should fallback to appName when no issuer provided", async () => {
		const res = await client.twoFactor.enable({
			password: testUser.password,
			fetchOptions: {
				headers,
			},
		});

		const totpURI = res.data?.totpURI;
		expect(totpURI).toMatch(/^otpauth:\/\/totp\/Better%20Auth:/);
		expect(totpURI).toContain("&issuer=Better+Auth&");
	});

	it("should enable twoFactor", async () => {
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
		const code = await createOTP(decrypted).totp();

		const res = await client.twoFactor.verifyTotp({
			code,
			fetchOptions: {
				headers,
				onSuccess: sessionSetter(headers),
			},
		});
		expect(res.data?.token).toBeDefined();
	});

	it("should require two factor", async () => {
		const headers = new Headers();
		const res = await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			rememberMe: false,
			fetchOptions: {
				onResponse(context) {
					const parsed = parseSetCookieHeader(
						context.response.headers.get("Set-Cookie") || "",
					);
					expect(parsed.get("better-auth.session_token")?.value).toBe("");
					expect(parsed.get("better-auth.session_data")?.value).toBe("");
					expect(parsed.get("better-auth.two_factor")?.value).toBeDefined();
					expect(parsed.get("better-auth.dont_remember")?.value).toBeDefined();
					headers.append(
						"cookie",
						`better-auth.two_factor=${
							parsed.get("better-auth.two_factor")?.value
						}`,
					);
					headers.append(
						"cookie",
						`better-auth.dont_remember=${
							parsed.get("better-auth.dont_remember")?.value
						}`,
					);
				},
			},
		});
		expect((res.data as any)?.twoFactorRedirect).toBe(true);
		await client.twoFactor.sendOtp({
			fetchOptions: {
				headers,
			},
		});

		const verifyRes = await client.twoFactor.verifyOtp({
			code: OTP,
			fetchOptions: {
				headers,
				onResponse(context) {
					const parsed = parseSetCookieHeader(
						context.response.headers.get("Set-Cookie") || "",
					);
					expect(parsed.get("better-auth.session_token")?.value).toBeDefined();
					// max age should be undefined because we are not using remember me
					expect(
						parsed.get("better-auth.session_token")?.["max-age"],
					).not.toBeDefined();
				},
			},
		});
		expect(verifyRes.data?.token).toBeDefined();
	});

	it("should fail if two factor cookie is missing", async () => {
		const headers = new Headers();
		const res = await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			rememberMe: false,
			fetchOptions: {
				onResponse(context) {
					const parsed = parseSetCookieHeader(
						context.response.headers.get("Set-Cookie") || "",
					);
					expect(parsed.get("better-auth.session_token")?.value).toBe("");
					// 2FA Cookie is in response, but we are not setting it in headers
					expect(parsed.get("better-auth.two_factor")?.value).toBeDefined();
					expect(parsed.get("better-auth.dont_remember")?.value).toBeDefined();
					headers.append(
						"cookie",
						`better-auth.dont_remember=${
							parsed.get("better-auth.dont_remember")?.value
						}`,
					);
				},
			},
		});
		expect((res.data as any)?.twoFactorRedirect).toBe(true);
		await client.twoFactor.sendOtp({
			fetchOptions: {
				headers,
			},
		});

		const verifyRes = await client.twoFactor.verifyOtp({
			code: OTP,
			fetchOptions: {
				headers,
				onResponse(context) {
					const parsed = parseSetCookieHeader(
						context.response.headers.get("Set-Cookie") || "",
					);
					// Session should not be defined when two factor cookie is missing
					expect(
						parsed.get("better-auth.session_token")?.value,
					).not.toBeDefined();
				},
			},
		});
		expect(verifyRes.error?.message).toBe(
			TWO_FACTOR_ERROR_CODES.INVALID_TWO_FACTOR_COOKIE,
		);
	});

	it("should fail when passing invalid TOTP code with expected error code", async () => {
		const res = await client.twoFactor.verifyTotp({
			code: "invalid-code",
			fetchOptions: {
				headers,
			},
		});
		expect(res.error?.message).toBe(TWO_FACTOR_ERROR_CODES.INVALID_CODE);
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
		const headers = new Headers();
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
					headers.append(
						"cookie",
						`better-auth.two_factor=${
							parsed.get("better-auth.two_factor")?.value
						}`,
					);
				},
			},
		});
		const backupCode = backupCodes[0]!;

		let parsedCookies = new Map();
		await client.twoFactor.verifyBackupCode({
			code: backupCode,
			fetchOptions: {
				headers,
				onSuccess(context) {
					parsedCookies = parseSetCookieHeader(
						context.response.headers.get("Set-Cookie") || "",
					);
				},
			},
		});
		const token = parsedCookies.get("better-auth.session_token")?.value;
		expect(token?.length).toBeGreaterThan(0);
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
					expect(parsed.get("better-auth.trust_device")?.value).toBeDefined();
					newHeaders.set(
						"cookie",
						`better-auth.trust_device=${
							parsed.get("better-auth.trust_device")?.value
						}`,
					);
				},
			},
		});

		const updatedHeaders = new Headers();
		const signInRes = await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			fetchOptions: {
				headers: newHeaders,
				onSuccess(context) {
					const parsed = parseSetCookieHeader(
						context.response.headers.get("Set-Cookie") || "",
					);
					expect(parsed.get("better-auth.trust_device")?.value).toBeDefined();
					updatedHeaders.set(
						"cookie",
						`better-auth.trust_device=${
							parsed.get("better-auth.trust_device")?.value
						}`,
					);
				},
			},
		});
		expect(signInRes.data?.user).toBeDefined();

		// Should still work with original headers
		const signIn2Res = await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			fetchOptions: {
				headers: newHeaders,
			},
		});
		expect(signIn2Res.data?.user).toBeDefined();

		// Should work with updated headers
		const signIn3Res = await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			fetchOptions: {
				headers: updatedHeaders,
			},
		});
		expect(signIn3Res.data?.user).toBeDefined();
	});

	it("should limit OTP verification attempts", async () => {
		const headers = new Headers();
		// Sign in to trigger 2FA
		await client.signIn.email({
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
		await client.twoFactor.sendOtp({
			fetchOptions: {
				headers,
			},
		});
		for (let i = 0; i < 5; i++) {
			const res = await client.twoFactor.verifyOtp({
				code: "000000", // Invalid code
				fetchOptions: {
					headers,
				},
			});
			expect(res.error?.message).toBe("Invalid code");
		}

		// Next attempt should be blocked
		const res = await client.twoFactor.verifyOtp({
			code: OTP, // Even with correct code
			fetchOptions: {
				headers,
			},
		});
		expect(res.error?.message).toBe(
			"Too many attempts. Please request a new code.",
		);
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

describe("two factor auth API", async () => {
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
			asResponse: true,
		});
		headers = convertSetCookieToCookie(res.headers);

		const json = (await res.json()) as {
			status: boolean;
			backupCodes: string[];
			totpURI: string;
		};
		expect(json.backupCodes.length).toBe(10);
		expect(json.totpURI).toBeDefined();
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
			asResponse: true,
		});
		headers = convertSetCookieToCookie(res.headers);
		expect(res.status).toBe(200);
		const session = await auth.api.getSession({
			headers,
		});
		expect(session?.user.twoFactorEnabled).toBe(false);
	});
});

describe("view backup codes", async () => {
	const sendOTP = vi.fn();
	const { auth, signInWithTestUser, testUser, db } = await getTestInstance({
		secret: DEFAULT_SECRET,
		plugins: [
			twoFactor({
				otpOptions: {
					sendOTP({ otp }) {
						sendOTP(otp);
					},
				},
				skipVerificationOnEnable: true,
			}),
		],
	});
	let { headers } = await signInWithTestUser();

	let session = await auth.api.getSession({ headers });
	const userId = session?.user.id!;

	it("should return parsed array of backup codes, not JSON string", async () => {
		const enableRes = await auth.api.enableTwoFactor({
			body: { password: testUser.password },
			headers,
			asResponse: true,
		});

		expect(enableRes.status).toBe(200);
		headers = convertSetCookieToCookie(enableRes.headers);

		const enableJson = (await enableRes.json()) as {
			backupCodes: string[];
		};

		const viewResult = await auth.api.viewBackupCodes({
			body: { userId },
		});

		expect(typeof viewResult.backupCodes).not.toBe("string");
		expect(Array.isArray(viewResult.backupCodes)).toBe(true);
		expect(viewResult.backupCodes.length).toBe(10);
		viewResult.backupCodes.forEach((code) => {
			expect(typeof code).toBe("string");
			expect(code.length).toBeGreaterThan(0);
		});
		expect(viewResult.backupCodes).toEqual(enableJson.backupCodes);
		expect(viewResult.status).toBe(true);
	});

	it("should return array after generating new backup codes", async () => {
		const generateResult = await auth.api.generateBackupCodes({
			body: { password: testUser.password },
			headers,
		});

		expect(generateResult.backupCodes).toBeDefined();
		expect(generateResult.backupCodes.length).toBe(10);

		const viewResult = await auth.api.viewBackupCodes({
			body: { userId },
		});

		expect(viewResult.status).toBe(true);
		expect(typeof viewResult.backupCodes).not.toBe("string");
		expect(Array.isArray(viewResult.backupCodes)).toBe(true);
		expect(viewResult.backupCodes.length).toBe(10);
		viewResult.backupCodes.forEach((code) => {
			expect(typeof code).toBe("string");
			expect(code.length).toBeGreaterThan(0);
		});
		expect(viewResult.backupCodes).toEqual(generateResult.backupCodes);
	});
});
