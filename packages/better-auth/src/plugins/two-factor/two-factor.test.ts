import { describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { TWO_FACTOR_ERROR_CODES, twoFactor, twoFactorClient } from ".";
import { createAuthClient } from "../../client";
import { parseSetCookieHeader } from "../../cookies";
import type { TwoFactorTable, UserWithTwoFactor } from "./types";
import { DEFAULT_SECRET } from "../../utils/constants";
import { symmetricDecrypt } from "../../crypto";
import { convertSetCookieToCookie } from "../../test-utils/headers";
import { createOTP } from "@better-auth/utils/otp";

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
		const res = await client.twoFactor.verifyTotp({
			code: "123456",
			fetchOptions: {
				headers,
			},
		});
		expect(res.error?.message).toBe(
			TWO_FACTOR_ERROR_CODES.INVALID_TWO_FACTOR_COOKIE,
		);
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

	it("should successfully regenerate backup codes multiple times (Issue #5331)", async () => {
		// This test specifically addresses the Prisma validation error:
		// "Argument `where` of type TwoFactorWhereUniqueInput needs at least one of `id` arguments"
		// By generating backup codes multiple times, we ensure the update operation
		// uses the correct unique identifier (id) instead of userId

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

	it("should correctly update backup codes after verification (Issue #5331)", async () => {
		// This test ensures that verifyBackupCode also uses the correct update method
		// with id instead of userId, preventing the Prisma validation error

		// Generate fresh backup codes
		const generation = await auth.api.generateBackupCodes({
			body: { password: testUser.password },
			headers,
		});
		const backupCodes = generation.backupCodes;
		expect(backupCodes.length).toBe(10);

		// Create a new auth client for this test
		const testClient = createAuthClient({
			plugins: [twoFactorClient()],
			fetchOptions: {
				baseURL: "http://localhost:3000/api/auth",
			},
		});

		// Sign in to get the two-factor cookie
		const verifyHeaders = new Headers();
		await testClient.signIn.email({
			email: testUser.email,
			password: testUser.password,
			fetchOptions: {
				onSuccess(context: any) {
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
		await testClient.twoFactor.verifyBackupCode({
			code: usedBackupCode,
			fetchOptions: {
				headers: verifyHeaders,
				onSuccess(context: any) {
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
		// This update operation should use id instead of userId
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
});
