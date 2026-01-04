import { createOTP } from "@better-auth/utils/otp";
import { createAuthClient } from "../../../client";
import { parseSetCookieHeader } from "../../../cookies";
import { symmetricDecrypt } from "../../../crypto";
import { getTestInstance } from "../../../test-utils/test-instance";
import { DEFAULT_SECRET } from "../../../utils/constants";
import { twoFactor, twoFactorClient } from "../index";
import type {
	TwoFactorOptions,
	TwoFactorTable,
	UserWithTwoFactor,
} from "../types";

export async function setupTwoFactorTest(options?: TwoFactorOptions) {
	let capturedOTP = "";
	const setCapturedOTP = (otp: string) => {
		capturedOTP = otp;
	};

	const { testUser, customFetchImpl, sessionSetter, db, auth, cookieSetter } =
		await getTestInstance({
			secret: DEFAULT_SECRET,
			plugins: [
				twoFactor({
					otpOptions: {
						sendOTP({ otp }) {
							setCapturedOTP(otp);
						},
					},
					...options,
				}),
			],
		});

	const client = createAuthClient({
		plugins: [twoFactorClient()],
		fetchOptions: {
			customFetchImpl,
			baseURL: "http://localhost:3000/api/auth",
		},
	});

	return {
		testUser,
		auth,
		client,
		customFetchImpl,
		sessionSetter,
		db,
		get capturedOTP() {
			return capturedOTP;
		},
		setCapturedOTP,
		cookieSetter,
	};
}

export type TwoFactorTestContext = Awaited<
	ReturnType<typeof setupTwoFactorTest>
>;

export async function signInUser(context: TwoFactorTestContext) {
	const headers = new Headers();
	const session = await context.client.signIn.email({
		email: context.testUser.email,
		password: context.testUser.password,
		fetchOptions: {
			onSuccess: context.sessionSetter(headers),
		},
	});

	if (!session) {
		throw new Error("Failed to sign in user");
	}

	return { session: session.data!, headers };
}

export async function enableTwoFactor(
	context: TwoFactorTestContext,
	headers: Headers,
) {
	const result = await context.client.twoFactor.enable({
		password: context.testUser.password,
		fetchOptions: { headers },
	});

	if (!result.data) {
		throw new Error("Failed to enable two factor");
	}

	return result.data;
}

export async function getTwoFactorSecret(
	context: TwoFactorTestContext,
	userId: string,
) {
	const twoFactor = await context.db.findOne<TwoFactorTable>({
		model: "twoFactor",
		where: [{ field: "userId", value: userId }],
	});

	if (!twoFactor) {
		throw new Error("Two factor not found");
	}

	return await symmetricDecrypt({
		key: DEFAULT_SECRET,
		data: twoFactor.secret,
	});
}

export async function generateTOTPCode(secret: string) {
	return await createOTP(secret).totp();
}

export async function initiateTwoFactorFlow(
	context: TwoFactorTestContext,
	options?: { rememberMe?: boolean },
) {
	const headers = new Headers();
	const cookies = new Map<string, string>();

	const response = await context.client.signIn.email({
		email: context.testUser.email,
		password: context.testUser.password,
		rememberMe: options?.rememberMe ?? false,
		fetchOptions: {
			onSuccess(ctx) {
				const parsed = parseSetCookieHeader(
					ctx.response.headers.get("Set-Cookie") || "",
				);
				for (const [name, cookie] of parsed.entries()) {
					if (cookie?.value) {
						cookies.set(name, cookie.value);
						headers.append("cookie", `${name}=${cookie.value}`);
					}
				}
			},
		},
	});

	return { response, headers, cookies };
}

export async function verifyOTP(
	context: TwoFactorTestContext,
	headers: Headers,
	options?: { trustDevice?: boolean },
) {
	await context.client.twoFactor.sendOtp({
		fetchOptions: { headers },
	});

	return await context.client.twoFactor.verifyOtp({
		code: context.capturedOTP,
		trustDevice: options?.trustDevice,
		fetchOptions: { headers },
	});
}

export async function getUserFromDB(
	context: TwoFactorTestContext,
	userId: string,
) {
	return await context.db.findOne<UserWithTwoFactor>({
		model: "user",
		where: [{ field: "id", value: userId }],
	});
}

export async function getTwoFactorFromDB(
	context: TwoFactorTestContext,
	userId: string,
) {
	return await context.db.findOne<TwoFactorTable>({
		model: "twoFactor",
		where: [{ field: "userId", value: userId }],
	});
}

export function extractCookieValue(
	cookies: Map<string, string>,
	name: string,
): string | undefined {
	return cookies.get(`better-auth.${name}`);
}

export function expectCookieToBeSet(
	cookies: Map<string, string>,
	name: string,
) {
	const value = extractCookieValue(cookies, name);
	if (!value) {
		throw new Error(`Expected cookie ${name} to be set`);
	}
	return value;
}

export function expectCookieNotToBeSet(
	cookies: Map<string, string>,
	name: string,
) {
	const value = extractCookieValue(cookies, name);
	if (value) {
		throw new Error(`Expected cookie ${name} not to be set`);
	}
}
