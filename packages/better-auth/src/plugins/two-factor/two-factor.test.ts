import { describe, expect, it } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { twoFactor, twoFactorClient } from ".";
import { createAuthClient } from "../../client";
import { parseSetCookieHeader } from "../../cookies";
import type { TwoFactorTable, UserWithTwoFactor } from "./types";
import { TOTPController } from "oslo/otp";
import { TimeSpan } from "oslo";
import { DEFAULT_SECRET } from "../../utils/constants";
import { symmetricDecrypt } from "../../crypto";

describe("two factor", async () => {
	let OTP = "";
	const { testUser, customFetchImpl, sessionSetter, db, auth } =
		await getTestInstance({
			secret: DEFAULT_SECRET,
			plugins: [
				twoFactor({
					otpOptions: {
						sendOTP(_, otp) {
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

	it("should return uri and backupcodes and shouldn't enable twoFactor yet", async () => {
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
