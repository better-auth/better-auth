import { APIError, BASE_ERROR_CODES } from "@better-auth/core/error";
import { createOTP } from "@better-auth/utils/otp";
import { describe, expect, it, vi } from "vitest";
import { createAuthClient } from "../../client";
import { parseSetCookieHeader } from "../../cookies";
import { symmetricDecrypt } from "../../crypto";
import { convertSetCookieToCookie } from "../../test-utils/headers";
import { getTestInstance } from "../../test-utils/test-instance";
import { DEFAULT_SECRET } from "../../utils/constants";
import { anonymous } from "../anonymous";
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
		const data = res.data;
		if (!data || data.method !== "totp") throw new Error("expected totp");
		expect(data.backupCodes.length).toEqual(10);
		expect(data.totpURI).toBeDefined();
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
		expect(twoFactor?.verified).toBe(false);
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

		const data = res.data;
		if (!data || data.method !== "totp") throw new Error("expected totp");
		const totpURI = data.totpURI;
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

		const data = res.data;
		if (!data || data.method !== "totp") throw new Error("expected totp");
		const totpURI = data.totpURI;
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
		expect((res.data as any)?.twoFactorMethods).toEqual(["totp", "otp"]);
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
			TWO_FACTOR_ERROR_CODES.INVALID_TWO_FACTOR_COOKIE.message,
		);
	});

	it("should fail when passing invalid TOTP code with expected error code", async () => {
		const res = await client.twoFactor.verifyTotp({
			code: "invalid-code",
			fetchOptions: {
				headers,
			},
		});
		expect(res.error?.message).toBe(
			TWO_FACTOR_ERROR_CODES.INVALID_CODE.message,
		);
	});

	let backupCodes: string[] = [];
	it("should generate backup codes", async () => {
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

		// Start a new 2FA session to test invalid backup code
		const headers2 = new Headers();
		await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			fetchOptions: {
				onSuccess(context) {
					const parsed = parseSetCookieHeader(
						context.response.headers.get("Set-Cookie") || "",
					);
					headers2.append(
						"cookie",
						`better-auth.two_factor=${
							parsed.get("better-auth.two_factor")?.value
						}`,
					);
				},
			},
		});

		const res = await client.twoFactor.verifyBackupCode({
			code: "invalid-code",
			fetchOptions: {
				headers: headers2,
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
		await client.twoFactor.sendOtp({
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

		// Old trust device cookie should no longer work because the
		// server-side record was rotated on sign-in
		const signIn2Res = await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			fetchOptions: {
				headers: newHeaders,
			},
		});
		expect((signIn2Res.data as any)?.twoFactorRedirect).toBe(true);

		// Should work with the refreshed (rotated) headers
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

describe("OTP-only enablement", async () => {
	const { auth, signInWithTestUser, testUser } = await getTestInstance({
		secret: DEFAULT_SECRET,
		plugins: [
			twoFactor({
				otpOptions: {
					sendOTP() {},
				},
			}),
		],
	});
	let { headers } = await signInWithTestUser();

	it("should enable 2FA with OTP method", async () => {
		const res = await auth.api.enableTwoFactor({
			body: { password: testUser.password, method: "otp" },
			headers,
			asResponse: true,
		});
		headers = convertSetCookieToCookie(res.headers);

		const json = (await res.json()) as { method: string };
		expect(json.method).toBe("otp");

		const session = await auth.api.getSession({ headers });
		expect(session?.user.twoFactorEnabled).toBe(true);
	});

	it("should only report OTP in twoFactorMethods at sign-in", async () => {
		const signInRes = await auth.api.signInEmail({
			body: {
				email: testUser.email,
				password: testUser.password,
			},
			asResponse: true,
		});
		const json = await signInRes.json();
		expect(json.twoFactorRedirect).toBe(true);
		expect(json.twoFactorMethods).toEqual(["otp"]);
	});

	it("should reject OTP enable when sendOTP is not configured", async () => {
		const {
			auth: noOtpAuth,
			signInWithTestUser: signIn,
			testUser: tu,
		} = await getTestInstance({
			secret: DEFAULT_SECRET,
			plugins: [twoFactor()],
		});
		const { headers: h } = await signIn();
		const res = await noOtpAuth.api.enableTwoFactor({
			body: { password: tu.password, method: "otp" },
			headers: h,
			asResponse: true,
		});
		expect(res.status).toBe(400);
		const json = await res.json();
		expect(json.code).toBe("OTP_NOT_CONFIGURED");
	});

	it("should reject TOTP enable when totpOptions.disable is set", async () => {
		const {
			auth: noTotpAuth,
			signInWithTestUser: signIn,
			testUser: tu,
		} = await getTestInstance({
			secret: DEFAULT_SECRET,
			plugins: [
				twoFactor({
					otpOptions: { sendOTP() {} },
					totpOptions: { disable: true },
				}),
			],
		});
		const { headers: h } = await signIn();
		const res = await noTotpAuth.api.enableTwoFactor({
			body: { password: tu.password, method: "totp" },
			headers: h,
			asResponse: true,
		});
		expect(res.status).toBe(400);
	});

	it("should preserve existing TOTP row when enabling OTP", async () => {
		const {
			auth: a,
			signInWithTestUser: signIn,
			testUser: tu,
			db,
		} = await getTestInstance({
			secret: DEFAULT_SECRET,
			plugins: [
				twoFactor({
					otpOptions: { sendOTP() {} },
				}),
			],
		});
		let { headers: h } = await signIn();

		// Set up verified TOTP first
		await a.api.enableTwoFactor({
			body: { password: tu.password, method: "totp" },
			headers: h,
		});
		const session = await a.api.getSession({ headers: h });
		const row = await db.findOne<TwoFactorTable>({
			model: "twoFactor",
			where: [{ field: "userId", value: session?.user.id as string }],
		});
		const decrypted = await symmetricDecrypt({
			key: DEFAULT_SECRET,
			data: row!.secret,
		});
		const code = await createOTP(decrypted).totp();
		const verifyRes = await a.api.verifyTOTP({
			body: { code },
			headers: h,
			asResponse: true,
		});
		h = convertSetCookieToCookie(verifyRes.headers);

		// Now enable OTP on top
		const otpRes = await a.api.enableTwoFactor({
			body: { password: tu.password, method: "otp" },
			headers: h,
			asResponse: true,
		});
		h = convertSetCookieToCookie(otpRes.headers);

		// TOTP row should still be intact
		const preserved = await db.findOne<TwoFactorTable>({
			model: "twoFactor",
			where: [{ field: "userId", value: session?.user.id as string }],
		});
		expect(preserved?.secret).toBeDefined();
		expect(preserved?.verified).toBe(true);

		// Sign-in should offer both methods
		const signInRes = await a.api.signInEmail({
			body: { email: tu.email, password: tu.password },
			asResponse: true,
		});
		const signInJson = await signInRes.json();
		expect(signInJson.twoFactorMethods).toEqual(["totp", "otp"]);
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
			}),
		],
	});
	let { headers } = await signInWithTestUser();

	it("should enable two factor with OTP method", async () => {
		const res = await auth.api.enableTwoFactor({
			body: {
				password: testUser.password,
				method: "otp",
			},
			headers,
			asResponse: true,
		});
		headers = convertSetCookieToCookie(res.headers);

		const json = (await res.json()) as { method: string };
		expect(json.method).toBe("otp");
		const session = await auth.api.getSession({
			headers,
		});
		expect(session?.user.twoFactorEnabled).toBe(true);
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
	const { auth, signInWithTestUser, testUser, customFetchImpl } =
		await getTestInstance({
			secret: DEFAULT_SECRET,
			plugins: [
				twoFactor({
					otpOptions: {
						sendOTP({ otp }) {
							sendOTP(otp);
						},
					},
				}),
			],
		});
	let { headers } = await signInWithTestUser();

	// Enable 2FA via OTP first to set twoFactorEnabled = true
	const otpEnableRes = await auth.api.enableTwoFactor({
		body: { password: testUser.password, method: "otp" },
		headers,
		asResponse: true,
	});
	headers = convertSetCookieToCookie(otpEnableRes.headers);

	const session = await auth.api.getSession({ headers });
	const userId = session?.user.id!;

	const client = createAuthClient({
		plugins: [twoFactorClient()],
		fetchOptions: {
			customFetchImpl,
			baseURL: "http://localhost:3000/api/auth",
		},
	});

	it("should return parsed array of backup codes, not JSON string", async () => {
		// Enable TOTP to create the twoFactor row with backup codes
		const enableRes = await auth.api.enableTwoFactor({
			body: { password: testUser.password },
			headers,
		});
		if (enableRes.method !== "totp") throw new Error("expected totp");

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
		expect(viewResult.backupCodes).toEqual(enableRes.backupCodes);
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

	it("should successfully regenerate backup codes multiple times", async () => {
		// First generation
		const firstGeneration = await auth.api.generateBackupCodes({
			body: { password: testUser.password },
			headers,
		});
		expect(firstGeneration.backupCodes).toBeDefined();
		expect(firstGeneration.backupCodes.length).toBe(10);
		expect(firstGeneration.status).toBe(true);

		// Second generation - this should update the existing record using id
		const secondGeneration = await auth.api.generateBackupCodes({
			body: { password: testUser.password },
			headers,
		});
		expect(secondGeneration.backupCodes).toBeDefined();
		expect(secondGeneration.backupCodes.length).toBe(10);
		expect(secondGeneration.status).toBe(true);

		// Verify the codes are different
		expect(secondGeneration.backupCodes).not.toEqual(
			firstGeneration.backupCodes,
		);

		// Third generation - ensure it still works
		const thirdGeneration = await auth.api.generateBackupCodes({
			body: { password: testUser.password },
			headers,
		});
		expect(thirdGeneration.backupCodes).toBeDefined();
		expect(thirdGeneration.backupCodes.length).toBe(10);
		expect(thirdGeneration.status).toBe(true);

		// Verify the latest codes are in the database
		const viewResult = await auth.api.viewBackupCodes({
			body: { userId },
		});
		expect(viewResult.backupCodes).toEqual(thirdGeneration.backupCodes);
	});

	it("should correctly update backup codes after verification", async () => {
		// Generate fresh backup codes for this test
		const generation = await auth.api.generateBackupCodes({
			body: { password: testUser.password },
			headers,
		});
		const backupCodes = generation.backupCodes;
		expect(backupCodes.length).toBe(10);

		// Sign in to get the two-factor cookie (similar to existing test pattern)
		const verifyHeaders = new Headers();
		await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			fetchOptions: {
				onSuccess(context) {
					const parsed = parseSetCookieHeader(
						context.response.headers.get("Set-Cookie") || "",
					);
					verifyHeaders.append(
						"cookie",
						`better-auth.two_factor=${
							parsed.get("better-auth.two_factor")?.value
						}`,
					);
				},
			},
		});

		// Use the first backup code
		const usedBackupCode = backupCodes[0]!;
		let sessionToken = "";
		await client.twoFactor.verifyBackupCode({
			code: usedBackupCode,
			fetchOptions: {
				headers: verifyHeaders,
				onSuccess(context) {
					const parsed = parseSetCookieHeader(
						context.response.headers.get("Set-Cookie") || "",
					);
					sessionToken = parsed.get("better-auth.session_token")?.value || "";
				},
			},
		});

		// Verify we got a session token
		expect(sessionToken.length).toBeGreaterThan(0);

		// Verify the used backup code was removed from the database
		const updatedCodes = await auth.api.viewBackupCodes({
			body: { userId },
		});

		expect(updatedCodes.backupCodes).toBeDefined();
		expect(updatedCodes.backupCodes.length).toBe(9); // One code was used
		expect(updatedCodes.backupCodes).not.toContain(usedBackupCode);

		// Verify remaining codes are still valid
		backupCodes.slice(1).forEach((code) => {
			expect(updatedCodes.backupCodes).toContain(code);
		});
	});

	it("should not expose viewBackupCodes to client", async () => {
		const response = await customFetchImpl(
			"http://localhost:3000/api/auth/two-factor/view-backup-codes",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ userId }),
			},
		);
		expect(response.status).toBe(404);
	});
});

describe("trust device server-side validation", async () => {
	let OTP = "";
	const { auth, signInWithTestUser, testUser, db } = await getTestInstance({
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

	let { headers } = await signInWithTestUser();

	it("should force 2FA when server-side trust record is expired", async () => {
		// Enable 2FA via OTP method (immediate activation)
		const enableRes = await auth.api.enableTwoFactor({
			body: { password: testUser.password, method: "otp" },
			headers,
			asResponse: true,
		});
		headers = convertSetCookieToCookie(enableRes.headers);

		// Sign in to trigger 2FA
		const signInRes = await auth.api.signInEmail({
			body: {
				email: testUser.email,
				password: testUser.password,
			},
			asResponse: true,
		});
		const twoFactorHeaders = convertSetCookieToCookie(signInRes.headers);

		// Send and verify OTP with trustDevice
		await auth.api.sendTwoFactorOTP({
			headers: twoFactorHeaders,
			body: {},
		});

		const verifyRes = await auth.api.verifyTwoFactorOTP({
			headers: twoFactorHeaders,
			body: {
				code: OTP,
				trustDevice: true,
			},
			asResponse: true,
		});
		expect(verifyRes.status).toBe(200);

		// Extract the trust device cookie
		const parsed = parseSetCookieHeader(
			verifyRes.headers.get("Set-Cookie") || "",
		);
		const trustDeviceCookieValue = parsed.get(
			"better-auth.trust_device",
		)?.value;
		expect(trustDeviceCookieValue).toBeDefined();

		// The cookie value is signed: "value.signature" where value is "token!trustIdentifier"
		// Extract the unsigned value (everything before the last dot)
		const lastDotIndex = trustDeviceCookieValue!.lastIndexOf(".");
		const unsignedValue = trustDeviceCookieValue!.substring(0, lastDotIndex);
		const [, trustIdentifier] = unsignedValue.split("!");
		expect(trustIdentifier).toBeDefined();

		const verificationRecord = await db.findOne<{
			id: string;
			identifier: string;
			value: string;
			expiresAt: Date;
		}>({
			model: "verification",
			where: [{ field: "identifier", value: trustIdentifier! }],
		});
		expect(verificationRecord).toBeDefined();

		// Manually expire the record by setting expiresAt to the past
		await db.update({
			model: "verification",
			where: [{ field: "id", value: verificationRecord!.id }],
			update: {
				expiresAt: new Date(Date.now() - 1000), // 1 second ago
			},
		});

		// Now sign in with the trust device cookie - should require 2FA again
		const trustHeaders = new Headers();
		trustHeaders.set(
			"cookie",
			`better-auth.trust_device=${trustDeviceCookieValue}`,
		);

		const signIn2Res = await auth.api.signInEmail({
			body: {
				email: testUser.email,
				password: testUser.password,
			},
			headers: trustHeaders,
			asResponse: true,
		});

		const signIn2Json = (await signIn2Res.json()) as {
			twoFactorRedirect?: boolean;
		};
		expect(signIn2Json.twoFactorRedirect).toBe(true);

		// The expired trust cookie should have been cleared
		const signIn2Parsed = parseSetCookieHeader(
			signIn2Res.headers.get("Set-Cookie") || "",
		);
		const clearedTrustCookie = signIn2Parsed.get("better-auth.trust_device");
		expect(clearedTrustCookie?.value).toBe("");
	});

	it("should preserve trust device after sign-out", async () => {
		// Sign in to trigger 2FA
		const signInRes = await auth.api.signInEmail({
			body: {
				email: testUser.email,
				password: testUser.password,
			},
			asResponse: true,
		});
		const twoFactorHeaders = convertSetCookieToCookie(signInRes.headers);

		// Send and verify OTP with trustDevice
		await auth.api.sendTwoFactorOTP({
			headers: twoFactorHeaders,
			body: {},
		});

		const verifyRes = await auth.api.verifyTwoFactorOTP({
			headers: twoFactorHeaders,
			body: {
				code: OTP,
				trustDevice: true,
			},
			asResponse: true,
		});
		expect(verifyRes.status).toBe(200);
		const sessionHeaders = convertSetCookieToCookie(verifyRes.headers);

		// Extract the trust device cookie
		const parsed = parseSetCookieHeader(
			verifyRes.headers.get("Set-Cookie") || "",
		);
		const trustDeviceCookieValue = parsed.get(
			"better-auth.trust_device",
		)?.value;
		expect(trustDeviceCookieValue).toBeDefined();

		// Extract trust identifier (cookie is signed: "value.signature")
		const lastDotIndex = trustDeviceCookieValue!.lastIndexOf(".");
		const unsignedValue = trustDeviceCookieValue!.substring(0, lastDotIndex);
		const [, trustIdentifier] = unsignedValue.split("!");
		expect(trustIdentifier).toBeDefined();

		const verificationBefore = await db.findOne<{
			id: string;
			identifier: string;
			value: string;
			expiresAt: Date;
		}>({
			model: "verification",
			where: [{ field: "identifier", value: trustIdentifier! }],
		});
		expect(verificationBefore).toBeDefined();

		// Sign out
		const signOutRes = await auth.api.signOut({
			headers: sessionHeaders,
			asResponse: true,
		});
		expect(signOutRes.status).toBe(200);

		// Verify the trust device cookie was NOT cleared (trust survives sign-out)
		const signOutParsed = parseSetCookieHeader(
			signOutRes.headers.get("Set-Cookie") || "",
		);
		const trustCookieAfterSignOut = signOutParsed.get(
			"better-auth.trust_device",
		);
		// Cookie should either not be set (unchanged) or still have its value
		expect(trustCookieAfterSignOut?.value || "preserved").not.toBe("");

		// Verify the DB record still exists
		const verificationAfter = await db.findOne<{
			id: string;
			identifier: string;
			value: string;
			expiresAt: Date;
		}>({
			model: "verification",
			where: [{ field: "identifier", value: trustIdentifier! }],
		});
		expect(verificationAfter).toBeDefined();

		// Sign in again with the trust device cookie - should skip 2FA
		const trustHeaders = new Headers();
		trustHeaders.set(
			"cookie",
			`better-auth.trust_device=${trustDeviceCookieValue}`,
		);

		const signIn2Res = await auth.api.signInEmail({
			body: {
				email: testUser.email,
				password: testUser.password,
			},
			headers: trustHeaders,
			asResponse: true,
		});

		const signIn2Json = (await signIn2Res.json()) as {
			user?: { email: string };
		};
		// Should NOT require 2FA - trust device survived sign-out
		expect(signIn2Json.user?.email).toBe(testUser.email);
	});

	it("should revoke trust device when disabling 2FA", async () => {
		// Sign in to trigger 2FA
		const signInRes = await auth.api.signInEmail({
			body: {
				email: testUser.email,
				password: testUser.password,
			},
			asResponse: true,
		});
		const twoFactorHeaders = convertSetCookieToCookie(signInRes.headers);

		// Send and verify OTP with trustDevice
		await auth.api.sendTwoFactorOTP({
			headers: twoFactorHeaders,
			body: {},
		});

		const verifyRes = await auth.api.verifyTwoFactorOTP({
			headers: twoFactorHeaders,
			body: {
				code: OTP,
				trustDevice: true,
			},
			asResponse: true,
		});
		expect(verifyRes.status).toBe(200);
		const sessionHeaders = convertSetCookieToCookie(verifyRes.headers);

		// Extract the trust device cookie
		const parsed = parseSetCookieHeader(
			verifyRes.headers.get("Set-Cookie") || "",
		);
		const trustDeviceCookieValue = parsed.get(
			"better-auth.trust_device",
		)?.value;
		expect(trustDeviceCookieValue).toBeDefined();

		// Extract trust identifier (cookie is signed: "value.signature")
		const lastDotIndex = trustDeviceCookieValue!.lastIndexOf(".");
		const unsignedValue = trustDeviceCookieValue!.substring(0, lastDotIndex);
		const [, trustIdentifier] = unsignedValue.split("!");
		expect(trustIdentifier).toBeDefined();

		const verificationBefore = await db.findOne<{
			id: string;
			identifier: string;
			value: string;
			expiresAt: Date;
		}>({
			model: "verification",
			where: [{ field: "identifier", value: trustIdentifier! }],
		});
		expect(verificationBefore).toBeDefined();

		// Disable 2FA
		const disableRes = await auth.api.disableTwoFactor({
			headers: sessionHeaders,
			body: {
				password: testUser.password,
			},
			asResponse: true,
		});
		expect(disableRes.status).toBe(200);

		// Verify the trust device cookie was cleared
		const disableParsed = parseSetCookieHeader(
			disableRes.headers.get("Set-Cookie") || "",
		);
		const clearedCookie = disableParsed.get("better-auth.trust_device");
		expect(clearedCookie?.value).toBe("");

		// Verify the DB record was deleted
		const verificationAfter = await db.findOne<{
			id: string;
			identifier: string;
			value: string;
			expiresAt: Date;
		}>({
			model: "verification",
			where: [{ field: "identifier", value: trustIdentifier! }],
		});
		expect(verificationAfter).toBeNull();
	});
});

describe("trustDeviceMaxAge", async () => {
	const customMaxAge = 7 * 24 * 60 * 60; // 7 days instead of default 30

	let OTP = "";
	const { auth, signInWithTestUser, testUser, db } = await getTestInstance({
		secret: DEFAULT_SECRET,
		plugins: [
			twoFactor({
				otpOptions: {
					sendOTP({ otp }) {
						OTP = otp;
					},
				},
				trustDeviceMaxAge: customMaxAge,
			}),
		],
	});

	let { headers } = await signInWithTestUser();

	it("should use custom trustDeviceMaxAge for the trust device cookie", async () => {
		// Enable 2FA via OTP method (immediate activation)
		const enableRes = await auth.api.enableTwoFactor({
			body: { password: testUser.password, method: "otp" },
			headers,
			asResponse: true,
		});
		headers = convertSetCookieToCookie(enableRes.headers);

		// Sign in to trigger 2FA
		const signInRes = await auth.api.signInEmail({
			body: {
				email: testUser.email,
				password: testUser.password,
			},
			asResponse: true,
		});
		const twoFactorHeaders = convertSetCookieToCookie(signInRes.headers);

		// Send and verify OTP with trustDevice
		await auth.api.sendTwoFactorOTP({
			headers: twoFactorHeaders,
			body: {},
		});

		const verifyRes = await auth.api.verifyTwoFactorOTP({
			headers: twoFactorHeaders,
			body: {
				code: OTP,
				trustDevice: true,
			},
			asResponse: true,
		});
		expect(verifyRes.status).toBe(200);

		// Verify the trust device cookie has the custom max-age
		const parsed = parseSetCookieHeader(
			verifyRes.headers.get("Set-Cookie") || "",
		);
		const trustDeviceCookie = parsed.get("better-auth.trust_device");
		expect(trustDeviceCookie).toBeDefined();
		expect(Number(trustDeviceCookie?.["max-age"])).toBe(customMaxAge);

		// Also verify the DB record has the correct expiration
		const trustDeviceCookieValue = trustDeviceCookie?.value;
		// Extract trust identifier (cookie is signed: "value.signature")
		const lastDotIndex = trustDeviceCookieValue!.lastIndexOf(".");
		const unsignedValue = trustDeviceCookieValue!.substring(0, lastDotIndex);
		const [, trustIdentifier] = unsignedValue.split("!");
		expect(trustIdentifier).toBeDefined();

		const verificationRecord = await db.findOne<{
			id: string;
			identifier: string;
			value: string;
			expiresAt: Date;
		}>({
			model: "verification",
			where: [{ field: "identifier", value: trustIdentifier! }],
		});
		expect(verificationRecord).toBeDefined();

		// Expiration should be approximately customMaxAge seconds from now
		const expiresAt = new Date(verificationRecord!.expiresAt).getTime();
		const expectedExpiry = Date.now() + customMaxAge * 1000;
		// Allow 5 second tolerance for test execution time
		expect(Math.abs(expiresAt - expectedExpiry)).toBeLessThan(5000);
	});

	it("should use default 30 days when trustDeviceMaxAge is not specified", async () => {
		let defaultOTP = "";
		const { auth: authDefault, signInWithTestUser: signInDefault } =
			await getTestInstance({
				secret: DEFAULT_SECRET,
				plugins: [
					twoFactor({
						otpOptions: {
							sendOTP({ otp }) {
								defaultOTP = otp;
							},
						},
					}),
				],
			});

		const { headers: defaultHeaders } = await signInDefault();

		// Enable 2FA
		await authDefault.api.enableTwoFactor({
			body: { password: testUser.password, method: "otp" },
			headers: defaultHeaders,
			asResponse: true,
		});

		// Sign in to trigger 2FA
		const signInRes = await authDefault.api.signInEmail({
			body: {
				email: testUser.email,
				password: testUser.password,
			},
			asResponse: true,
		});
		const twoFactorHeaders = convertSetCookieToCookie(signInRes.headers);

		// Send and verify OTP with trustDevice
		await authDefault.api.sendTwoFactorOTP({
			headers: twoFactorHeaders,
			body: {},
		});

		const verifyRes = await authDefault.api.verifyTwoFactorOTP({
			headers: twoFactorHeaders,
			body: {
				code: defaultOTP,
				trustDevice: true,
			},
			asResponse: true,
		});
		expect(verifyRes.status).toBe(200);

		// Verify the trust device cookie has the default max-age (30 days)
		const parsed = parseSetCookieHeader(
			verifyRes.headers.get("Set-Cookie") || "",
		);
		const trustDeviceCookie = parsed.get("better-auth.trust_device");
		expect(trustDeviceCookie).toBeDefined();
		// Default is 30 days = 30 * 24 * 60 * 60 = 2592000 seconds
		expect(Number(trustDeviceCookie?.["max-age"])).toBe(30 * 24 * 60 * 60);
	});
});

describe("twoFactorCookieMaxAge", async () => {
	const customMaxAge = 15 * 60; // 15 minutes
	const { auth, signInWithTestUser, testUser } = await getTestInstance({
		secret: DEFAULT_SECRET,
		plugins: [
			twoFactor({
				twoFactorCookieMaxAge: customMaxAge,
				otpOptions: { sendOTP() {} },
			}),
		],
	});

	let { headers } = await signInWithTestUser();

	it("should use custom twoFactorCookieMaxAge for the two-factor cookie", async () => {
		// Enable 2FA via OTP method (immediate activation)
		const enableRes = await auth.api.enableTwoFactor({
			body: { password: testUser.password, method: "otp" },
			headers,
			asResponse: true,
		});
		expect(enableRes.status).toBe(200);
		headers = convertSetCookieToCookie(enableRes.headers);

		// Sign in to trigger 2FA
		const signInRes = await auth.api.signInEmail({
			body: {
				email: testUser.email,
				password: testUser.password,
			},
			asResponse: true,
		});

		const parsed = parseSetCookieHeader(
			signInRes.headers.get("Set-Cookie") || "",
		);
		const twoFactorCookie = parsed.get("better-auth.two_factor");
		expect(twoFactorCookie).toBeDefined();
		expect(Number(twoFactorCookie?.["max-age"])).toBe(customMaxAge);
	});

	it("should use default 10 minutes when twoFactorCookieMaxAge is not specified", async () => {
		const { auth: authDefault, signInWithTestUser: signInDefault } =
			await getTestInstance({
				secret: DEFAULT_SECRET,
				plugins: [
					twoFactor({
						otpOptions: { sendOTP() {} },
					}),
				],
			});

		const { headers: defaultHeaders } = await signInDefault();

		// Enable 2FA via OTP method (immediate activation)
		const enableRes = await authDefault.api.enableTwoFactor({
			body: { password: testUser.password, method: "otp" },
			headers: defaultHeaders,
			asResponse: true,
		});
		expect(enableRes.status).toBe(200);

		// Sign in to trigger 2FA
		const signInRes = await authDefault.api.signInEmail({
			body: {
				email: testUser.email,
				password: testUser.password,
			},
			asResponse: true,
		});

		const parsed = parseSetCookieHeader(
			signInRes.headers.get("Set-Cookie") || "",
		);
		const twoFactorCookie = parsed.get("better-auth.two_factor");
		expect(twoFactorCookie).toBeDefined();
		// Default is 10 minutes = 600 seconds
		expect(Number(twoFactorCookie?.["max-age"])).toBe(600);
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/8424
 */
describe("twoFactorTable option", async () => {
	const { auth, signInWithTestUser, testUser, db } = await getTestInstance({
		secret: DEFAULT_SECRET,
		plugins: [
			twoFactor({
				twoFactorTable: "custom_two_factor",
				otpOptions: { sendOTP() {} },
			}),
		],
	});

	const { headers } = await signInWithTestUser();

	it("should use custom table name for two factor data", async () => {
		await auth.api.enableTwoFactor({
			body: { password: testUser.password },
			headers,
		});

		const twoFactorRecord = await db.findOne<TwoFactorTable>({
			model: "twoFactor",
			where: [
				{
					field: "userId",
					value: (await auth.api.getSession({ headers }))?.user.id as string,
				},
			],
		});
		expect(twoFactorRecord).toBeDefined();
		expect(twoFactorRecord?.secret).toBeDefined();
	});
});

describe("OTP storage modes", async () => {
	describe("hashed OTP storage", async () => {
		let OTP = "";
		const { auth, signInWithTestUser, testUser } = await getTestInstance({
			secret: DEFAULT_SECRET,
			plugins: [
				twoFactor({
					otpOptions: {
						sendOTP({ otp }) {
							OTP = otp;
						},
						storeOTP: "hashed",
					},
				}),
			],
		});

		let { headers } = await signInWithTestUser();

		it("should verify OTP when stored as hashed", async () => {
			// Enable 2FA via OTP method (immediate activation)
			const enableRes = await auth.api.enableTwoFactor({
				body: { password: testUser.password, method: "otp" },
				headers,
				asResponse: true,
			});
			headers = convertSetCookieToCookie(enableRes.headers);

			// Sign in to trigger 2FA
			const signInRes = await auth.api.signInEmail({
				body: {
					email: testUser.email,
					password: testUser.password,
				},
				asResponse: true,
			});
			headers = convertSetCookieToCookie(signInRes.headers);

			// Send OTP
			await auth.api.sendTwoFactorOTP({
				headers,
				body: {},
			});
			expect(OTP.length).toBe(6);

			// Verify OTP should succeed with the correct code
			const verifyRes = await auth.api.verifyTwoFactorOTP({
				headers,
				body: {
					code: OTP,
				},
				asResponse: true,
			});
			expect(verifyRes.status).toBe(200);
		});

		it("should reject invalid OTP when stored as hashed", async () => {
			// Sign in to trigger 2FA again
			const signInRes = await auth.api.signInEmail({
				body: {
					email: testUser.email,
					password: testUser.password,
				},
				asResponse: true,
			});
			const newHeaders = convertSetCookieToCookie(signInRes.headers);

			// Send OTP
			await auth.api.sendTwoFactorOTP({
				headers: newHeaders,
				body: {},
			});

			// Verify with wrong OTP should fail
			const verifyRes = await auth.api.verifyTwoFactorOTP({
				headers: newHeaders,
				body: {
					code: "000000",
				},
				asResponse: true,
			});
			expect(verifyRes.status).toBe(401);
			const json = (await verifyRes.json()) as { message: string };
			expect(json.message).toBe(TWO_FACTOR_ERROR_CODES.INVALID_CODE.message);
		});
	});

	describe("encrypted OTP storage", async () => {
		let OTP = "";
		const { auth, signInWithTestUser, testUser } = await getTestInstance({
			secret: DEFAULT_SECRET,
			plugins: [
				twoFactor({
					otpOptions: {
						sendOTP({ otp }) {
							OTP = otp;
						},
						storeOTP: "encrypted",
					},
				}),
			],
		});

		let { headers } = await signInWithTestUser();

		it("should verify OTP when stored as encrypted", async () => {
			// Enable 2FA via OTP method (immediate activation)
			const enableRes = await auth.api.enableTwoFactor({
				body: { password: testUser.password, method: "otp" },
				headers,
				asResponse: true,
			});
			headers = convertSetCookieToCookie(enableRes.headers);

			// Sign in to trigger 2FA
			const signInRes = await auth.api.signInEmail({
				body: {
					email: testUser.email,
					password: testUser.password,
				},
				asResponse: true,
			});
			headers = convertSetCookieToCookie(signInRes.headers);

			// Send OTP
			await auth.api.sendTwoFactorOTP({
				headers,
				body: {},
			});
			expect(OTP.length).toBe(6);

			// Verify OTP should succeed
			const verifyRes = await auth.api.verifyTwoFactorOTP({
				headers,
				body: {
					code: OTP,
				},
				asResponse: true,
			});
			expect(verifyRes.status).toBe(200);
		});
	});

	describe("custom hash function OTP storage", async () => {
		let OTP = "";
		const customHashFn = async (token: string) => {
			// Simple custom hash for testing (just reverse + prefix)
			return `custom_${token.split("").reverse().join("")}`;
		};

		const { auth, signInWithTestUser, testUser } = await getTestInstance({
			secret: DEFAULT_SECRET,
			plugins: [
				twoFactor({
					otpOptions: {
						sendOTP({ otp }) {
							OTP = otp;
						},
						storeOTP: { hash: customHashFn },
					},
				}),
			],
		});

		let { headers } = await signInWithTestUser();

		it("should verify OTP with custom hash function", async () => {
			// Enable 2FA via OTP method (immediate activation)
			const enableRes = await auth.api.enableTwoFactor({
				body: { password: testUser.password, method: "otp" },
				headers,
				asResponse: true,
			});
			headers = convertSetCookieToCookie(enableRes.headers);

			// Sign in to trigger 2FA
			const signInRes = await auth.api.signInEmail({
				body: {
					email: testUser.email,
					password: testUser.password,
				},
				asResponse: true,
			});
			headers = convertSetCookieToCookie(signInRes.headers);

			// Send OTP
			await auth.api.sendTwoFactorOTP({
				headers,
				body: {},
			});
			expect(OTP.length).toBe(6);

			// Verify OTP should succeed
			const verifyRes = await auth.api.verifyTwoFactorOTP({
				headers,
				body: {
					code: OTP,
				},
				asResponse: true,
			});
			expect(verifyRes.status).toBe(200);
		});
	});
});

describe("pre-migration twoFactor rows (verified absent)", async () => {
	it("should complete enrollment when verified is null", async () => {
		const { auth, signInWithTestUser, testUser, db } = await getTestInstance({
			secret: DEFAULT_SECRET,
			plugins: [
				twoFactor({
					otpOptions: {
						sendOTP() {},
					},
				}),
			],
		});
		const { headers } = await signInWithTestUser();
		const userId = (await auth.api.getSession({ headers }))?.user.id as string;

		// Simulate a pre-migration row: create via enableTwoFactor, then
		// strip the verified field to mimic a row that predates the column.
		await auth.api.enableTwoFactor({
			body: { password: testUser.password },
			headers,
		});
		const record = await db.findOne<TwoFactorTable>({
			model: "twoFactor",
			where: [{ field: "userId", value: userId }],
		});
		await db.update({
			model: "twoFactor",
			update: { verified: null as unknown as boolean },
			where: [{ field: "id", value: record!.id }],
		});

		// Verify TOTP should complete enrollment (flip twoFactorEnabled + set verified)
		const decrypted = await symmetricDecrypt({
			key: DEFAULT_SECRET,
			data: record!.secret,
		});
		const code = await createOTP(decrypted).totp();
		const verifyRes = await auth.api.verifyTOTP({
			body: { code },
			headers,
			asResponse: true,
		});
		expect(verifyRes.status).toBe(200);

		const user = await db.findOne<UserWithTwoFactor>({
			model: "user",
			where: [{ field: "id", value: userId }],
		});
		expect(user?.twoFactorEnabled).toBe(true);

		const updated = await db.findOne<TwoFactorTable>({
			model: "twoFactor",
			where: [{ field: "userId", value: userId }],
		});
		expect(updated?.verified).toBe(true);
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/8627
 */
describe("OTP-only account adding TOTP (issue #8627)", async () => {
	it("should create twoFactor row with verified=false on enableTwoFactor", async () => {
		const { auth, signInWithTestUser, testUser, db } = await getTestInstance({
			secret: DEFAULT_SECRET,
			plugins: [
				twoFactor({
					otpOptions: {
						sendOTP() {},
					},
				}),
			],
		});
		const { headers } = await signInWithTestUser();

		const enableRes = await auth.api.enableTwoFactor({
			body: { password: testUser.password },
			headers,
			asResponse: true,
		});
		expect(enableRes.status).toBe(200);

		const userId = (await auth.api.getSession({ headers }))?.user.id as string;
		const twoFactorRecord = await db.findOne<TwoFactorTable>({
			model: "twoFactor",
			where: [{ field: "userId", value: userId }],
		});

		expect(twoFactorRecord).toBeDefined();
		expect(twoFactorRecord?.verified).toBe(false);
	});

	it("should mark TOTP as verified after verifyTOTP during enrollment", async () => {
		const { auth, signInWithTestUser, testUser, db } = await getTestInstance({
			secret: DEFAULT_SECRET,
			plugins: [
				twoFactor({
					otpOptions: {
						sendOTP() {},
					},
				}),
			],
		});
		const { headers } = await signInWithTestUser();

		await auth.api.enableTwoFactor({
			body: { password: testUser.password },
			headers,
		});

		const userId = (await auth.api.getSession({ headers }))?.user.id as string;
		const twoFactorRecord = await db.findOne<TwoFactorTable>({
			model: "twoFactor",
			where: [{ field: "userId", value: userId }],
		});
		expect(twoFactorRecord?.verified).toBe(false);

		const decrypted = await symmetricDecrypt({
			key: DEFAULT_SECRET,
			data: twoFactorRecord!.secret,
		});
		const code = await createOTP(decrypted).totp();
		const verifyRes = await auth.api.verifyTOTP({
			body: { code },
			headers,
			asResponse: true,
		});
		expect(verifyRes.status).toBe(200);

		const updatedRecord = await db.findOne<TwoFactorTable>({
			model: "twoFactor",
			where: [{ field: "userId", value: userId }],
		});
		expect(updatedRecord?.verified).toBe(true);
	});

	it("should preserve verified state during re-enrollment", async () => {
		const { auth, signInWithTestUser, testUser, db } = await getTestInstance({
			secret: DEFAULT_SECRET,
			plugins: [
				twoFactor({
					otpOptions: {
						sendOTP() {},
					},
				}),
			],
		});
		let { headers } = await signInWithTestUser();

		// Enable and fully verify TOTP
		await auth.api.enableTwoFactor({
			body: { password: testUser.password },
			headers,
		});
		const userId = (await auth.api.getSession({ headers }))?.user.id as string;
		const record1 = await db.findOne<TwoFactorTable>({
			model: "twoFactor",
			where: [{ field: "userId", value: userId }],
		});
		const decrypted = await symmetricDecrypt({
			key: DEFAULT_SECRET,
			data: record1!.secret,
		});
		const code = await createOTP(decrypted).totp();
		const verifyEnrollRes = await auth.api.verifyTOTP({
			body: { code },
			headers,
			asResponse: true,
		});
		headers = convertSetCookieToCookie(verifyEnrollRes.headers);
		expect(verifyEnrollRes.status).toBe(200);

		// Re-enroll — verified should be preserved
		await auth.api.enableTwoFactor({
			body: { password: testUser.password },
			headers,
			asResponse: true,
		});
		const record2 = await db.findOne<TwoFactorTable>({
			model: "twoFactor",
			where: [{ field: "userId", value: userId }],
		});
		expect(record2?.verified).toBe(true);

		// Sign in with the new secret should work
		const signInRes = await auth.api.signInEmail({
			body: {
				email: testUser.email,
				password: testUser.password,
			},
			asResponse: true,
		});
		const signInHeaders = convertSetCookieToCookie(signInRes.headers);
		const decrypted2 = await symmetricDecrypt({
			key: DEFAULT_SECRET,
			data: record2!.secret,
		});
		const code2 = await createOTP(decrypted2).totp();
		const verifyRes = await auth.api.verifyTOTP({
			body: { code: code2 },
			headers: signInHeaders,
			asResponse: true,
		});
		expect(verifyRes.status).toBe(200);
	});

	it("should reject unverified TOTP during sign-in and allow OTP fallback", async () => {
		let OTP = "";
		const { auth, signInWithTestUser, testUser, db } = await getTestInstance({
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
		const { headers } = await signInWithTestUser();

		// Enable 2FA via OTP (sets twoFactorEnabled=true, no twoFactor row)
		await auth.api.sendTwoFactorOTP({ headers, body: {} });
		const otpEnrollRes = await auth.api.verifyTwoFactorOTP({
			headers,
			body: { code: OTP },
			asResponse: true,
		});
		expect(otpEnrollRes.status).toBe(200);
		const enrollHeaders = convertSetCookieToCookie(otpEnrollRes.headers);

		// Add TOTP without verifying — row created with verified=false
		const enableRes = await auth.api.enableTwoFactor({
			body: { password: testUser.password },
			headers: enrollHeaders,
		});
		if (enableRes.method !== "totp") throw new Error("expected totp");
		const backupCodes = enableRes.backupCodes;
		const userId = (await auth.api.getSession({ headers: enrollHeaders }))?.user
			.id as string;
		const record = await db.findOne<TwoFactorTable>({
			model: "twoFactor",
			where: [{ field: "userId", value: userId }],
		});
		expect(record?.verified).toBe(false);

		// Sign in — 2FA redirect because twoFactorEnabled=true
		const signInRes = await auth.api.signInEmail({
			body: {
				email: testUser.email,
				password: testUser.password,
			},
			asResponse: true,
		});
		const signInHeaders = convertSetCookieToCookie(signInRes.headers);

		// TOTP should be rejected (unverified enrollment)
		const verifyRes = await auth.api.verifyTOTP({
			body: { code: "000000" },
			headers: signInHeaders,
			asResponse: true,
		});
		expect(verifyRes.status).toBe(400);

		// Backup codes should work even with unverified TOTP
		const backupRes = await auth.api.verifyBackupCode({
			body: { code: backupCodes[0]! },
			headers: signInHeaders,
			asResponse: true,
		});
		expect(backupRes.status).toBe(200);
	});
});

describe("two factor passwordless", async () => {
	const { auth, db } = await getTestInstance(
		{
			secret: DEFAULT_SECRET,
			plugins: [anonymous(), twoFactor({ allowPasswordless: true })],
		},
		{ disableTestUser: true },
	);

	const applySetCookie = (headers: Headers, responseHeaders: Headers) => {
		const setCookieHeader = responseHeaders.get("set-cookie");
		if (!setCookieHeader) {
			return headers;
		}
		const existing = headers.get("cookie");
		const cookieMap = new Map<string, string>();
		if (existing) {
			existing.split("; ").forEach((pair) => {
				const [name, ...rest] = pair.split("=");
				if (!name) {
					return;
				}
				cookieMap.set(name, rest.join("="));
			});
		}
		const cookies = parseSetCookieHeader(setCookieHeader);
		cookies.forEach((cookie, name) => {
			cookieMap.set(name, cookie.value);
		});
		headers.set(
			"cookie",
			Array.from(cookieMap.entries())
				.map(([name, value]) => `${name}=${value}`)
				.join("; "),
		);
		return headers;
	};

	const signInRes = await auth.api.signInAnonymous({ asResponse: true });
	let headers = applySetCookie(new Headers(), signInRes.headers);
	const session = await auth.api.getSession({ headers });
	const userId = session?.user.id as string;

	it("allows enabling without password for users without credentials", async () => {
		const res = await auth.api.enableTwoFactor({
			body: {},
			headers,
			asResponse: true,
		});
		headers = applySetCookie(headers, res.headers);

		const json = (await res.json()) as {
			backupCodes: string[];
			totpURI: string;
		};
		expect(json.backupCodes.length).toBe(10);
		expect(json.totpURI).toBeDefined();

		const twoFactor = await db.findOne<TwoFactorTable>({
			model: "twoFactor",
			where: [
				{
					field: "userId",
					value: userId,
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
		const verifyRes = await auth.api.verifyTOTP({
			body: {
				code,
			},
			headers,
			asResponse: true,
		});
		headers = applySetCookie(headers, verifyRes.headers);
	});

	it("allows getting totp uri without password", async () => {
		const res = await auth.api.getTOTPURI({
			headers,
			body: {},
		});
		expect(res.totpURI).toBeDefined();
	});

	it("allows generating backup codes without password", async () => {
		const res = await auth.api.generateBackupCodes({
			body: {},
			headers,
		});
		expect(res.backupCodes.length).toBe(10);
	});

	it("allows disabling without password", async () => {
		const res = await auth.api.disableTwoFactor({
			body: {},
			headers,
			asResponse: true,
		});
		expect(res.status).toBe(200);
	});
});

describe("two factor password still required for credential accounts", async () => {
	const { auth, signInWithTestUser } = await getTestInstance({
		secret: DEFAULT_SECRET,
		plugins: [twoFactor({ allowPasswordless: true })],
	});

	const { headers } = await signInWithTestUser();

	it("rejects enabling without password for credential users", async () => {
		const res = await auth.api.enableTwoFactor({
			body: {},
			headers,
			asResponse: true,
		});
		expect(res.status).toBe(400);
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/8900
 */
describe("checkPassword must not leak credential presence via error codes", async () => {
	const { auth, signInWithTestUser, testUser, db } = await getTestInstance({
		secret: DEFAULT_SECRET,
		plugins: [
			twoFactor({
				otpOptions: {
					sendOTP() {},
				},
			}),
		],
	});
	const { headers, user } = await signInWithTestUser();

	const enableRes = await auth.api.enableTwoFactor({
		body: { password: testUser.password },
		headers,
	});
	if (enableRes.method !== "totp") throw new Error("expected totp");
	expect(enableRes.totpURI).toBeDefined();

	it("uses INVALID_PASSWORD for wrong password and when credential row is missing", async () => {
		try {
			await auth.api.getTOTPURI({
				headers,
				body: { password: "not-the-real-password" },
			});
			expect.fail("expected rejection");
		} catch (e) {
			expect(e).toBeInstanceOf(APIError);
			if (e instanceof APIError) {
				expect(e.body?.code).toBe(BASE_ERROR_CODES.INVALID_PASSWORD.code);
			}
		}

		const accounts = await db.findMany<{
			id: string;
			providerId: string;
		}>({
			model: "account",
			where: [{ field: "userId", value: user.id }],
		});
		const credential = accounts.find((a) => a.providerId === "credential");
		expect(credential).toBeDefined();
		await db.delete({
			model: "account",
			where: [{ field: "id", value: credential!.id }],
		});

		try {
			await auth.api.getTOTPURI({
				headers,
				body: { password: testUser.password },
			});
			expect.fail("expected rejection");
		} catch (e) {
			expect(e).toBeInstanceOf(APIError);
			if (e instanceof APIError) {
				expect(e.body?.code).toBe(BASE_ERROR_CODES.INVALID_PASSWORD.code);
				expect(e.body?.code).not.toBe(
					BASE_ERROR_CODES.CREDENTIAL_ACCOUNT_NOT_FOUND.code,
				);
			}
		}
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/4101
 */
describe("twoFactorMethods in sign-in response", () => {
	describe("totp enabled in config, otp disabled", async () => {
		const { auth, signInWithTestUser, testUser, db } = await getTestInstance({
			secret: DEFAULT_SECRET,
			plugins: [twoFactor()],
		});
		const { user } = await signInWithTestUser();

		it("should not redirect when user has not verified totp", async () => {
			const signInRes = await auth.api.signInEmail({
				body: {
					email: testUser.email,
					password: testUser.password,
				},
			});
			expect(signInRes.user).toBeDefined();
			expect((signInRes as any).twoFactorRedirect).toBeUndefined();
		});

		it("should return twoFactorMethods: ['totp'] when user has verified totp", async () => {
			const { headers } = await auth.api
				.signInEmail({
					body: {
						email: testUser.email,
						password: testUser.password,
					},
					asResponse: true,
				})
				.then((res) => ({
					headers: convertSetCookieToCookie(res.headers),
				}));

			await auth.api.enableTwoFactor({
				body: { password: testUser.password },
				headers,
				asResponse: true,
			});

			const twoFactorRow = await db.findOne<TwoFactorTable>({
				model: "twoFactor",
				where: [{ field: "userId", value: user.id }],
			});
			const decrypted = await symmetricDecrypt({
				key: DEFAULT_SECRET,
				data: twoFactorRow!.secret,
			});
			const code = await createOTP(decrypted).totp();
			await auth.api.verifyTOTP({
				body: { code },
				headers,
			});

			const signInRes = await auth.api.signInEmail({
				body: {
					email: testUser.email,
					password: testUser.password,
				},
			});
			expect((signInRes as any).twoFactorRedirect).toBe(true);
			expect((signInRes as any).twoFactorMethods).toEqual(["totp"]);
		});
	});

	describe("totp enabled in config, otp enabled", async () => {
		const { auth, signInWithTestUser, testUser, db } = await getTestInstance({
			secret: DEFAULT_SECRET,
			plugins: [
				twoFactor({
					otpOptions: {
						sendOTP() {},
					},
				}),
			],
		});
		const { user } = await signInWithTestUser();

		it("should return twoFactorMethods: ['otp'] when user has 2fa enabled but no totp row", async () => {
			await db.update({
				model: "user",
				where: [{ field: "id", value: user.id }],
				update: { twoFactorEnabled: true },
			});

			const signInRes = await auth.api.signInEmail({
				body: {
					email: testUser.email,
					password: testUser.password,
				},
			});
			expect((signInRes as any).twoFactorRedirect).toBe(true);
			expect((signInRes as any).twoFactorMethods).toEqual(["otp"]);
		});

		it("should exclude unverified totp from twoFactorMethods", async () => {
			// Create an unverified TOTP row (abandoned enrollment)
			await db.update({
				model: "user",
				where: [{ field: "id", value: user.id }],
				update: { twoFactorEnabled: false },
			});
			const { headers } = await auth.api
				.signInEmail({
					body: {
						email: testUser.email,
						password: testUser.password,
					},
					asResponse: true,
				})
				.then((res) => ({
					headers: convertSetCookieToCookie(res.headers),
				}));
			await auth.api.enableTwoFactor({
				body: { password: testUser.password },
				headers,
				asResponse: true,
			});
			// enableTwoFactor creates verified=false; force twoFactorEnabled
			// back to true to simulate OTP-enrolled user adding TOTP
			await db.update({
				model: "user",
				where: [{ field: "id", value: user.id }],
				update: { twoFactorEnabled: true },
			});

			const signInRes = await auth.api.signInEmail({
				body: {
					email: testUser.email,
					password: testUser.password,
				},
			});
			expect((signInRes as any).twoFactorRedirect).toBe(true);
			expect((signInRes as any).twoFactorMethods).toEqual(["otp"]);
		});

		it("should return twoFactorMethods: ['totp', 'otp'] when user has verified totp", async () => {
			// reset twoFactorEnabled so we can sign in normally
			await db.update({
				model: "user",
				where: [{ field: "id", value: user.id }],
				update: { twoFactorEnabled: false },
			});

			const { headers } = await auth.api
				.signInEmail({
					body: {
						email: testUser.email,
						password: testUser.password,
					},
					asResponse: true,
				})
				.then((res) => ({
					headers: convertSetCookieToCookie(res.headers),
				}));

			await auth.api.enableTwoFactor({
				body: { password: testUser.password },
				headers,
				asResponse: true,
			});

			const twoFactorRow = await db.findOne<TwoFactorTable>({
				model: "twoFactor",
				where: [{ field: "userId", value: user.id }],
			});
			const decrypted = await symmetricDecrypt({
				key: DEFAULT_SECRET,
				data: twoFactorRow!.secret,
			});
			const code = await createOTP(decrypted).totp();
			await auth.api.verifyTOTP({
				body: { code },
				headers,
			});

			const signInRes = await auth.api.signInEmail({
				body: {
					email: testUser.email,
					password: testUser.password,
				},
			});
			expect((signInRes as any).twoFactorRedirect).toBe(true);
			expect((signInRes as any).twoFactorMethods).toEqual(["totp", "otp"]);
		});
	});

	describe("totp disabled in config, otp enabled", async () => {
		const { auth, signInWithTestUser, testUser } = await getTestInstance({
			secret: DEFAULT_SECRET,
			plugins: [
				twoFactor({
					totpOptions: { disable: true },
					otpOptions: {
						sendOTP() {},
					},
				}),
			],
		});
		await signInWithTestUser();

		it("should return twoFactorMethods: ['otp'] when totp is disabled in config", async () => {
			const { headers } = await auth.api
				.signInEmail({
					body: {
						email: testUser.email,
						password: testUser.password,
					},
					asResponse: true,
				})
				.then((res) => ({
					headers: convertSetCookieToCookie(res.headers),
				}));

			await auth.api.enableTwoFactor({
				body: { password: testUser.password, method: "otp" },
				headers,
				asResponse: true,
			});

			const signInRes = await auth.api.signInEmail({
				body: {
					email: testUser.email,
					password: testUser.password,
				},
			});
			expect((signInRes as any).twoFactorRedirect).toBe(true);
			expect((signInRes as any).twoFactorMethods).toEqual(["otp"]);
		});
	});
});
