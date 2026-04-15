import type { BetterAuthPlugin } from "@better-auth/core";
import { APIError, BASE_ERROR_CODES } from "@better-auth/core/error";
import { createOTP } from "@better-auth/utils/otp";
import { describe, expect, it, vi } from "vitest";
import * as z from "zod";
import { createAuthEndpoint, createAuthMiddleware } from "../../api";
import { createAuthClient } from "../../client";
import { parseSetCookieHeader, setSessionCookie } from "../../cookies";
import { symmetricDecrypt } from "../../crypto";
import { convertSetCookieToCookie } from "../../test-utils/headers";
import { getTestInstance } from "../../test-utils/test-instance";
import { DEFAULT_SECRET } from "../../utils/constants";
import { admin } from "../admin";
import { anonymous } from "../anonymous";
import { magicLink } from "../magic-link";
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
					skipVerificationOnEnable: true,
				}),
			],
		});
	let { headers } = await signInWithTestUser();

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
				skipVerificationOnEnable: true,
			}),
		],
	});

	let { headers } = await signInWithTestUser();

	it("should force 2FA when server-side trust record is expired", async () => {
		// Enable 2FA
		const enableRes = await auth.api.enableTwoFactor({
			body: { password: testUser.password },
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
				skipVerificationOnEnable: true,
				trustDeviceMaxAge: customMaxAge,
			}),
		],
	});

	let { headers } = await signInWithTestUser();

	it("should use custom trustDeviceMaxAge for the trust device cookie", async () => {
		// Enable 2FA
		const enableRes = await auth.api.enableTwoFactor({
			body: { password: testUser.password },
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
						skipVerificationOnEnable: true,
					}),
				],
			});

		const { headers: defaultHeaders } = await signInDefault();

		// Enable 2FA
		await authDefault.api.enableTwoFactor({
			body: { password: testUser.password },
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
				skipVerificationOnEnable: true,
			}),
		],
	});

	let { headers } = await signInWithTestUser();

	it("should use custom twoFactorCookieMaxAge for the two-factor cookie", async () => {
		// Enable 2FA
		const enableRes = await auth.api.enableTwoFactor({
			body: { password: testUser.password },
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
						skipVerificationOnEnable: true,
					}),
				],
			});

		const { headers: defaultHeaders } = await signInDefault();

		// Enable 2FA
		const enableRes = await authDefault.api.enableTwoFactor({
			body: { password: testUser.password },
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
				skipVerificationOnEnable: true,
			}),
		],
	});

	let { headers } = await signInWithTestUser();

	it("should use custom table name for two factor data", async () => {
		const enableRes = await auth.api.enableTwoFactor({
			body: { password: testUser.password },
			headers,
			asResponse: true,
		});
		expect(enableRes.status).toBe(200);
		headers = convertSetCookieToCookie(enableRes.headers);

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
					skipVerificationOnEnable: true,
				}),
			],
		});

		let { headers } = await signInWithTestUser();

		it("should verify OTP when stored as hashed", async () => {
			// Enable 2FA
			const enableRes = await auth.api.enableTwoFactor({
				body: { password: testUser.password },
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
					skipVerificationOnEnable: true,
				}),
			],
		});

		let { headers } = await signInWithTestUser();

		it("should verify OTP when stored as encrypted", async () => {
			// Enable 2FA
			const enableRes = await auth.api.enableTwoFactor({
				body: { password: testUser.password },
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
					skipVerificationOnEnable: true,
				}),
			],
		});

		let { headers } = await signInWithTestUser();

		it("should verify OTP with custom hash function", async () => {
			// Enable 2FA
			const enableRes = await auth.api.enableTwoFactor({
				body: { password: testUser.password },
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
		const backupCodes = enableRes?.backupCodes as string[];
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
				skipVerificationOnEnable: true,
			}),
		],
	});
	let { headers, user } = await signInWithTestUser();

	const enableRes = await auth.api.enableTwoFactor({
		body: { password: testUser.password },
		headers,
		asResponse: true,
	});
	expect(enableRes.status).toBe(200);
	headers = convertSetCookieToCookie(enableRes.headers);

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
					skipVerificationOnEnable: true,
				}),
			],
		});
		await signInWithTestUser();

		it("should return twoFactorMethods: ['otp'] even when user has a totp row", async () => {
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

/**
 * @see https://github.com/better-auth/better-auth/issues/8627
 * @see https://github.com/better-auth/better-auth/pull/9122
 *
 * 2FA is challenged on every sign-in that creates a new session for a
 * 2FA-enabled user. The built-in logic has one exception: passkey
 * sign-ins whose assertion confirmed user verification are skipped
 * (covered in a dedicated block below). Applications override the
 * default via the `shouldEnforce` option.
 */
describe("2FA default enforcement scope", async () => {
	let magicLinkURL = "";
	const { auth, signInWithTestUser, testUser } = await getTestInstance({
		secret: DEFAULT_SECRET,
		plugins: [
			twoFactor({
				otpOptions: {
					sendOTP() {},
				},
				skipVerificationOnEnable: true,
			}),
			magicLink({
				sendMagicLink({ url }) {
					magicLinkURL = url;
				},
			}),
		],
	});

	it("should challenge 2FA on magic-link sign-in by default", async () => {
		const { headers } = await signInWithTestUser();
		await auth.api.enableTwoFactor({
			body: { password: testUser.password },
			headers,
			asResponse: true,
		});

		await auth.api.signInMagicLink({
			body: { email: testUser.email },
			headers: new Headers(),
		});

		const url = new URL(magicLinkURL);
		const token = url.searchParams.get("token")!;

		const verifyRes = await auth.api.magicLinkVerify({
			query: { token },
			headers: new Headers(),
			asResponse: true,
		});

		const json = await verifyRes.json();
		expect(json.twoFactorRedirect).toBe(true);
	});

	it("should not challenge 2FA when same-user session rewrites itself (updateUser)", async () => {
		// Uses a dedicated instance because the preceding test enables 2FA
		// on the shared testUser, which would otherwise gate the sign-in
		// with a 2FA challenge.
		const {
			auth: instance,
			signInWithTestUser: signIn,
			testUser: user,
		} = await getTestInstance({
			secret: DEFAULT_SECRET,
			plugins: [
				twoFactor({
					otpOptions: { sendOTP() {} },
					skipVerificationOnEnable: true,
				}),
			],
		});
		let { headers } = await signIn();
		const enableRes = await instance.api.enableTwoFactor({
			body: { password: user.password },
			headers,
			asResponse: true,
		});
		headers = convertSetCookieToCookie(enableRes.headers);

		const session = await instance.api.getSession({ headers });
		expect(session?.user.twoFactorEnabled).toBe(true);

		const updateRes = await instance.api.updateUser({
			body: { name: "updated-name" },
			headers,
			asResponse: true,
		});

		expect(updateRes.ok).toBe(true);
		const json = await updateRes.json();
		expect(json.twoFactorRedirect).toBeUndefined();
	});
});

/**
 * @see https://github.com/better-auth/better-auth/pull/9122
 *
 * When `autoSignInAfterVerification` is enabled and the verified user
 * has 2FA enabled, the resulting session creation must go through the
 * 2FA challenge before the session cookie becomes usable.
 */
describe("2FA enforcement on email-verification auto-sign-in", async () => {
	let verificationToken = "";
	const { auth, signInWithTestUser, testUser, db } = await getTestInstance({
		secret: DEFAULT_SECRET,
		emailVerification: {
			async sendVerificationEmail({ token }) {
				verificationToken = token;
			},
			autoSignInAfterVerification: true,
		},
		plugins: [
			twoFactor({
				otpOptions: { sendOTP() {} },
				skipVerificationOnEnable: true,
			}),
		],
	});

	it("should challenge 2FA when /verify-email auto-signs-in a 2FA-enabled user", async () => {
		const { headers } = await signInWithTestUser();
		await auth.api.enableTwoFactor({
			body: { password: testUser.password },
			headers,
			asResponse: true,
		});

		// Mark the user unverified so sendVerificationEmail issues a fresh
		// token, mirroring the change-email / re-verification flow.
		await db.update({
			model: "user",
			where: [{ field: "email", value: testUser.email }],
			update: { emailVerified: false },
		});

		await auth.api.sendVerificationEmail({
			body: { email: testUser.email },
		});
		expect(verificationToken).toBeTruthy();

		// autoSignInAfterVerification mints a new session without any
		// existing cookies; the 2FA challenge must fire before that
		// session is usable.
		const verifyRes = await auth.api.verifyEmail({
			query: { token: verificationToken },
			headers: new Headers(),
			asResponse: true,
		});
		const json = await verifyRes.json();
		expect(json.twoFactorRedirect).toBe(true);
	});
});

/**
 * @see https://github.com/better-auth/better-auth/pull/9122
 *
 * The 2FA challenge must fire when a before-hook populates
 * `ctx.context.session` with a session that belongs to a different
 * user than the one being authenticated. Only same-user rewrites
 * (session refresh, `updateUser`) skip the challenge.
 */
describe("2FA identity-aware session guard", async () => {
	const injectedUserId = "injected-user-id";

	const sessionInjector: BetterAuthPlugin = {
		id: "test-session-injector",
		hooks: {
			before: [
				{
					matcher: (ctx) => ctx.headers?.get?.("x-inject-session") === "1",
					handler: createAuthMiddleware(async (ctx) => {
						ctx.context.session = {
							user: { id: injectedUserId } as never,
							session: { userId: injectedUserId } as never,
						};
					}),
				},
			],
		},
	};

	it("should still challenge 2FA when a cross-user session is injected before the sign-in handler", async () => {
		const { auth, signInWithTestUser, testUser } = await getTestInstance({
			secret: DEFAULT_SECRET,
			plugins: [
				twoFactor({
					otpOptions: { sendOTP() {} },
					skipVerificationOnEnable: true,
				}),
				sessionInjector,
			],
		});

		const { headers } = await signInWithTestUser();
		await auth.api.enableTwoFactor({
			body: { password: testUser.password },
			headers,
			asResponse: true,
		});

		const injectedHeaders = new Headers({ "x-inject-session": "1" });
		const res = await auth.api.signInEmail({
			body: { email: testUser.email, password: testUser.password },
			headers: injectedHeaders,
			asResponse: true,
		});
		const json = await res.json();
		expect(json.twoFactorRedirect).toBe(true);
	});
});

/**
 * @see https://github.com/better-auth/better-auth/pull/9122
 *
 * A user-verified passkey assertion satisfies MFA on its own, so the 2FA
 * challenge must skip when the passkey plugin reports
 * `passkeyUserVerified: true` on `ctx.context`. Assertions without UV
 * still trigger the challenge.
 *
 * These tests use a minimal test plugin that registers the same path as
 * the passkey plugin (`/passkey/verify-authentication`) and sets the same
 * context flag, so the 2FA hook sees the exact shape it would see in a
 * real passkey sign-in.
 */
describe("2FA passkey user-verified carve-out", async () => {
	// Faithful simulator of the real passkey plugin's signal: it registers
	// the same path and writes `passkeyUserVerified` on `ctx.context`.
	// The real plugin lives at packages/passkey/src/routes.ts; keep this
	// in sync with that handler.
	const passkeyPathPlugin = (opts: { userVerified: boolean }) =>
		({
			id: "test-passkey-path",
			endpoints: {
				testPasskeyVerify: createAuthEndpoint(
					"/passkey/verify-authentication",
					{
						method: "POST",
						body: z.object({ email: z.string() }),
					},
					async (ctx) => {
						const user = await ctx.context.internalAdapter.findUserByEmail(
							ctx.body.email,
						);
						if (!user) throw new Error("user not found");
						const session = await ctx.context.internalAdapter.createSession(
							user.user.id,
						);
						(
							ctx.context as { passkeyUserVerified?: boolean }
						).passkeyUserVerified = opts.userVerified;
						await setSessionCookie(ctx, {
							session,
							user: user.user,
						});
						return ctx.json({ ok: true });
					},
				),
			},
		}) satisfies BetterAuthPlugin;

	it("should skip 2FA when passkey assertion had user verification", async () => {
		const { auth, signInWithTestUser, testUser } = await getTestInstance({
			secret: DEFAULT_SECRET,
			plugins: [
				twoFactor({
					otpOptions: { sendOTP() {} },
					skipVerificationOnEnable: true,
				}),
				passkeyPathPlugin({ userVerified: true }),
			],
		});

		const { headers } = await signInWithTestUser();
		await auth.api.enableTwoFactor({
			body: { password: testUser.password },
			headers,
			asResponse: true,
		});

		const res = await auth.api.testPasskeyVerify({
			body: { email: testUser.email },
			headers: new Headers(),
			asResponse: true,
		});
		const json = await res.json();
		expect(json.twoFactorRedirect).toBeUndefined();
		expect(json.ok).toBe(true);
	});

	it("should challenge 2FA when passkey assertion did not perform user verification", async () => {
		const { auth, signInWithTestUser, testUser } = await getTestInstance({
			secret: DEFAULT_SECRET,
			plugins: [
				twoFactor({
					otpOptions: { sendOTP() {} },
					skipVerificationOnEnable: true,
				}),
				passkeyPathPlugin({ userVerified: false }),
			],
		});

		const { headers } = await signInWithTestUser();
		await auth.api.enableTwoFactor({
			body: { password: testUser.password },
			headers,
			asResponse: true,
		});

		const res = await auth.api.testPasskeyVerify({
			body: { email: testUser.email },
			headers: new Headers(),
			asResponse: true,
		});
		const json = await res.json();
		expect(json.twoFactorRedirect).toBe(true);
	});

	it("should honor shouldEnforce even when passkey assertion was user-verified", async () => {
		const { auth, signInWithTestUser, testUser } = await getTestInstance({
			secret: DEFAULT_SECRET,
			plugins: [
				twoFactor({
					otpOptions: { sendOTP() {} },
					skipVerificationOnEnable: true,
					shouldEnforce: () => true,
				}),
				passkeyPathPlugin({ userVerified: true }),
			],
		});

		const { headers } = await signInWithTestUser();
		await auth.api.enableTwoFactor({
			body: { password: testUser.password },
			headers,
			asResponse: true,
		});

		const res = await auth.api.testPasskeyVerify({
			body: { email: testUser.email },
			headers: new Headers(),
			asResponse: true,
		});
		const json = await res.json();
		expect(json.twoFactorRedirect).toBe(true);
	});
});

/**
 * Session-transition endpoints (admin impersonation, multi-session
 * switching) mint a session for an identity that was already
 * authenticated elsewhere. Challenging 2FA on those transitions is a
 * regression: the operator driving the transition cannot produce the
 * target's second factor.
 */
describe("2FA skips session-transition endpoints", async () => {
	it("should not challenge 2FA on admin impersonation of a 2FA-enabled user", async () => {
		const { auth, db } = await getTestInstance({
			secret: DEFAULT_SECRET,
			plugins: [
				twoFactor({
					otpOptions: { sendOTP() {} },
					skipVerificationOnEnable: true,
				}),
				admin(),
			],
			databaseHooks: {
				user: {
					create: {
						before: async (user) => {
							if (user.email === "admin@test.com") {
								return { data: { ...user, role: "admin" } };
							}
						},
					},
				},
			},
		});

		const adminUser = await auth.api.signUpEmail({
			body: {
				email: "admin@test.com",
				password: "admin-password",
				name: "Admin",
			},
			asResponse: true,
		});
		const adminHeaders = convertSetCookieToCookie(adminUser.headers);

		const target = await auth.api.signUpEmail({
			body: {
				email: "target@test.com",
				password: "target-password",
				name: "Target",
			},
			asResponse: true,
		});
		let targetHeaders = convertSetCookieToCookie(target.headers);
		const enableRes = await auth.api.enableTwoFactor({
			body: { password: "target-password" },
			headers: targetHeaders,
			asResponse: true,
		});
		targetHeaders = convertSetCookieToCookie(enableRes.headers);

		const targetSession = await auth.api.getSession({ headers: targetHeaders });
		const targetUserId = targetSession?.user.id;
		expect(targetUserId).toBeDefined();
		expect(targetSession?.user.twoFactorEnabled).toBe(true);

		const impersonateRes = await auth.api.impersonateUser({
			body: { userId: targetUserId! },
			headers: adminHeaders,
			asResponse: true,
		});
		expect(impersonateRes.ok).toBe(true);
		const json = await impersonateRes.json();
		expect(json.twoFactorRedirect).toBeUndefined();
		expect(json.session).toBeDefined();
		expect(json.user?.id).toBe(targetUserId);

		// Confirm the impersonation session exists and was not torn down.
		const sessions = await db.findMany<{ id: string; userId: string }>({
			model: "session",
			where: [{ field: "userId", value: targetUserId! }],
		});
		expect(sessions.length).toBeGreaterThan(0);
	});
});

describe("2FA shouldEnforce option", async () => {
	it("should skip 2FA when shouldEnforce returns false", async () => {
		const { auth, signInWithTestUser, testUser } = await getTestInstance({
			secret: DEFAULT_SECRET,
			plugins: [
				twoFactor({
					otpOptions: { sendOTP() {} },
					skipVerificationOnEnable: true,
					shouldEnforce: () => false,
				}),
			],
		});

		const { headers } = await signInWithTestUser();
		await auth.api.enableTwoFactor({
			body: { password: testUser.password },
			headers,
			asResponse: true,
		});

		const res = await auth.api.signInEmail({
			body: { email: testUser.email, password: testUser.password },
			asResponse: true,
		});
		const json = await res.json();
		expect(json.twoFactorRedirect).toBeUndefined();
		expect(json.token).toBeDefined();
	});

	it("should skip 2FA selectively when shouldEnforce returns false for a path", async () => {
		let magicLinkURL = "";
		const { auth, signInWithTestUser, testUser } = await getTestInstance({
			secret: DEFAULT_SECRET,
			plugins: [
				twoFactor({
					otpOptions: { sendOTP() {} },
					skipVerificationOnEnable: true,
					shouldEnforce: (ctx) => ctx.path !== "/magic-link/verify",
				}),
				magicLink({
					sendMagicLink({ url }) {
						magicLinkURL = url;
					},
				}),
			],
		});

		const { headers } = await signInWithTestUser();
		await auth.api.enableTwoFactor({
			body: { password: testUser.password },
			headers,
			asResponse: true,
		});

		await auth.api.signInMagicLink({
			body: { email: testUser.email },
			headers: new Headers(),
		});
		const token = new URL(magicLinkURL).searchParams.get("token")!;

		const verifyRes = await auth.api.magicLinkVerify({
			query: { token },
			headers: new Headers(),
			asResponse: true,
		});
		const json = await verifyRes.json();
		expect(json.twoFactorRedirect).toBeUndefined();
		expect(json.session?.token).toBeDefined();
	});

	it("should accept an async shouldEnforce predicate", async () => {
		const { auth, signInWithTestUser, testUser } = await getTestInstance({
			secret: DEFAULT_SECRET,
			plugins: [
				twoFactor({
					otpOptions: { sendOTP() {} },
					skipVerificationOnEnable: true,
					shouldEnforce: async () => {
						await new Promise((resolve) => setTimeout(resolve, 1));
						return false;
					},
				}),
			],
		});

		const { headers } = await signInWithTestUser();
		await auth.api.enableTwoFactor({
			body: { password: testUser.password },
			headers,
			asResponse: true,
		});

		const res = await auth.api.signInEmail({
			body: { email: testUser.email, password: testUser.password },
			asResponse: true,
		});
		const json = await res.json();
		expect(json.twoFactorRedirect).toBeUndefined();
	});
});

/**
 * @see https://github.com/better-auth/better-auth/pull/7231
 */
describe("backup codes storage configurations", () => {
	const customEncrypt = async (data: string) =>
		Buffer.from(data).toString("base64") + ":custom";
	const customDecrypt = async (data: string) => {
		const [encoded] = data.split(":custom");
		return Buffer.from(encoded!, "base64").toString("utf-8");
	};

	const modes = [
		{
			name: "plain",
			config: "plain" as const,
			decodeStored: (raw: string) => JSON.parse(raw) as string[],
			verifyFormat: (_raw: string) => {},
		},
		{
			name: "encrypted",
			config: "encrypted" as const,
			decodeStored: async (raw: string) =>
				JSON.parse(
					await symmetricDecrypt({ key: DEFAULT_SECRET, data: raw }),
				) as string[],
			verifyFormat: (raw: string) => {
				expect(() => JSON.parse(raw)).toThrow();
			},
		},
		{
			name: "custom",
			config: { encrypt: customEncrypt, decrypt: customDecrypt },
			decodeStored: async (raw: string) =>
				JSON.parse(await customDecrypt(raw)) as string[],
			verifyFormat: (raw: string) => {
				expect(raw).toContain(":custom");
			},
		},
	];

	for (const mode of modes) {
		it(`should preserve ${mode.name} storage format after backup code verification`, async () => {
			const { client, testUser, sessionSetter, db } = await getTestInstance(
				{
					secret: DEFAULT_SECRET,
					plugins: [
						twoFactor({
							backupCodeOptions: { storeBackupCodes: mode.config },
							skipVerificationOnEnable: true,
						}),
					],
				},
				{ clientOptions: { plugins: [twoFactorClient()] } },
			);

			const headers = new Headers();
			const session = await client.signIn.email({
				email: testUser.email,
				password: testUser.password,
				fetchOptions: { onSuccess: sessionSetter(headers) },
			});

			const enableRes = await client.twoFactor.enable({
				password: testUser.password,
				fetchOptions: { headers },
			});

			const initialCodes = enableRes.data?.backupCodes!;
			expect(initialCodes).toHaveLength(10);

			// Verify initial storage format
			const twoFactorBefore = await db.findOne<TwoFactorTable>({
				model: "twoFactor",
				where: [{ field: "userId", value: session.data?.user.id as string }],
			});
			mode.verifyFormat(twoFactorBefore!.backupCodes);
			const storedCodes = await mode.decodeStored(twoFactorBefore!.backupCodes);
			expect(storedCodes).toEqual(initialCodes);

			// Use a backup code
			const signInHeaders = new Headers();
			await client.signIn.email({
				email: testUser.email,
				password: testUser.password,
				fetchOptions: {
					onSuccess(context) {
						const parsed = parseSetCookieHeader(
							context.response.headers.get("Set-Cookie") || "",
						);
						signInHeaders.append(
							"cookie",
							`better-auth.two_factor=${parsed.get("better-auth.two_factor")?.value}`,
						);
					},
				},
			});

			const usedCode = initialCodes[0]!;
			await client.twoFactor.verifyBackupCode({
				code: usedCode,
				fetchOptions: { headers: signInHeaders },
			});

			// Verify storage format is preserved and used code is removed
			const twoFactorAfter = await db.findOne<TwoFactorTable>({
				model: "twoFactor",
				where: [{ field: "userId", value: session.data?.user.id as string }],
			});
			mode.verifyFormat(twoFactorAfter!.backupCodes);
			const remainingCodes = await mode.decodeStored(
				twoFactorAfter!.backupCodes,
			);
			expect(remainingCodes).toHaveLength(9);
			expect(remainingCodes).not.toContain(usedCode);
			expect(remainingCodes).toEqual(
				initialCodes.filter((code) => code !== usedCode),
			);
		});
	}
});
