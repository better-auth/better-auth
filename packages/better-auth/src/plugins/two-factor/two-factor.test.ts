import { APIError, BASE_ERROR_CODES } from "@better-auth/core/error";
import { createOTP } from "@better-auth/utils/otp";
import { describe, expect, it, vi } from "vitest";
import { appendSignInChallengeToURL } from "../../auth/sign-in-challenge-url";
import { createAuthClient } from "../../client";
import { parseSetCookieHeader } from "../../cookies";
import { setCookieToHeader } from "../../cookies/cookie-utils";
import { symmetricDecrypt, symmetricEncrypt } from "../../crypto";
import { generateRandomString } from "../../crypto/random";
import {
	expectNoTwoFactorChallenge,
	expectTwoFactorChallenge,
	getTestInstance,
} from "../../test-utils";
import { convertSetCookieToCookie } from "../../test-utils/headers";
import { DEFAULT_SECRET } from "../../utils/constants";
import { anonymous } from "../anonymous";
import { magicLink } from "../magic-link";
import { TWO_FACTOR_ERROR_CODES, twoFactor, twoFactorClient } from ".";
import type {
	TwoFactorEnforcementDecide,
	TwoFactorEnforcementDecideInput,
	TwoFactorMethod,
	TwoFactorTable,
	UserWithTwoFactor,
} from "./types";

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
	const sessionData = session.data;
	expectNoTwoFactorChallenge(sessionData);

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
					value: sessionData.user.id,
				},
			],
		});
		const twoFactor = await db.findOne<TwoFactorTable>({
			model: "twoFactor",
			where: [
				{
					field: "userId",
					value: sessionData.user.id,
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

	it("should preserve raw relative callback targets in two-factor redirects", () => {
		const challenge = {
			kind: "two-factor" as const,
			attemptId: "attempt-123",
			availableMethods: ["otp"] as TwoFactorMethod[],
		};
		const redirectURL = appendSignInChallengeToURL(
			"../done?tab=1#finish",
			challenge,
		);

		expect(redirectURL).toBe(
			"../done?tab=1&challenge=two-factor&methods=otp#finish",
		);
	});

	it("should enable twoFactor", async () => {
		const twoFactor = await db.findOne<TwoFactorTable>({
			model: "twoFactor",
			where: [
				{
					field: "userId",
					value: sessionData.user.id,
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
		const context = await auth.$context;
		const beforeSessions = await context.internalAdapter.listSessions(
			sessionData.user.id,
		);
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
					expect(parsed.get("better-auth.session_token")?.value).toBeFalsy();
					expect(parsed.get("better-auth.session_data")?.value).toBeFalsy();
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
		expectTwoFactorChallenge(res.data);
		expect(res.data.challenge.availableMethods).toEqual(["totp", "otp"]);
		const afterChallengeSessions = await context.internalAdapter.listSessions(
			sessionData.user.id,
		);
		expect(afterChallengeSessions).toHaveLength(beforeSessions.length);
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
					expect(parsed.get("better-auth.session_token")?.value).toBeFalsy();
					// 2FA Cookie is in response, but we are not setting it in headers
					expect(parsed.get("better-auth.two_factor")?.value).toBeDefined();
				},
			},
		});
		expectTwoFactorChallenge(res.data);
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

	it("should reject expired pending sign-in challenges", async () => {
		const challengeHeaders = new Headers();
		let attemptId = "";
		const signInRes = await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			fetchOptions: {
				onResponse(context) {
					const parsed = parseSetCookieHeader(
						context.response.headers.get("Set-Cookie") || "",
					);
					const challengeCookie = parsed.get("better-auth.two_factor")?.value;
					expect(challengeCookie).toBeDefined();
					challengeHeaders.append(
						"cookie",
						`better-auth.two_factor=${challengeCookie}`,
					);
				},
			},
		});
		expectTwoFactorChallenge(signInRes.data);
		attemptId = signInRes.data.challenge.attemptId;

		await db.update({
			model: "signInAttempt",
			update: {
				expiresAt: new Date(Date.now() - 60_000),
			},
			where: [{ field: "id", value: attemptId }],
		});

		const sendOtpRes = await client.twoFactor.sendOtp({
			fetchOptions: {
				headers: challengeHeaders,
			},
		});

		expect(sendOtpRes.error?.message).toBe(
			TWO_FACTOR_ERROR_CODES.INVALID_TWO_FACTOR_COOKIE.message,
		);
	});

	it("should not set dont_remember while a sign-in is paused behind two factor", async () => {
		const activeSessionHeaders = new Headers();
		await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			fetchOptions: {
				onSuccess: sessionSetter(activeSessionHeaders),
			},
		});

		await auth.api.signUpEmail({
			body: {
				email: "remember-me-2fa@test.com",
				password: "password123",
				name: "Remember Me 2FA",
			},
		});
		await db.update({
			model: "user",
			update: {
				twoFactorEnabled: true,
			},
			where: [{ field: "email", value: "remember-me-2fa@test.com" }],
		});

		const pausedHeaders = new Headers(activeSessionHeaders);
		const pausedSignInRes = await client.signIn.email({
			email: "remember-me-2fa@test.com",
			password: "password123",
			rememberMe: false,
			fetchOptions: {
				headers: pausedHeaders,
			},
		});
		expectTwoFactorChallenge(pausedSignInRes.data);

		const sessionResponse = await auth.api.getSession({
			headers: pausedHeaders,
			asResponse: true,
		});
		const parsed = parseSetCookieHeader(
			sessionResponse.headers.get("Set-Cookie") || "",
		);
		expect(parsed.get("better-auth.dont_remember")?.value).not.toBeDefined();
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
					expect(token).toBeFalsy();
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
				userId: sessionData.user.id,
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
		expectTwoFactorChallenge(res.data);
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
		expectNoTwoFactorChallenge(signInRes.data);
		expect(signInRes.data.user).toBeDefined();

		// Old trust device cookie should no longer work because the
		// server-side record was rotated on sign-in
		const signIn2Res = await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			fetchOptions: {
				headers: newHeaders,
			},
		});
		expectTwoFactorChallenge(signIn2Res.data);

		// Should work with the refreshed (rotated) headers
		const signIn3Res = await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			fetchOptions: {
				headers: updatedHeaders,
			},
		});
		expectNoTwoFactorChallenge(signIn3Res.data);
		expect(signIn3Res.data.user).toBeDefined();
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
			TWO_FACTOR_ERROR_CODES.TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE.message,
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
					value: sessionData.user.id,
				},
			],
		});
		expect(dbUser?.twoFactorEnabled).toBe(false);

		const signInRes = await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
		});
		expectNoTwoFactorChallenge(signInRes.data);
		expect(signInRes.data.user).toBeDefined();
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
					sendOTP({ otp, user }) {
						OTP = otp;
						sendOTP(otp, user.email);
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
		expect(sendOTP).toHaveBeenCalledWith(OTP, testUser.email);
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

	it("should preserve the active session while a second sign-in is paused behind 2FA", async () => {
		const activeHeaders = new Headers(headers);
		const signInRes = await auth.api.signInEmail({
			body: {
				email: testUser.email,
				password: testUser.password,
			},
			headers: activeHeaders,
			asResponse: true,
		});
		expect(signInRes.status).toBe(200);

		const challengeHeaders = new Headers(activeHeaders);
		setCookieToHeader(challengeHeaders)({ response: signInRes });

		const parsed = parseSetCookieHeader(
			signInRes.headers.get("Set-Cookie") || "",
		);
		expect(parsed.get("better-auth.two_factor")).toBeDefined();

		const currentSession = await auth.api.getSession({
			headers: challengeHeaders,
		});
		expect(currentSession?.user.email).toBe(testUser.email);

		await auth.api.sendTwoFactorOTP({
			headers: challengeHeaders,
			body: {},
		});
		expect(OTP.length).toBe(6);

		const verifyRes = await auth.api.verifyTwoFactorOTP({
			headers: challengeHeaders,
			body: {
				code: OTP,
			},
			asResponse: true,
		});
		expect(verifyRes.status).toBe(200);

		const verifiedHeaders = new Headers(challengeHeaders);
		setCookieToHeader(verifiedHeaders)({ response: verifyRes });
		const verifiedSession = await auth.api.getSession({
			headers: verifiedHeaders,
		});
		expect(verifiedSession?.user.email).toBe(testUser.email);
	});

	it("should ignore stale ambient two factor cookies for active session actions", async () => {
		OTP = "";
		sendOTP.mockClear();
		const otherUser = {
			email: "stale-two-factor@example.com",
			password: "password123",
			name: "Stale Two Factor",
		};
		await auth.api.signUpEmail({
			body: otherUser,
		});
		const activeHeaders = new Headers(headers);
		const context = await auth.$context;
		const activeUser = await context.internalAdapter.findUserByEmail(
			testUser.email,
		);
		const challengedUser = await context.internalAdapter.findUserByEmail(
			otherUser.email,
		);
		if (!activeUser || !challengedUser) {
			throw new Error("Expected both users to exist");
		}
		await context.internalAdapter.updateUser(activeUser.user.id, {
			twoFactorEnabled: true,
		});
		await context.internalAdapter.updateUser(challengedUser.user.id, {
			twoFactorEnabled: true,
		});
		const signInRes = await auth.api.signInEmail({
			body: {
				email: otherUser.email,
				password: otherUser.password,
			},
			headers: activeHeaders,
			asResponse: true,
		});
		expect(signInRes.status).toBe(200);

		const challengeHeaders = new Headers(activeHeaders);
		setCookieToHeader(challengeHeaders)({ response: signInRes });

		const parsed = parseSetCookieHeader(
			signInRes.headers.get("Set-Cookie") || "",
		);
		const signedTwoFactorCookie = parsed.get("better-auth.two_factor")?.value;
		expect(signedTwoFactorCookie).toBeDefined();
		if (!signedTwoFactorCookie) {
			throw new Error("Expected signed two factor cookie");
		}

		/**
		 * The cookie stores `<identifier>.<signature>`, while the verification row
		 * is keyed by the unsigned identifier.
		 */
		const attemptId = signedTwoFactorCookie.slice(
			0,
			signedTwoFactorCookie.lastIndexOf("."),
		);
		await context.internalAdapter.deleteSignInAttempt(attemptId);
		const sendOtpResponse = await auth.api.sendTwoFactorOTP({
			headers: challengeHeaders,
			body: {},
			asResponse: true,
		});
		expect(sendOtpResponse.status).toBe(200);
		expect(OTP.length).toBe(6);
		expect(sendOTP).toHaveBeenCalledTimes(1);

		const explicitChallengeResponse = await auth.api.sendTwoFactorOTP({
			headers: challengeHeaders,
			body: {
				attemptId,
			},
			asResponse: true,
		});
		expect(explicitChallengeResponse.status).toBe(401);
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
			kind?: string;
			challenge?: { kind?: string };
		};
		expect(signIn2Json.kind).toBe("challenge");
		expect(signIn2Json.challenge?.kind).toBe("two-factor");

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

describe("trustDevice.maxAge", async () => {
	const customMaxAge = 14 * 24 * 60 * 60; // 14 days; distinct from the 7-day default

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
				trustDevice: { maxAge: customMaxAge },
			}),
		],
	});

	let { headers } = await signInWithTestUser();

	it("should use custom trustDevice.maxAge for the trust device cookie", async () => {
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

	it("should use default 7 days when trustDevice.maxAge is not specified", async () => {
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

		// Verify the trust device cookie has the default max-age (7 days)
		const parsed = parseSetCookieHeader(
			verifyRes.headers.get("Set-Cookie") || "",
		);
		const trustDeviceCookie = parsed.get("better-auth.trust_device");
		expect(trustDeviceCookie).toBeDefined();
		expect(Number(trustDeviceCookie?.["max-age"])).toBe(7 * 24 * 60 * 60);
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
describe("availableMethods in sign-in response", () => {
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
			expectNoTwoFactorChallenge(signInRes);
			expect(signInRes.user).toBeDefined();
		});

		it("should return availableMethods: ['totp'] when user has verified totp", async () => {
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
			expectTwoFactorChallenge(signInRes);
			expect(signInRes.challenge.availableMethods).toEqual(["totp"]);
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

		it("should return availableMethods: ['otp'] when user has 2fa enabled but no totp row", async () => {
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
			expectTwoFactorChallenge(signInRes);
			expect(signInRes.challenge.availableMethods).toEqual(["otp"]);
		});

		it("should exclude unverified totp from availableMethods", async () => {
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
			expectTwoFactorChallenge(signInRes);
			expect(signInRes.challenge.availableMethods).toEqual(["otp"]);
		});

		it("should return availableMethods: ['totp', 'otp'] when user has verified totp", async () => {
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
			expectTwoFactorChallenge(signInRes);
			expect(signInRes.challenge.availableMethods).toEqual(["totp", "otp"]);
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

		it("should return availableMethods: ['otp'] even when user has a totp row", async () => {
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
			expectTwoFactorChallenge(signInRes);
			expect(signInRes.challenge.availableMethods).toEqual(["otp"]);
		});
	});
});

/**
 * @see https://github.com/better-auth/better-auth/pull/9205
 *
 * 2FA enforcement is intentionally scoped to credential sign-in paths
 * only. These tests lock that scope in so a future refactor does not
 * accidentally broaden enforcement to non-credential sign-in flows
 * without a dedicated release.
 */
describe("2FA enforcement scope", async () => {
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

	it("should challenge 2FA on magic-link sign-in", async () => {
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
		expect(json.kind).toBe("challenge");
		expect(json.challenge.kind).toBe("two-factor");
		expect(json.challenge.availableMethods).toEqual(["totp", "otp"]);
	});

	it("should not challenge 2FA on authenticated non-sign-in endpoints", async () => {
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
		expect(json.type).not.toBe("challenge");
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
			const sessionData = session.data;
			expectNoTwoFactorChallenge(sessionData);

			const enableRes = await client.twoFactor.enable({
				password: testUser.password,
				fetchOptions: { headers },
			});

			const initialCodes = enableRes.data?.backupCodes!;
			expect(initialCodes).toHaveLength(10);

			// Verify initial storage format
			const twoFactorBefore = await db.findOne<TwoFactorTable>({
				model: "twoFactor",
				where: [{ field: "userId", value: sessionData.user.id }],
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
				where: [{ field: "userId", value: sessionData.user.id }],
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

describe("two-factor verify attempt hardening", async () => {
	async function enrollTotp(params: {
		auth: Awaited<ReturnType<typeof getTestInstance>>["auth"];
		client: ReturnType<
			typeof createAuthClient<{ plugins: [ReturnType<typeof twoFactorClient>] }>
		>;
		db: Awaited<ReturnType<typeof getTestInstance>>["db"];
		email: string;
		password: string;
		sessionSetter: Awaited<ReturnType<typeof getTestInstance>>["sessionSetter"];
	}) {
		const enrolledHeaders = new Headers();
		const signIn = await params.client.signIn.email({
			email: params.email,
			password: params.password,
			fetchOptions: { onSuccess: params.sessionSetter(enrolledHeaders) },
		});
		expectNoTwoFactorChallenge(signIn.data);
		await params.client.twoFactor.enable({
			password: params.password,
			fetchOptions: { headers: enrolledHeaders },
		});
		const row = await params.db.findOne<TwoFactorTable>({
			model: "twoFactor",
			where: [{ field: "userId", value: signIn.data.user.id }],
		});
		if (!row) {
			throw new Error("twoFactor row missing after enable");
		}
		const decrypted = await symmetricDecrypt({
			key: DEFAULT_SECRET,
			data: row.secret,
		});
		const code = await createOTP(decrypted).totp();
		await params.client.twoFactor.verifyTotp({
			code,
			fetchOptions: {
				headers: enrolledHeaders,
				onSuccess: params.sessionSetter(enrolledHeaders),
			},
		});
		return { userId: signIn.data.user.id, secret: decrypted };
	}

	async function startPausedSignIn(params: {
		client: ReturnType<
			typeof createAuthClient<{ plugins: [ReturnType<typeof twoFactorClient>] }>
		>;
		email: string;
		password: string;
	}) {
		const challengeHeaders = new Headers();
		const res = await params.client.signIn.email({
			email: params.email,
			password: params.password,
			fetchOptions: {
				onResponse(context) {
					const parsed = parseSetCookieHeader(
						context.response.headers.get("Set-Cookie") || "",
					);
					const cookie = parsed.get("better-auth.two_factor")?.value;
					if (cookie) {
						challengeHeaders.append(
							"cookie",
							`better-auth.two_factor=${cookie}`,
						);
					}
				},
			},
		});
		expectTwoFactorChallenge(res.data);
		return {
			attemptId: res.data.challenge.attemptId,
			challengeHeaders,
		};
	}

	it("rejects cross-user attemptId with INVALID_TWO_FACTOR_COOKIE and audit-logs the mismatch", async () => {
		const { testUser, customFetchImpl, sessionSetter, db, auth } =
			await getTestInstance({
				secret: DEFAULT_SECRET,
				plugins: [twoFactor()],
			});
		const client = createAuthClient({
			plugins: [twoFactorClient()],
			fetchOptions: {
				customFetchImpl,
				baseURL: "http://localhost:3000/api/auth",
			},
		});

		await enrollTotp({
			auth: auth as unknown as Awaited<
				ReturnType<typeof getTestInstance>
			>["auth"],
			client,
			db,
			email: testUser.email,
			password: testUser.password,
			sessionSetter,
		});
		const { attemptId: victimAttemptId } = await startPausedSignIn({
			client,
			email: testUser.email,
			password: testUser.password,
		});

		const attackerEmail = "rfc6-s1-attacker@test.com";
		const attackerPassword = "attacker-password-123";
		const attackerSignUp = await auth.api.signUpEmail({
			body: {
				email: attackerEmail,
				password: attackerPassword,
				name: "Attacker",
			},
		});
		const attackerHeaders = new Headers();
		const attackerSignIn = await client.signIn.email({
			email: attackerEmail,
			password: attackerPassword,
			fetchOptions: { onSuccess: sessionSetter(attackerHeaders) },
		});
		expectNoTwoFactorChallenge(attackerSignIn.data);

		const context = await auth.$context;
		const loggerSpy = vi.spyOn(context.logger, "info");

		const res = await client.twoFactor.verifyTotp({
			code: "000000",
			attemptId: victimAttemptId,
			fetchOptions: { headers: attackerHeaders },
		} as Parameters<typeof client.twoFactor.verifyTotp>[0]);

		expect(res.data?.token).toBeUndefined();
		expect(res.error?.message).toBe(
			TWO_FACTOR_ERROR_CODES.INVALID_TWO_FACTOR_COOKIE.message,
		);

		const victimUser = await context.internalAdapter.findUserByEmail(
			testUser.email,
		);
		expect(loggerSpy).toHaveBeenCalledWith(
			"auth.two-factor.verify.rejected",
			expect.objectContaining({
				reason: "cross-user-attempt-id",
				sessionUserId: attackerSignUp.user.id,
				attemptUserId: victimUser!.user.id,
			}),
		);
		const allArgs = loggerSpy.mock.calls.flat();
		expect(
			allArgs.some(
				(arg) => typeof arg === "string" && arg.includes(victimAttemptId),
			),
		).toBe(false);
		loggerSpy.mockRestore();
	});

	it("atomically consumes the sign-in attempt under concurrent verify", async () => {
		const { testUser, customFetchImpl, sessionSetter, db, auth } =
			await getTestInstance({
				secret: DEFAULT_SECRET,
				plugins: [twoFactor()],
			});
		const client = createAuthClient({
			plugins: [twoFactorClient()],
			fetchOptions: {
				customFetchImpl,
				baseURL: "http://localhost:3000/api/auth",
			},
		});

		const { secret } = await enrollTotp({
			auth: auth as unknown as Awaited<
				ReturnType<typeof getTestInstance>
			>["auth"],
			client,
			db,
			email: testUser.email,
			password: testUser.password,
			sessionSetter,
		});
		const { attemptId, challengeHeaders } = await startPausedSignIn({
			client,
			email: testUser.email,
			password: testUser.password,
		});

		const code = await createOTP(secret).totp();

		const [resA, resB] = await Promise.all([
			client.twoFactor.verifyTotp({
				code,
				attemptId,
				fetchOptions: { headers: challengeHeaders },
			} as Parameters<typeof client.twoFactor.verifyTotp>[0]),
			client.twoFactor.verifyTotp({
				code,
				attemptId,
				fetchOptions: { headers: challengeHeaders },
			} as Parameters<typeof client.twoFactor.verifyTotp>[0]),
		]);

		const successes = [resA, resB].filter((r) => !!r.data?.token).length;
		const failures = [resA, resB].filter(
			(r) =>
				r.error?.message ===
				TWO_FACTOR_ERROR_CODES.INVALID_TWO_FACTOR_COOKIE.message,
		).length;
		expect(successes).toBe(1);
		expect(failures).toBe(1);
	});

	it("locks the attempt after too many failed verifications", async () => {
		const { testUser, customFetchImpl, sessionSetter, db, auth } =
			await getTestInstance({
				secret: DEFAULT_SECRET,
				plugins: [
					twoFactor({
						maxVerificationAttempts: 5,
					} as Parameters<typeof twoFactor>[0]),
				],
			});
		const client = createAuthClient({
			plugins: [twoFactorClient()],
			fetchOptions: {
				customFetchImpl,
				baseURL: "http://localhost:3000/api/auth",
			},
		});

		const { secret } = await enrollTotp({
			auth: auth as unknown as Awaited<
				ReturnType<typeof getTestInstance>
			>["auth"],
			client,
			db,
			email: testUser.email,
			password: testUser.password,
			sessionSetter,
		});
		const { attemptId, challengeHeaders } = await startPausedSignIn({
			client,
			email: testUser.email,
			password: testUser.password,
		});

		for (let i = 0; i < 5; i++) {
			const bad = await client.twoFactor.verifyTotp({
				code: "000000",
				attemptId,
				fetchOptions: { headers: challengeHeaders },
			} as Parameters<typeof client.twoFactor.verifyTotp>[0]);
			expect(bad.error?.message).toBe(
				TWO_FACTOR_ERROR_CODES.INVALID_CODE.message,
			);
		}

		const validCode = await createOTP(secret).totp();
		const afterLock = await client.twoFactor.verifyTotp({
			code: validCode,
			attemptId,
			fetchOptions: { headers: challengeHeaders },
		} as Parameters<typeof client.twoFactor.verifyTotp>[0]);

		expect(afterLock.data?.token).toBeUndefined();
		expect(afterLock.error?.message).toBe(
			TWO_FACTOR_ERROR_CODES.TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE.message,
		);
	});

	it("finalizes with the signed cookie alone when the body omits attemptId", async () => {
		const { testUser, customFetchImpl, sessionSetter, db, auth } =
			await getTestInstance({
				secret: DEFAULT_SECRET,
				plugins: [twoFactor()],
			});
		const client = createAuthClient({
			plugins: [twoFactorClient()],
			fetchOptions: {
				customFetchImpl,
				baseURL: "http://localhost:3000/api/auth",
			},
		});
		const { secret } = await enrollTotp({
			auth: auth as unknown as Awaited<
				ReturnType<typeof getTestInstance>
			>["auth"],
			client,
			db,
			email: testUser.email,
			password: testUser.password,
			sessionSetter,
		});
		const { challengeHeaders } = await startPausedSignIn({
			client,
			email: testUser.email,
			password: testUser.password,
		});

		const code = await createOTP(secret).totp();
		const res = await client.twoFactor.verifyTotp({
			code,
			fetchOptions: { headers: challengeHeaders },
		} as Parameters<typeof client.twoFactor.verifyTotp>[0]);

		expect(res.data?.token).toBeTruthy();
		expect(res.data?.user?.email).toBe(testUser.email);
	});

	it("backup-code invalid bumps the attempt counter and locks after maxVerificationAttempts", async () => {
		const { testUser, customFetchImpl, sessionSetter, db, auth } =
			await getTestInstance({
				secret: DEFAULT_SECRET,
				plugins: [
					twoFactor({
						maxVerificationAttempts: 5,
					} as Parameters<typeof twoFactor>[0]),
				],
			});
		const client = createAuthClient({
			plugins: [twoFactorClient()],
			fetchOptions: {
				customFetchImpl,
				baseURL: "http://localhost:3000/api/auth",
			},
		});
		await enrollTotp({
			auth: auth as unknown as Awaited<
				ReturnType<typeof getTestInstance>
			>["auth"],
			client,
			db,
			email: testUser.email,
			password: testUser.password,
			sessionSetter,
		});
		const { attemptId, challengeHeaders } = await startPausedSignIn({
			client,
			email: testUser.email,
			password: testUser.password,
		});

		for (let i = 0; i < 5; i++) {
			const bad = await client.twoFactor.verifyBackupCode({
				code: "wrong-code",
				attemptId,
				fetchOptions: { headers: challengeHeaders },
			} as Parameters<typeof client.twoFactor.verifyBackupCode>[0]);
			expect(bad.error?.message).toBe(
				TWO_FACTOR_ERROR_CODES.INVALID_BACKUP_CODE.message,
			);
		}

		const afterLock = await client.twoFactor.verifyBackupCode({
			code: "still-wrong",
			attemptId,
			fetchOptions: { headers: challengeHeaders },
		} as Parameters<typeof client.twoFactor.verifyBackupCode>[0]);

		expect(afterLock.error?.message).toBe(
			TWO_FACTOR_ERROR_CODES.TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE.message,
		);
	});

	it("trustDevice is honored in management mode (step-up on an active session)", async () => {
		const { testUser, customFetchImpl, sessionSetter, db, auth } =
			await getTestInstance({
				secret: DEFAULT_SECRET,
				plugins: [twoFactor()],
			});
		const client = createAuthClient({
			plugins: [twoFactorClient()],
			fetchOptions: {
				customFetchImpl,
				baseURL: "http://localhost:3000/api/auth",
			},
		});
		const { secret } = await enrollTotp({
			auth: auth as unknown as Awaited<
				ReturnType<typeof getTestInstance>
			>["auth"],
			client,
			db,
			email: testUser.email,
			password: testUser.password,
			sessionSetter,
		});
		const { attemptId, challengeHeaders } = await startPausedSignIn({
			client,
			email: testUser.email,
			password: testUser.password,
		});
		const sessionHeaders = new Headers();
		const code = await createOTP(secret).totp();
		await client.twoFactor.verifyTotp({
			code,
			attemptId,
			fetchOptions: {
				headers: challengeHeaders,
				onSuccess: sessionSetter(sessionHeaders),
			},
		} as Parameters<typeof client.twoFactor.verifyTotp>[0]);

		const stepUpCode = await createOTP(secret).totp();
		let stepUpSetCookie = "";
		await client.twoFactor.verifyTotp({
			code: stepUpCode,
			trustDevice: true,
			fetchOptions: {
				headers: sessionHeaders,
				onResponse(context) {
					stepUpSetCookie = context.response.headers.get("Set-Cookie") || "";
				},
			},
		} as Parameters<typeof client.twoFactor.verifyTotp>[0]);

		expect(stepUpSetCookie).toContain("better-auth.trust_device=");
	});

	it("finalizes with body attemptId alone when the two_factor cookie is absent", async () => {
		const { testUser, customFetchImpl, sessionSetter, db, auth } =
			await getTestInstance({
				secret: DEFAULT_SECRET,
				plugins: [twoFactor()],
			});
		const client = createAuthClient({
			plugins: [twoFactorClient()],
			fetchOptions: {
				customFetchImpl,
				baseURL: "http://localhost:3000/api/auth",
			},
		});
		const { secret } = await enrollTotp({
			auth: auth as unknown as Awaited<
				ReturnType<typeof getTestInstance>
			>["auth"],
			client,
			db,
			email: testUser.email,
			password: testUser.password,
			sessionSetter,
		});
		const { attemptId } = await startPausedSignIn({
			client,
			email: testUser.email,
			password: testUser.password,
		});

		const code = await createOTP(secret).totp();
		const res = await client.twoFactor.verifyTotp({
			code,
			attemptId,
			fetchOptions: { headers: new Headers() },
		} as Parameters<typeof client.twoFactor.verifyTotp>[0]);

		expect(res.data?.token).toBeTruthy();
		expect(res.data?.user?.email).toBe(testUser.email);
	});
});

describe("enforcement.decide", async () => {
	async function setupWithDecide(
		decide: TwoFactorEnforcementDecide,
		extra: { log?: (level: string, ...args: unknown[]) => void } = {},
	) {
		let OTP = "";
		const instance = await getTestInstance({
			secret: DEFAULT_SECRET,
			...(extra.log
				? { logger: { level: "info" as const, log: extra.log } }
				: {}),
			plugins: [
				twoFactor({
					otpOptions: {
						sendOTP({ otp }) {
							OTP = otp;
						},
					},
					skipVerificationOnEnable: true,
					enforcement: { decide },
				}),
			],
		});
		const { auth, testUser, signInWithTestUser } = instance;
		const { headers } = await signInWithTestUser();
		await auth.api.enableTwoFactor({
			body: { password: testUser.password },
			headers,
			asResponse: true,
		});
		return { auth, testUser, getOtp: () => OTP };
	}

	it('returning "skip" finalizes the session without issuing a challenge', async () => {
		const { auth, testUser } = await setupWithDecide(() => "skip");
		const signInRes = await auth.api.signInEmail({
			body: { email: testUser.email, password: testUser.password },
			asResponse: true,
		});
		const body = await signInRes.json();
		expect(signInRes.status).toBe(200);
		expectNoTwoFactorChallenge(body);
		const parsed = parseSetCookieHeader(
			signInRes.headers.get("Set-Cookie") || "",
		);
		expect(parsed.get("better-auth.two_factor")).toBeUndefined();
		expect(parsed.get("better-auth.session_token")).toBeDefined();
	});

	it('returning "enforce" bypasses a valid trust-device cookie', async () => {
		const { auth, testUser, getOtp } = await setupWithDecide(({ challenge }) =>
			challenge === "two-factor" ? "enforce" : undefined,
		);

		const firstSignIn = await auth.api.signInEmail({
			body: { email: testUser.email, password: testUser.password },
			asResponse: true,
		});
		const challengeHeaders = convertSetCookieToCookie(firstSignIn.headers);
		await auth.api.sendTwoFactorOTP({
			headers: challengeHeaders,
			body: {},
		});
		const verifyRes = await auth.api.verifyTwoFactorOTP({
			headers: challengeHeaders,
			body: { code: getOtp(), trustDevice: true },
			asResponse: true,
		});
		expect(verifyRes.status).toBe(200);
		const trustedHeaders = convertSetCookieToCookie(verifyRes.headers);

		const secondSignIn = await auth.api.signInEmail({
			body: { email: testUser.email, password: testUser.password },
			headers: trustedHeaders,
			asResponse: true,
		});
		const body = await secondSignIn.json();
		expectTwoFactorChallenge(body);
	});

	it("returning undefined defers to the trust-device default", async () => {
		const { auth, testUser, getOtp } = await setupWithDecide(() => undefined);

		const firstSignIn = await auth.api.signInEmail({
			body: { email: testUser.email, password: testUser.password },
			asResponse: true,
		});
		const challengeHeaders = convertSetCookieToCookie(firstSignIn.headers);
		await auth.api.sendTwoFactorOTP({
			headers: challengeHeaders,
			body: {},
		});
		const verifyRes = await auth.api.verifyTwoFactorOTP({
			headers: challengeHeaders,
			body: { code: getOtp(), trustDevice: true },
			asResponse: true,
		});
		expect(verifyRes.status).toBe(200);
		const trustedHeaders = convertSetCookieToCookie(verifyRes.headers);

		const secondSignIn = await auth.api.signInEmail({
			body: { email: testUser.email, password: testUser.password },
			headers: trustedHeaders,
			asResponse: true,
		});
		const body = await secondSignIn.json();
		expectNoTwoFactorChallenge(body);
	});

	it("receives { challenge, user, method, request } for the primary factor", async () => {
		const captured: TwoFactorEnforcementDecideInput[] = [];
		const { auth, testUser } = await setupWithDecide((input) => {
			captured.push(input);
			return undefined;
		});
		// Exercise the fetch path so ctx.request is a real Request; server-side
		// `auth.api.*` calls invoke the pipeline without one (documented).
		const handler = (req: Request) => auth.handler(req);
		await handler(
			new Request("http://localhost:3000/api/auth/sign-in/email", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					email: testUser.email,
					password: testUser.password,
				}),
			}),
		);
		expect(captured).toHaveLength(1);
		const [input] = captured;
		expect(input?.challenge).toBe("two-factor");
		expect(input?.user.id).toBeTruthy();
		expect(input?.method).toBe("password");
		expect(input?.request).toBeInstanceOf(Request);
	});

	it('audit-logs every "skip" decision at info level with user/method/challenge/reason', async () => {
		const log = vi.fn();
		const { auth, testUser } = await setupWithDecide(
			() => ({ decision: "skip", reason: "idp-amr-mfa" }),
			{ log },
		);
		await auth.api.signInEmail({
			body: { email: testUser.email, password: testUser.password },
			asResponse: true,
		});
		const skipCalls = log.mock.calls.filter(
			([level, message]) =>
				level === "info" &&
				typeof message === "string" &&
				message.includes("two-factor challenge skipped by decide hook"),
		);
		expect(skipCalls).toHaveLength(1);
		const [, , payload] = skipCalls[0] as [
			string,
			string,
			Record<string, unknown>,
		];
		expect(payload).toMatchObject({
			method: "password",
			challenge: "two-factor",
			reason: "idp-amr-mfa",
		});
	});

	it('literal "skip" return records reason: "unspecified"', async () => {
		const log = vi.fn();
		const { auth, testUser } = await setupWithDecide(() => "skip", { log });
		await auth.api.signInEmail({
			body: { email: testUser.email, password: testUser.password },
			asResponse: true,
		});
		const [, , payload] = log.mock.calls.find(
			([level, message]) =>
				level === "info" &&
				typeof message === "string" &&
				message.includes("two-factor challenge skipped by decide hook"),
		) as [string, string, Record<string, unknown>];
		expect(payload.reason).toBe("unspecified");
	});

	it('"enforce" decisions are not audit-logged as skips', async () => {
		const log = vi.fn();
		const { auth, testUser } = await setupWithDecide(() => "enforce", {
			log,
		});
		await auth.api.signInEmail({
			body: { email: testUser.email, password: testUser.password },
			asResponse: true,
		});
		const skipCalls = log.mock.calls.filter(
			([level, message]) =>
				level === "info" &&
				typeof message === "string" &&
				message.includes("two-factor challenge skipped by decide hook"),
		);
		expect(skipCalls).toHaveLength(0);
	});

	it("hook throws: exception propagates (fail-closed contract)", async () => {
		const { auth, testUser } = await setupWithDecide(() => {
			throw new Error("decide-hook-boom");
		});
		// Fail-closed: a `decide` hook error must not silently bypass 2FA.
		// The exception propagates through the sign-in pipeline rather
		// than being swallowed into a "skip" path.
		await expect(
			auth.api.signInEmail({
				body: { email: testUser.email, password: testUser.password },
				asResponse: true,
			}),
		).rejects.toThrow("decide-hook-boom");
	});

	it('"skip" decision wins over requireReverificationFor on the same path', async () => {
		let OTP = "";
		const decide: TwoFactorEnforcementDecide = () => "skip";
		const { auth, testUser, signInWithTestUser } = await getTestInstance({
			secret: DEFAULT_SECRET,
			plugins: [
				twoFactor({
					otpOptions: {
						sendOTP({ otp }) {
							OTP = otp;
						},
					},
					skipVerificationOnEnable: true,
					trustDevice: { requireReverificationFor: ["/sign-in/email"] },
					enforcement: { decide },
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
		expect(res.status).toBe(200);
		const body = await res.json();
		expectNoTwoFactorChallenge(body);
		expect(OTP).toBe("");
	});
});

describe("trustDevice.requireReverificationFor", async () => {
	async function enrollAndTrust(requireReverificationFor: string[]) {
		let OTP = "";
		const { auth, testUser, signInWithTestUser } = await getTestInstance({
			secret: DEFAULT_SECRET,
			plugins: [
				twoFactor({
					otpOptions: {
						sendOTP({ otp }) {
							OTP = otp;
						},
					},
					skipVerificationOnEnable: true,
					trustDevice: { requireReverificationFor },
				}),
			],
		});
		const { headers } = await signInWithTestUser();
		await auth.api.enableTwoFactor({
			body: { password: testUser.password },
			headers,
			asResponse: true,
		});
		const firstSignIn = await auth.api.signInEmail({
			body: { email: testUser.email, password: testUser.password },
			asResponse: true,
		});
		const challengeHeaders = convertSetCookieToCookie(firstSignIn.headers);
		await auth.api.sendTwoFactorOTP({ headers: challengeHeaders, body: {} });
		const verifyRes = await auth.api.verifyTwoFactorOTP({
			headers: challengeHeaders,
			body: { code: OTP, trustDevice: true },
			asResponse: true,
		});
		expect(verifyRes.status).toBe(200);
		return {
			auth,
			testUser,
			trustedHeaders: convertSetCookieToCookie(verifyRes.headers),
		};
	}

	it("forces a fresh challenge on an allowlisted path despite a valid trust cookie", async () => {
		const { auth, testUser, trustedHeaders } = await enrollAndTrust([
			"/sign-in/email",
		]);
		const res = await auth.api.signInEmail({
			body: { email: testUser.email, password: testUser.password },
			headers: trustedHeaders,
			asResponse: true,
		});
		const body = await res.json();
		expectTwoFactorChallenge(body);
	});

	it("honors the trust cookie on paths outside the allowlist", async () => {
		const { auth, testUser, trustedHeaders } = await enrollAndTrust([
			"/update-password",
		]);
		const res = await auth.api.signInEmail({
			body: { email: testUser.email, password: testUser.password },
			headers: trustedHeaders,
			asResponse: true,
		});
		const body = await res.json();
		expectNoTwoFactorChallenge(body);
	});

	it("empty allowlist is a no-op: trust cookie skips the challenge", async () => {
		const { auth, testUser, trustedHeaders } = await enrollAndTrust([]);
		const res = await auth.api.signInEmail({
			body: { email: testUser.email, password: testUser.password },
			headers: trustedHeaders,
			asResponse: true,
		});
		const body = await res.json();
		expectNoTwoFactorChallenge(body);
	});
});

describe("2fa config endpoints bypass cookie cache (#9132)", async () => {
	it("generateBackupCodes sees DB truth when cookie cache is stale", async () => {
		const { testUser, customFetchImpl, db } = await getTestInstance({
			secret: DEFAULT_SECRET,
			session: { cookieCache: { enabled: true, maxAge: 60 } },
			plugins: [twoFactor()],
		});

		const client = createAuthClient({
			plugins: [twoFactorClient()],
			fetchOptions: {
				customFetchImpl,
				baseURL: "http://localhost:3000/api/auth",
			},
		});

		const staleHeaders = new Headers();
		await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			fetchOptions: { onSuccess: setCookieToHeader(staleHeaders) },
		});
		const session = await client.getSession({
			fetchOptions: { headers: staleHeaders, throw: true },
		});

		const encryptedSecret = await symmetricEncrypt({
			key: DEFAULT_SECRET,
			data: generateRandomString(32),
		});
		await db.create<TwoFactorTable>({
			model: "twoFactor",
			data: {
				userId: session!.user.id,
				secret: encryptedSecret,
				backupCodes: encryptedSecret,
				verified: true,
			},
		});
		await db.update({
			model: "user",
			where: [{ field: "id", value: session!.user.id }],
			update: { twoFactorEnabled: true },
		});

		const result = await client.twoFactor.generateBackupCodes({
			password: testUser.password,
			fetchOptions: { headers: staleHeaders },
		});
		expect(result.error).toBeNull();
		expect(result.data?.status).toBe(true);
		expect(result.data?.backupCodes.length).toBe(10);
	});
});
