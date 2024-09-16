import { describe, expect, it } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { twoFactor, twoFactorClient } from ".";
import { createAuthClient } from "../../client";
import { parseSetCookieHeader } from "../../utils/cookies";
import type { UserWithTwoFactor } from "./types";

describe("two factor", async () => {
	const { testUser, customFetchImpl, sessionSetter, db, auth } =
		await getTestInstance({
			plugins: [
				twoFactor({
					otpOptions: {
						sendOTP() {},
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
		options: {
			onSuccess: sessionSetter(headers),
		},
	});
	if (!session) {
		throw new Error("No session");
	}
	it("should enable two factor", async () => {
		const res = await client.twoFactor.enable({
			password: testUser.password,
			options: {
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

		expect(dbUser?.twoFactorEnabled).toBe(true);
		expect(dbUser?.twoFactorSecret).toBeDefined();
		expect(dbUser?.twoFactorBackupCodes).toBeDefined();
	});

	it("should require two factor", async () => {
		const res = await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			options: {
				onSuccess(context) {
					const parsed = parseSetCookieHeader(
						context.response.headers.get("Set-Cookie") || "",
					);
					headers.append(
						"cookie",
						`better-auth.two-factor=${
							parsed.get("better-auth.two-factor")?.value
						}`,
					);
				},
			},
		});
		expect((res.data as any)?.twoFactorRedirect).toBe(true);
		const otpRes = await client.twoFactor.sendOtp({
			options: {
				body: {
					returnOTP: true,
				},
				headers,
				onSuccess(context) {
					const parsed = parseSetCookieHeader(
						context.response.headers.get("Set-Cookie") || "",
					);
					headers.append(
						"cookie",
						`better-auth.otp.counter=${
							parsed.get("better-auth.otp.counter")?.value
						}`,
					);
				},
			},
		});
		expect(otpRes.data?.OTP).toBeDefined();
		const verifyRes = await client.twoFactor.verifyOtp({
			code: otpRes.data?.OTP as string,
			options: {
				headers,
				onSuccess(context) {
					const parsed = parseSetCookieHeader(
						context.response.headers.get("Set-Cookie") || "",
					);
					expect(parsed.get("better-auth.session_token")?.value).toBeDefined();
				},
			},
		});
		expect(verifyRes.data?.status).toBe(true);
	});

	it("should trust device", async () => {
		const res = await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			options: {
				onSuccess(context) {
					const parsed = parseSetCookieHeader(
						context.response.headers.get("Set-Cookie") || "",
					);
					headers.append(
						"cookie",
						`better-auth.two-factor=${
							parsed.get("better-auth.two-factor")?.value
						}`,
					);
				},
			},
		});
		expect((res.data as any)?.twoFactorRedirect).toBe(true);
		const otpRes = await client.twoFactor.sendOtp({
			options: {
				body: {
					returnOTP: true,
				},
				headers,
				onSuccess(context) {
					const parsed = parseSetCookieHeader(
						context.response.headers.get("Set-Cookie") || "",
					);
					headers.append(
						"cookie",
						`better-auth.otp.counter=${
							parsed.get("better-auth.otp.counter")?.value
						}`,
					);
				},
			},
		});
		const newHeaders = new Headers();
		await client.twoFactor.verifyOtp({
			trustDevice: true,
			code: otpRes.data?.OTP as string,
			options: {
				headers,
				onSuccess(context) {
					const parsed = parseSetCookieHeader(
						context.response.headers.get("Set-Cookie") || "",
					);
					newHeaders.set(
						"cookie",
						`better-auth.trust-device=${
							parsed.get("better-auth.trust-device")?.value
						}`,
					);
				},
			},
		});

		const signInRes = await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			options: {
				headers: newHeaders,
			},
		});
		expect(signInRes.data?.user).toBeDefined();
	});

	it("should disable two factor", async () => {
		const res = await client.twoFactor.disable({
			password: testUser.password,
			options: {
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
	});
});
