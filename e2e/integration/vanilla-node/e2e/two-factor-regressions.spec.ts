import { sso } from "@better-auth/sso";
import { expect, test } from "@playwright/test";
import {
	bearer,
	deviceAuthorization,
	emailOTP,
	genericOAuth,
	magicLink,
	oneTimeToken,
	organization,
	phoneNumber,
	siwe,
	twoFactor,
} from "better-auth/plugins";
import { OAuth2Server } from "oauth2-mock-server";
import { setupServer } from "./utils";

type CookieJar = Map<string, string>;

function splitSetCookieHeader(setCookie: string): string[] {
	if (!setCookie) {
		return [];
	}

	const result: string[] = [];
	let start = 0;
	let index = 0;

	while (index < setCookie.length) {
		if (setCookie[index] === ",") {
			let probe = index + 1;
			while (probe < setCookie.length && setCookie[probe] === " ") {
				probe++;
			}
			while (
				probe < setCookie.length &&
				setCookie[probe] !== "=" &&
				setCookie[probe] !== ";" &&
				setCookie[probe] !== ","
			) {
				probe++;
			}

			if (probe < setCookie.length && setCookie[probe] === "=") {
				const chunk = setCookie.slice(start, index).trim();
				if (chunk) {
					result.push(chunk);
				}
				start = index + 1;
				while (start < setCookie.length && setCookie[start] === " ") {
					start++;
				}
				index = start;
				continue;
			}
		}

		index++;
	}

	const lastChunk = setCookie.slice(start).trim();
	if (lastChunk) {
		result.push(lastChunk);
	}

	return result;
}

function updateCookieJar(jar: CookieJar, response: Response) {
	const setCookieHeader = response.headers.get("set-cookie");
	if (!setCookieHeader) {
		return;
	}

	for (const cookieString of splitSetCookieHeader(setCookieHeader)) {
		const [nameValue, ...attributeParts] = cookieString
			.split(";")
			.map((part) => part.trim());
		const [name, ...valueParts] = nameValue.split("=");
		if (!name || valueParts.length === 0) {
			continue;
		}

		const maxAge = attributeParts.find((part) =>
			part.toLowerCase().startsWith("max-age="),
		);
		if (maxAge && Number(maxAge.split("=")[1]) <= 0) {
			jar.delete(name);
			continue;
		}

		jar.set(name, valueParts.join("="));
	}
}

function cookieHeader(jar: CookieJar) {
	return Array.from(jar.entries())
		.map(([name, value]) => `${name}=${value}`)
		.join("; ");
}

function hasCookie(jar: CookieJar, baseName: string) {
	return Array.from(jar.keys()).some(
		(name) => name === baseName || name.endsWith(baseName),
	);
}

function resolveServerURL(url: string, port: number) {
	const resolved = new URL(url);
	resolved.protocol = "http:";
	resolved.hostname = "localhost";
	resolved.port = String(port);
	return resolved.toString();
}

async function followOAuthProviderRedirect(
	authURL: string,
	callbackPort: number,
) {
	const providerResponse = await fetch(authURL, {
		method: "GET",
		redirect: "manual",
	});
	const callbackLocation = providerResponse.headers.get("location");
	if (!callbackLocation) {
		throw new Error("No provider redirect location found");
	}
	return resolveServerURL(callbackLocation, callbackPort);
}

async function authRequest(
	url: string,
	jar: CookieJar,
	init: {
		method?: "GET" | "POST";
		body?: Record<string, unknown>;
		headers?: Record<string, string>;
		redirect?: RequestRedirect;
	} = {},
) {
	const requestURL = new URL(url);
	const headers = new Headers();
	// These tests drive the auth server directly rather than through a page,
	// so send the browser headers that origin/trusted-origin checks rely on.
	headers.set("origin", requestURL.origin);
	headers.set("referer", `${requestURL.origin}/`);
	if (jar.size > 0) {
		headers.set("cookie", cookieHeader(jar));
	}
	if (init.body) {
		headers.set("content-type", "application/json");
	}
	for (const [name, value] of Object.entries(init.headers ?? {})) {
		headers.set(name, value);
	}

	const response = await fetch(url, {
		method: init.method ?? "GET",
		headers,
		body: init.body ? JSON.stringify(init.body) : undefined,
		redirect: init.redirect ?? "follow",
	});
	updateCookieJar(jar, response);
	return response;
}

async function readWhoAmI(
	baseURL: string,
	jar: CookieJar,
	headers?: Record<string, string>,
) {
	const response = await authRequest(
		baseURL.replace("/api/auth", "/whoami"),
		jar,
		{ headers },
	);
	return (await response.json()) as {
		session: {
			user: {
				email: string;
				twoFactorEnabled?: boolean;
			} | null;
		} | null;
	};
}

async function readMemberCount(baseAppURL: string, email: string) {
	const response = await fetch(
		`${baseAppURL}/debug/member-count?email=${encodeURIComponent(email)}`,
	);
	return (await response.json()) as { count: number };
}

test.describe("two factor regression paths", () => {
	test("magic-link verification challenges before issuing a session", async () => {
		let magicLinkURL = "";
		const { port, stop } = await setupServer({
			plugins: [
				twoFactor({
					skipVerificationOnEnable: true,
					otpOptions: {
						sendOTP() {},
					},
				}),
				magicLink({
					async sendMagicLink({ url }) {
						magicLinkURL = url;
					},
				}),
			],
		});

		try {
			const sessionJar: CookieJar = new Map();
			const freshJar: CookieJar = new Map();
			const baseURL = `http://localhost:${port}/api/auth`;

			const signInResponse = await authRequest(
				`${baseURL}/sign-in/email`,
				sessionJar,
				{
					method: "POST",
					body: {
						email: "test@test.com",
						password: "password123",
					},
				},
			);
			expect(signInResponse.status).toBe(200);

			const enableResponse = await authRequest(
				`${baseURL}/two-factor/enable`,
				sessionJar,
				{
					method: "POST",
					body: {
						password: "password123",
					},
				},
			);
			expect(enableResponse.status).toBe(200);

			const whoAmI = await readWhoAmI(baseURL, sessionJar);
			expect(whoAmI.session?.user?.email).toBe("test@test.com");
			expect(whoAmI.session?.user?.twoFactorEnabled).toBe(true);

			const sendMagicLinkResponse = await authRequest(
				`${baseURL}/sign-in/magic-link`,
				freshJar,
				{
					method: "POST",
					body: {
						email: "test@test.com",
						callbackURL: "/dashboard",
					},
				},
			);
			expect(sendMagicLinkResponse.status).toBe(200);

			expect(magicLinkURL).toContain("/magic-link/verify");

			const verifyResponse = await authRequest(
				resolveServerURL(magicLinkURL, port),
				freshJar,
				{
					method: "GET",
					redirect: "manual",
				},
			);
			expect(verifyResponse.status).toBe(302);

			// Redirect-exit flows must hand the caller a 2FA challenge without
			// ever leaving behind an authenticated session cookie. The attemptId
			// travels only in the signed `better-auth.two_factor` cookie: query
			// parameters leak through Referer headers and proxy logs.
			const location = verifyResponse.headers.get("location");
			expect(location).toContain("challenge=two-factor");
			expect(location).not.toContain("attemptId=");
			expect(location).toContain("methods=");
			expect(hasCookie(freshJar, "better-auth.two_factor")).toBe(true);
			expect(hasCookie(freshJar, "better-auth.session_token")).toBe(false);
		} finally {
			await stop();
		}
	});

	test("a pending 2FA challenge does not log out the active browser session", async () => {
		let otpCode = "";
		const { port, stop } = await setupServer({
			plugins: [
				twoFactor({
					skipVerificationOnEnable: true,
					otpOptions: {
						sendOTP({ otp }) {
							otpCode = otp;
						},
					},
				}),
			],
		});

		try {
			const sessionJar: CookieJar = new Map();
			const baseURL = `http://localhost:${port}/api/auth`;

			const signInResponse = await authRequest(
				`${baseURL}/sign-in/email`,
				sessionJar,
				{
					method: "POST",
					body: {
						email: "test@test.com",
						password: "password123",
					},
				},
			);
			expect(signInResponse.status).toBe(200);

			const enableResponse = await authRequest(
				`${baseURL}/two-factor/enable`,
				sessionJar,
				{
					method: "POST",
					body: {
						password: "password123",
					},
				},
			);
			expect(enableResponse.status).toBe(200);

			const challengeResponse = await authRequest(
				`${baseURL}/sign-in/email`,
				sessionJar,
				{
					method: "POST",
					body: {
						email: "test@test.com",
						password: "password123",
					},
				},
			);
			expect(challengeResponse.status).toBe(200);
			expect(hasCookie(sessionJar, "session_token")).toBe(true);
			expect(hasCookie(sessionJar, "two_factor")).toBe(true);

			const challengeBody = (await challengeResponse.json()) as {
				kind: "challenge";
				challenge: {
					kind: "two-factor";
					attemptId: string;
					availableMethods: string[];
				};
			};
			expect(challengeBody.kind).toBe("challenge");
			expect(challengeBody.challenge.kind).toBe("two-factor");
			expect(challengeBody.challenge.attemptId).toBeTruthy();
			expect(challengeBody.challenge.availableMethods).toContain("otp");

			const currentSession = await readWhoAmI(baseURL, sessionJar);
			expect(currentSession.session?.user?.email).toBe("test@test.com");

			const sendOtpResponse = await authRequest(
				`${baseURL}/two-factor/send-otp`,
				sessionJar,
				{
					method: "POST",
					body: {
						attemptId: challengeBody.challenge.attemptId,
					},
				},
			);
			expect(sendOtpResponse.status).toBe(200);
			expect(otpCode).toHaveLength(6);

			const verifyResponse = await authRequest(
				`${baseURL}/two-factor/verify-otp`,
				sessionJar,
				{
					method: "POST",
					body: {
						attemptId: challengeBody.challenge.attemptId,
						code: otpCode,
					},
				},
			);
			expect(verifyResponse.status).toBe(200);
			expect(hasCookie(sessionJar, "two_factor")).toBe(false);

			const verifiedSession = await readWhoAmI(baseURL, sessionJar);
			expect(verifiedSession.session?.user?.email).toBe("test@test.com");
		} finally {
			await stop();
		}
	});

	test("email verification auto sign-in challenges before issuing a session", async () => {
		let verificationURL = "";
		const { port, stop } = await setupServer({
			emailVerification: {
				autoSignInAfterVerification: true,
				async sendVerificationEmail({ url }) {
					verificationURL = url;
				},
			},
			plugins: [
				twoFactor({
					skipVerificationOnEnable: true,
					otpOptions: {
						sendOTP() {},
					},
				}),
			],
		});

		try {
			const sessionJar: CookieJar = new Map();
			const freshJar: CookieJar = new Map();
			const baseURL = `http://localhost:${port}/api/auth`;

			const signInResponse = await authRequest(
				`${baseURL}/sign-in/email`,
				sessionJar,
				{
					method: "POST",
					body: {
						email: "test@test.com",
						password: "password123",
					},
				},
			);
			expect(signInResponse.status).toBe(200);

			const enableResponse = await authRequest(
				`${baseURL}/two-factor/enable`,
				sessionJar,
				{
					method: "POST",
					body: {
						password: "password123",
					},
				},
			);
			expect(enableResponse.status).toBe(200);

			const whoAmI = await readWhoAmI(baseURL, sessionJar);
			expect(whoAmI.session?.user?.email).toBe("test@test.com");
			expect(whoAmI.session?.user?.twoFactorEnabled).toBe(true);

			const sendVerificationResponse = await authRequest(
				`${baseURL}/send-verification-email`,
				freshJar,
				{
					method: "POST",
					body: {
						email: "test@test.com",
						callbackURL: "/dashboard",
					},
				},
			);
			expect(sendVerificationResponse.status).toBe(200);

			expect(verificationURL).toContain("/verify-email?token=");

			const verifyResponse = await authRequest(
				resolveServerURL(verificationURL, port),
				freshJar,
				{
					method: "GET",
					redirect: "manual",
				},
			);
			expect(verifyResponse.status).toBe(302);

			const location = verifyResponse.headers.get("location");
			expect(location).toContain("challenge=two-factor");
			expect(location).not.toContain("attemptId=");
			expect(location).toContain("methods=");
			expect(hasCookie(freshJar, "better-auth.two_factor")).toBe(true);
			expect(hasCookie(freshJar, "better-auth.session_token")).toBe(false);
		} finally {
			await stop();
		}
	});

	test("phone-number verification challenges before issuing a session", async () => {
		let latestPhoneOTP = "";
		const phoneNumberValue = "+351911111111";
		const email = "phone-regression@example.com";
		const { port, stop } = await setupServer({
			plugins: [
				twoFactor({
					skipVerificationOnEnable: true,
					otpOptions: {
						sendOTP() {},
					},
				}),
				phoneNumber({
					async sendOTP({ code }) {
						latestPhoneOTP = code;
					},
				}),
			],
		});

		try {
			const sessionJar: CookieJar = new Map();
			const verificationJar: CookieJar = new Map();
			const challengeJar: CookieJar = new Map();
			const baseURL = `http://localhost:${port}/api/auth`;

			const signUpResponse = await authRequest(
				`${baseURL}/sign-up/email`,
				sessionJar,
				{
					method: "POST",
					body: {
						name: "Phone Regression",
						email,
						password: "password123",
						phoneNumber: phoneNumberValue,
					},
				},
			);
			expect(signUpResponse.status).toBe(200);

			const signInResponse = await authRequest(
				`${baseURL}/sign-in/email`,
				sessionJar,
				{
					method: "POST",
					body: {
						email,
						password: "password123",
					},
				},
			);
			expect(signInResponse.status).toBe(200);

			const sendInitialOTPResponse = await authRequest(
				`${baseURL}/phone-number/send-otp`,
				verificationJar,
				{
					method: "POST",
					body: {
						phoneNumber: phoneNumberValue,
					},
				},
			);
			expect(sendInitialOTPResponse.status).toBe(200);
			expect(latestPhoneOTP).toHaveLength(6);

			const initialVerifyResponse = await authRequest(
				`${baseURL}/phone-number/verify`,
				verificationJar,
				{
					method: "POST",
					body: {
						phoneNumber: phoneNumberValue,
						code: latestPhoneOTP,
					},
				},
			);
			expect(initialVerifyResponse.status).toBe(200);

			const enableResponse = await authRequest(
				`${baseURL}/two-factor/enable`,
				sessionJar,
				{
					method: "POST",
					body: {
						password: "password123",
					},
				},
			);
			expect(enableResponse.status).toBe(200);
			const whoAmI = await readWhoAmI(baseURL, sessionJar);
			expect(whoAmI.session?.user?.email).toBe(email);
			expect(whoAmI.session?.user?.twoFactorEnabled).toBe(true);

			const sendChallengeOTPResponse = await authRequest(
				`${baseURL}/phone-number/send-otp`,
				challengeJar,
				{
					method: "POST",
					body: {
						phoneNumber: phoneNumberValue,
					},
				},
			);
			expect(sendChallengeOTPResponse.status).toBe(200);
			expect(latestPhoneOTP).toHaveLength(6);

			const challengeResponse = await authRequest(
				`${baseURL}/phone-number/verify`,
				challengeJar,
				{
					method: "POST",
					body: {
						phoneNumber: phoneNumberValue,
						code: latestPhoneOTP,
					},
				},
			);
			expect(challengeResponse.status).toBe(200);
			expect(challengeResponse.headers.get("set-auth-token")).toBeNull();
			expect(hasCookie(challengeJar, "better-auth.two_factor")).toBe(true);
			expect(hasCookie(challengeJar, "better-auth.session_token")).toBe(false);
			const challengeWhoAmI = await readWhoAmI(baseURL, challengeJar);
			expect(challengeWhoAmI.session).toBeNull();
		} finally {
			await stop();
		}
	});

	test("email-otp verification challenges before issuing a session", async () => {
		let latestEmailOTP = "";
		const email = "email-otp-regression@example.com";
		const { port, stop } = await setupServer({
			emailVerification: {
				autoSignInAfterVerification: true,
			},
			plugins: [
				twoFactor({
					skipVerificationOnEnable: true,
					otpOptions: {
						sendOTP() {},
					},
				}),
				emailOTP({
					async sendVerificationOTP({ email: targetEmail, otp, type }) {
						if (targetEmail === email && type === "email-verification") {
							latestEmailOTP = otp;
						}
					},
				}),
			],
		});

		try {
			const sessionJar: CookieJar = new Map();
			const challengeJar: CookieJar = new Map();
			const baseURL = `http://localhost:${port}/api/auth`;

			const signUpResponse = await authRequest(
				`${baseURL}/sign-up/email`,
				sessionJar,
				{
					method: "POST",
					body: {
						name: "Email OTP Regression",
						email,
						password: "password123",
					},
				},
			);
			expect(signUpResponse.status).toBe(200);

			const signInResponse = await authRequest(
				`${baseURL}/sign-in/email`,
				sessionJar,
				{
					method: "POST",
					body: {
						email,
						password: "password123",
					},
				},
			);
			expect(signInResponse.status).toBe(200);

			const enableResponse = await authRequest(
				`${baseURL}/two-factor/enable`,
				sessionJar,
				{
					method: "POST",
					body: {
						password: "password123",
					},
				},
			);
			expect(enableResponse.status).toBe(200);
			const whoAmI = await readWhoAmI(baseURL, sessionJar);
			expect(whoAmI.session?.user?.email).toBe(email);
			expect(whoAmI.session?.user?.twoFactorEnabled).toBe(true);

			const sendVerificationOTPResponse = await authRequest(
				`${baseURL}/email-otp/send-verification-otp`,
				challengeJar,
				{
					method: "POST",
					body: {
						email,
						type: "email-verification",
					},
				},
			);
			expect(sendVerificationOTPResponse.status).toBe(200);
			expect(latestEmailOTP).toHaveLength(6);

			const challengeResponse = await authRequest(
				`${baseURL}/email-otp/verify-email`,
				challengeJar,
				{
					method: "POST",
					body: {
						email,
						otp: latestEmailOTP,
					},
				},
			);
			expect(challengeResponse.status).toBe(200);
			expect(challengeResponse.headers.get("set-auth-token")).toBeNull();
			expect(hasCookie(challengeJar, "better-auth.two_factor")).toBe(true);
			expect(hasCookie(challengeJar, "better-auth.session_token")).toBe(false);
			const challengeWhoAmI = await readWhoAmI(baseURL, challengeJar);
			expect(challengeWhoAmI.session).toBeNull();
		} finally {
			await stop();
		}
	});

	test("bearer transport stays locked until two-factor completes", async () => {
		let latestTwoFactorOTP = "";
		const { port, stop } = await setupServer({
			plugins: [
				bearer(),
				twoFactor({
					skipVerificationOnEnable: true,
					otpOptions: {
						sendOTP({ otp }) {
							latestTwoFactorOTP = otp;
						},
					},
				}),
			],
		});

		try {
			const sessionJar: CookieJar = new Map();
			const challengeJar: CookieJar = new Map();
			const baseURL = `http://localhost:${port}/api/auth`;

			const signInResponse = await authRequest(
				`${baseURL}/sign-in/email`,
				sessionJar,
				{
					method: "POST",
					body: {
						email: "test@test.com",
						password: "password123",
					},
				},
			);
			expect(signInResponse.status).toBe(200);
			expect(signInResponse.headers.get("set-auth-token")).toBeTruthy();

			const enableResponse = await authRequest(
				`${baseURL}/two-factor/enable`,
				sessionJar,
				{
					method: "POST",
					body: {
						password: "password123",
					},
				},
			);
			expect(enableResponse.status).toBe(200);

			const challengeResponse = await authRequest(
				`${baseURL}/sign-in/email`,
				challengeJar,
				{
					method: "POST",
					body: {
						email: "test@test.com",
						password: "password123",
					},
				},
			);
			expect(challengeResponse.status).toBe(200);
			expect(challengeResponse.headers.get("set-auth-token")).toBeNull();
			expect(hasCookie(challengeJar, "better-auth.session_token")).toBe(false);
			expect(hasCookie(challengeJar, "better-auth.two_factor")).toBe(true);

			const sendOtpResponse = await authRequest(
				`${baseURL}/two-factor/send-otp`,
				challengeJar,
				{
					method: "POST",
					body: {},
				},
			);
			expect(sendOtpResponse.status).toBe(200);
			expect(latestTwoFactorOTP).toHaveLength(6);

			const verifyResponse = await authRequest(
				`${baseURL}/two-factor/verify-otp`,
				challengeJar,
				{
					method: "POST",
					body: {
						code: latestTwoFactorOTP,
					},
				},
			);
			expect(verifyResponse.status).toBe(200);

			const authToken = verifyResponse.headers.get("set-auth-token");
			expect(authToken).toBeTruthy();
			expect(
				verifyResponse.headers.get("access-control-expose-headers"),
			).toContain("set-auth-token");

			const bearerSession = await readWhoAmI(baseURL, new Map(), {
				authorization: `Bearer ${authToken}`,
			});
			expect(bearerSession.session?.user?.email).toBe("test@test.com");
		} finally {
			await stop();
		}
	});

	test("one-time-token verification rehydrates a session without reopening two-factor", async () => {
		const { port, stop } = await setupServer({
			plugins: [
				oneTimeToken(),
				twoFactor({
					skipVerificationOnEnable: true,
					otpOptions: {
						sendOTP() {},
					},
				}),
			],
		});

		try {
			const sessionJar: CookieJar = new Map();
			const transferJar: CookieJar = new Map();
			const baseURL = `http://localhost:${port}/api/auth`;

			const signInResponse = await authRequest(
				`${baseURL}/sign-in/email`,
				sessionJar,
				{
					method: "POST",
					body: {
						email: "test@test.com",
						password: "password123",
					},
				},
			);
			expect(signInResponse.status).toBe(200);

			const enableResponse = await authRequest(
				`${baseURL}/two-factor/enable`,
				sessionJar,
				{
					method: "POST",
					body: {
						password: "password123",
					},
				},
			);
			expect(enableResponse.status).toBe(200);

			const generateResponse = await authRequest(
				`${baseURL}/one-time-token/generate`,
				sessionJar,
				{
					method: "GET",
				},
			);
			expect(generateResponse.status).toBe(200);

			const generatedPayload = (await generateResponse.json()) as {
				token?: string;
			};
			expect(generatedPayload.token).toBeTruthy();

			const verifyResponse = await authRequest(
				`${baseURL}/one-time-token/verify`,
				transferJar,
				{
					method: "POST",
					body: {
						token: generatedPayload.token,
					},
				},
			);
			expect(verifyResponse.status).toBe(200);
			expect(hasCookie(transferJar, "better-auth.session_token")).toBe(true);
			expect(hasCookie(transferJar, "better-auth.two_factor")).toBe(false);

			const transferredSession = await readWhoAmI(baseURL, transferJar);
			expect(transferredSession.session?.user?.email).toBe("test@test.com");
		} finally {
			await stop();
		}
	});

	test("device authorization remains a continuation flow for two-factor enabled users", async () => {
		const { port, stop } = await setupServer({
			plugins: [
				deviceAuthorization({
					expiresIn: "5min",
					interval: "1s",
				}),
				twoFactor({
					skipVerificationOnEnable: true,
					otpOptions: {
						sendOTP() {},
					},
				}),
			],
		});

		try {
			const sessionJar: CookieJar = new Map();
			const deviceJar: CookieJar = new Map();
			const baseURL = `http://localhost:${port}/api/auth`;

			const signInResponse = await authRequest(
				`${baseURL}/sign-in/email`,
				sessionJar,
				{
					method: "POST",
					body: {
						email: "test@test.com",
						password: "password123",
					},
				},
			);
			expect(signInResponse.status).toBe(200);

			const enableResponse = await authRequest(
				`${baseURL}/two-factor/enable`,
				sessionJar,
				{
					method: "POST",
					body: {
						password: "password123",
					},
				},
			);
			expect(enableResponse.status).toBe(200);

			const deviceCodeResponse = await authRequest(
				`${baseURL}/device/code`,
				deviceJar,
				{
					method: "POST",
					body: {
						client_id: "integration-device-client",
					},
				},
			);
			expect(deviceCodeResponse.status).toBe(200);

			const deviceCodePayload = (await deviceCodeResponse.json()) as {
				device_code: string;
				user_code: string;
			};
			expect(deviceCodePayload.device_code).toBeTruthy();
			expect(deviceCodePayload.user_code).toBeTruthy();

			const approveResponse = await authRequest(
				`${baseURL}/device/approve`,
				sessionJar,
				{
					method: "POST",
					body: {
						userCode: deviceCodePayload.user_code,
					},
				},
			);
			expect(approveResponse.status).toBe(200);

			const tokenResponse = await authRequest(
				`${baseURL}/device/token`,
				deviceJar,
				{
					method: "POST",
					body: {
						grant_type: "urn:ietf:params:oauth:grant-type:device_code",
						device_code: deviceCodePayload.device_code,
						client_id: "integration-device-client",
					},
				},
			);
			expect(tokenResponse.status).toBe(200);
			expect(hasCookie(deviceJar, "better-auth.two_factor")).toBe(false);

			const tokenPayload = (await tokenResponse.json()) as {
				access_token?: string;
				token_type?: string;
				expires_in?: number;
			};
			expect(tokenPayload.access_token).toBeTruthy();
			expect(tokenPayload.token_type).toBe("Bearer");
			expect(tokenPayload.expires_in).toBeGreaterThan(0);
		} finally {
			await stop();
		}
	});

	test("generic oauth callback challenges before issuing a session", async () => {
		const provider = new OAuth2Server();
		await provider.issuer.keys.generate("RS256");
		await provider.start();
		provider.service.on("beforeUserinfo", (userInfoResponse) => {
			userInfoResponse.body = {
				email: "test@test.com",
				name: "OAuth Regression User",
				sub: "oauth-regression-user",
				picture: "https://test.com/oauth-regression.png",
				email_verified: true,
			};
			userInfoResponse.statusCode = 200;
		});

		try {
			const { port, stop } = await setupServer({
				plugins: [
					twoFactor({
						skipVerificationOnEnable: true,
						otpOptions: {
							sendOTP() {},
						},
					}),
					genericOAuth({
						config: [
							{
								providerId: "test-provider",
								discoveryUrl: `${provider.issuer.url}/.well-known/openid-configuration`,
								clientId: "test-client-id",
								clientSecret: "test-client-secret",
								pkce: true,
							},
						],
					}),
				],
			});

			try {
				const sessionJar: CookieJar = new Map();
				const oauthJar: CookieJar = new Map();
				const baseURL = `http://localhost:${port}/api/auth`;

				const signInResponse = await authRequest(
					`${baseURL}/sign-in/email`,
					sessionJar,
					{
						method: "POST",
						body: {
							email: "test@test.com",
							password: "password123",
						},
					},
				);
				expect(signInResponse.status).toBe(200);

				const enableResponse = await authRequest(
					`${baseURL}/two-factor/enable`,
					sessionJar,
					{
						method: "POST",
						body: {
							password: "password123",
						},
					},
				);
				expect(enableResponse.status).toBe(200);

				const oauthStartResponse = await authRequest(
					`${baseURL}/sign-in/oauth2`,
					oauthJar,
					{
						method: "POST",
						body: {
							providerId: "test-provider",
							callbackURL: "/dashboard",
						},
					},
				);
				expect(oauthStartResponse.status).toBe(200);

				const oauthStartPayload = (await oauthStartResponse.json()) as {
					url?: string;
				};
				expect(oauthStartPayload.url).toBeTruthy();

				const callbackURL = await followOAuthProviderRedirect(
					oauthStartPayload.url!,
					port,
				);
				const callbackResponse = await authRequest(callbackURL, oauthJar, {
					method: "GET",
					redirect: "manual",
				});
				expect(callbackResponse.status).toBe(302);

				const redirectLocation = callbackResponse.headers.get("location");
				const redirectURL = new URL(redirectLocation!, "http://localhost:3000");
				expect(redirectURL.searchParams.get("challenge")).toBe("two-factor");
				expect(
					(redirectURL.searchParams.get("methods") ?? "").split(","),
				).toContain("otp");
				expect(hasCookie(oauthJar, "better-auth.two_factor")).toBe(true);
				expect(hasCookie(oauthJar, "better-auth.session_token")).toBe(false);

				const challengeWhoAmI = await readWhoAmI(baseURL, oauthJar);
				expect(challengeWhoAmI.session).toBeNull();
			} finally {
				await stop();
			}
		} finally {
			await provider.stop().catch(() => {});
		}
	});

	test("generic oauth callback preserves pending domain assignment through two-factor verification", async () => {
		let otp = "";
		const provider = new OAuth2Server();
		await provider.issuer.keys.generate("RS256");
		await provider.start();
		provider.service.on("beforeUserinfo", (userInfoResponse) => {
			userInfoResponse.body = {
				email: "oauth-domain@test.com",
				name: "OAuth Domain User",
				sub: "oauth-domain-user",
				picture: "https://test.com/oauth-domain.png",
				email_verified: true,
			};
			userInfoResponse.statusCode = 200;
		});

		try {
			const { port, stop } = await setupServer({
				account: {
					accountLinking: {
						enabled: true,
						trustedProviders: ["test-provider"],
					},
				},
				plugins: [
					sso({
						domainVerification: {
							enabled: true,
						},
					}),
					organization(),
					twoFactor({
						skipVerificationOnEnable: true,
						otpOptions: {
							sendOTP({ otp: nextOtp }) {
								otp = nextOtp;
							},
						},
					}),
					genericOAuth({
						config: [
							{
								providerId: "test-provider",
								discoveryUrl: `${provider.issuer.url}/.well-known/openid-configuration`,
								clientId: "test-client-id",
								clientSecret: "test-client-secret",
								pkce: true,
							},
						],
					}),
				],
			});

			try {
				const adminJar: CookieJar = new Map();
				const userJar: CookieJar = new Map();
				const oauthJar: CookieJar = new Map();
				const baseAppURL = `http://localhost:${port}`;
				const baseURL = `${baseAppURL}/api/auth`;

				const adminSignInResponse = await authRequest(
					`${baseURL}/sign-in/email`,
					adminJar,
					{
						method: "POST",
						body: {
							email: "test@test.com",
							password: "password123",
						},
					},
				);
				expect(adminSignInResponse.status).toBe(200);

				const createOrganizationResponse = await authRequest(
					`${baseURL}/organization/create`,
					adminJar,
					{
						method: "POST",
						body: {
							name: "OAuth Org",
							slug: "oauth-org",
						},
					},
				);
				expect(createOrganizationResponse.status).toBe(200);
				const organizationPayload =
					(await createOrganizationResponse.json()) as { id: string };

				const registerProviderResponse = await authRequest(
					`${baseURL}/sso/register`,
					adminJar,
					{
						method: "POST",
						body: {
							issuer: provider.issuer.url!,
							domain: "test.com",
							providerId: "test-provider-domain",
							organizationId: organizationPayload.id,
							oidcConfig: {
								clientId: "domain-assignment-client",
								clientSecret: "domain-assignment-secret",
								mapping: {
									id: "sub",
									email: "email",
									emailVerified: "email_verified",
									name: "name",
									image: "picture",
								},
							},
						},
					},
				);
				expect(registerProviderResponse.status).toBe(200);

				const verifyDomainResponse = await authRequest(
					`${baseAppURL}/debug/sso-provider/verify-domain?providerId=test-provider-domain`,
					adminJar,
					{
						method: "POST",
					},
				);
				expect(verifyDomainResponse.status).toBe(204);

				const signUpResponse = await authRequest(
					`${baseURL}/sign-up/email`,
					userJar,
					{
						method: "POST",
						body: {
							name: "OAuth Domain User",
							email: "oauth-domain@test.com",
							password: "password123",
						},
					},
				);
				expect(signUpResponse.status).toBe(200);

				const enableResponse = await authRequest(
					`${baseURL}/two-factor/enable`,
					userJar,
					{
						method: "POST",
						body: {
							password: "password123",
						},
					},
				);
				expect(enableResponse.status).toBe(200);

				const oauthStartResponse = await authRequest(
					`${baseURL}/sign-in/oauth2`,
					oauthJar,
					{
						method: "POST",
						body: {
							providerId: "test-provider",
							callbackURL: "/dashboard",
						},
					},
				);
				expect(oauthStartResponse.status).toBe(200);

				const oauthStartPayload = (await oauthStartResponse.json()) as {
					url?: string;
				};
				expect(oauthStartPayload.url).toBeTruthy();

				const callbackURL = await followOAuthProviderRedirect(
					oauthStartPayload.url!,
					port,
				);
				const callbackResponse = await authRequest(callbackURL, oauthJar, {
					method: "GET",
					redirect: "manual",
				});
				expect(callbackResponse.status).toBe(302);

				const redirectLocation = callbackResponse.headers.get("location");
				const redirectURL = new URL(redirectLocation!, "http://localhost:3000");
				expect(redirectURL.searchParams.get("challenge")).toBe("two-factor");
				expect(redirectURL.searchParams.get("attemptId")).toBeNull();
				expect(hasCookie(oauthJar, "better-auth.two_factor")).toBe(true);
				expect(hasCookie(oauthJar, "better-auth.session_token")).toBe(false);

				const beforeMembers = await readMemberCount(
					baseAppURL,
					"oauth-domain@test.com",
				);
				expect(beforeMembers.count).toBe(0);

				const sendOtpResponse = await authRequest(
					`${baseURL}/two-factor/send-otp`,
					oauthJar,
					{
						method: "POST",
						body: {},
					},
				);
				expect(sendOtpResponse.status).toBe(200);
				expect(otp).toHaveLength(6);

				const verifyOtpResponse = await authRequest(
					`${baseURL}/two-factor/verify-otp`,
					oauthJar,
					{
						method: "POST",
						body: {
							code: otp,
						},
					},
				);
				expect(verifyOtpResponse.status).toBe(200);

				const afterMembers = await readMemberCount(
					baseAppURL,
					"oauth-domain@test.com",
				);
				expect(afterMembers.count).toBe(1);
			} finally {
				await stop();
			}
		} finally {
			await provider.stop().catch(() => {});
		}
	});

	test("sso callback challenges before issuing a session", async () => {
		const provider = new OAuth2Server();
		provider.service.on("beforeUserinfo", (userInfoResponse) => {
			userInfoResponse.body = {
				email: "sso-regression@test.com",
				name: "SSO Regression User",
				sub: "sso-regression-user",
				picture: "https://test.com/sso-regression.png",
				email_verified: true,
			};
			userInfoResponse.statusCode = 200;
		});
		provider.service.on("beforeTokenSigning", (token) => {
			token.payload.email = "sso-regression@test.com";
			token.payload.email_verified = true;
			token.payload.name = "SSO Regression User";
			token.payload.picture = "https://test.com/sso-regression.png";
		});
		await provider.issuer.keys.generate("RS256");
		await provider.start();

		try {
			const { port, stop } = await setupServer({
				trustedOrigins: ["http://localhost:*", provider.issuer.url!],
				plugins: [
					sso(),
					twoFactor({
						allowPasswordless: true,
						skipVerificationOnEnable: true,
						otpOptions: {
							sendOTP() {},
						},
					}),
				],
			});

			try {
				const sessionJar: CookieJar = new Map();
				const linkJar: CookieJar = new Map();
				const ssoJar: CookieJar = new Map();
				const baseURL = `http://localhost:${port}/api/auth`;

				const signInResponse = await authRequest(
					`${baseURL}/sign-in/email`,
					sessionJar,
					{
						method: "POST",
						body: {
							email: "test@test.com",
							password: "password123",
						},
					},
				);
				expect(signInResponse.status).toBe(200);

				const registerProviderResponse = await authRequest(
					`${baseURL}/sso/register`,
					sessionJar,
					{
						method: "POST",
						body: {
							issuer: provider.issuer.url!,
							domain: "test.com",
							providerId: "test-sso-provider",
							oidcConfig: {
								clientId: "test-client-id",
								clientSecret: "test-client-secret",
								authorizationEndpoint: `${provider.issuer.url}/authorize`,
								tokenEndpoint: `${provider.issuer.url}/token`,
								jwksEndpoint: `${provider.issuer.url}/jwks`,
								discoveryEndpoint: `${provider.issuer.url}/.well-known/openid-configuration`,
								mapping: {
									id: "sub",
									email: "email",
									emailVerified: "email_verified",
									name: "name",
									image: "picture",
								},
							},
						},
					},
				);
				expect(registerProviderResponse.status).toBe(200);

				const initialSsoResponse = await authRequest(
					`${baseURL}/sign-in/sso`,
					linkJar,
					{
						method: "POST",
						body: {
							email: "sso-regression@test.com",
							callbackURL: "/dashboard",
						},
					},
				);
				expect(initialSsoResponse.status).toBe(200);

				const initialSsoPayload = (await initialSsoResponse.json()) as {
					url?: string;
				};
				expect(initialSsoPayload.url).toBeTruthy();

				const initialCallbackURL = await followOAuthProviderRedirect(
					initialSsoPayload.url!,
					port,
				);
				const initialCallbackResponse = await authRequest(
					initialCallbackURL,
					linkJar,
					{
						method: "GET",
						redirect: "manual",
					},
				);
				expect(initialCallbackResponse.status).toBe(302);
				expect(initialCallbackResponse.headers.get("location")).toContain(
					"/dashboard",
				);
				expect(hasCookie(linkJar, "better-auth.session_token")).toBe(true);

				const enableTwoFactorResponse = await authRequest(
					`${baseURL}/two-factor/enable`,
					linkJar,
					{
						method: "POST",
						body: {},
					},
				);
				expect(enableTwoFactorResponse.status).toBe(200);

				const ssoStartResponse = await authRequest(
					`${baseURL}/sign-in/sso`,
					ssoJar,
					{
						method: "POST",
						body: {
							email: "sso-regression@test.com",
							callbackURL: "/dashboard",
						},
					},
				);
				expect(ssoStartResponse.status).toBe(200);

				const ssoStartPayload = (await ssoStartResponse.json()) as {
					url?: string;
				};
				expect(ssoStartPayload.url).toBeTruthy();

				const callbackURL = await followOAuthProviderRedirect(
					ssoStartPayload.url!,
					port,
				);
				const callbackResponse = await authRequest(callbackURL, ssoJar, {
					method: "GET",
					redirect: "manual",
				});
				expect(callbackResponse.status).toBe(302);

				const redirectLocation = callbackResponse.headers.get("location");
				const redirectURL = new URL(redirectLocation!, "http://localhost:3000");
				expect(redirectURL.searchParams.get("challenge")).toBe("two-factor");
				expect(
					(redirectURL.searchParams.get("methods") ?? "").split(","),
				).toContain("otp");
				expect(hasCookie(ssoJar, "better-auth.two_factor")).toBe(true);
				expect(hasCookie(ssoJar, "better-auth.session_token")).toBe(false);

				const challengeWhoAmI = await readWhoAmI(baseURL, ssoJar);
				expect(challengeWhoAmI.session).toBeNull();
			} finally {
				await stop();
			}
		} finally {
			await provider.stop().catch(() => {});
		}
	});

	test("siwe verification challenges before issuing a session", async () => {
		let otpCode = "";
		const walletAddress = "0x1234567890abcdef1234567890abcdef12345678";
		const chainId = 1;

		const { port, stop } = await setupServer({
			plugins: [
				siwe({
					domain: "http://localhost:3000",
					async getNonce() {
						return "A1b2C3d4E5f6G7h8J";
					},
					async verifyMessage({ message, signature }) {
						return (
							message === "valid_message" && signature === "valid_signature"
						);
					},
				}),
				twoFactor({
					allowPasswordless: true,
					skipVerificationOnEnable: true,
					otpOptions: {
						sendOTP({ otp }) {
							otpCode = otp;
						},
					},
				}),
			],
		});

		try {
			const bootstrapJar: CookieJar = new Map();
			const challengeJar: CookieJar = new Map();
			const baseURL = `http://localhost:${port}/api/auth`;

			const nonceResponse = await authRequest(
				`${baseURL}/siwe/nonce`,
				bootstrapJar,
				{
					method: "POST",
					body: {
						walletAddress,
						chainId,
					},
				},
			);
			expect(nonceResponse.status).toBe(200);

			const bootstrapSignInResponse = await authRequest(
				`${baseURL}/siwe/verify`,
				bootstrapJar,
				{
					method: "POST",
					body: {
						message: "valid_message",
						signature: "valid_signature",
						walletAddress,
						chainId,
					},
				},
			);
			expect(bootstrapSignInResponse.status).toBe(200);
			expect(hasCookie(bootstrapJar, "better-auth.session_token")).toBe(true);

			const enableResponse = await authRequest(
				`${baseURL}/two-factor/enable`,
				bootstrapJar,
				{
					method: "POST",
					body: {},
				},
			);
			expect(enableResponse.status).toBe(200);

			const signOutResponse = await authRequest(
				`${baseURL}/sign-out`,
				bootstrapJar,
				{
					method: "POST",
					body: {},
				},
			);
			expect(signOutResponse.status).toBe(200);

			const challengeNonceResponse = await authRequest(
				`${baseURL}/siwe/nonce`,
				challengeJar,
				{
					method: "POST",
					body: {
						walletAddress,
						chainId,
					},
				},
			);
			expect(challengeNonceResponse.status).toBe(200);

			const challengeResponse = await authRequest(
				`${baseURL}/siwe/verify`,
				challengeJar,
				{
					method: "POST",
					body: {
						message: "valid_message",
						signature: "valid_signature",
						walletAddress,
						chainId,
					},
				},
			);
			expect(challengeResponse.status).toBe(200);

			const challengePayload = (await challengeResponse.json()) as {
				kind?: "challenge";
				challenge?: {
					kind: "two-factor";
					attemptId: string;
					availableMethods: string[];
				};
			};
			expect(challengePayload.kind).toBe("challenge");
			expect(challengePayload.challenge?.kind).toBe("two-factor");
			expect(challengePayload.challenge?.attemptId).toBeTruthy();
			expect(challengePayload.challenge?.availableMethods).toContain("otp");
			expect(hasCookie(challengeJar, "better-auth.two_factor")).toBe(true);
			expect(hasCookie(challengeJar, "better-auth.session_token")).toBe(false);

			const challengeWhoAmI = await readWhoAmI(baseURL, challengeJar);
			expect(challengeWhoAmI.session).toBeNull();

			const sendOtpResponse = await authRequest(
				`${baseURL}/two-factor/send-otp`,
				challengeJar,
				{
					method: "POST",
					body: {
						attemptId: challengePayload.challenge?.attemptId,
					},
				},
			);
			expect(sendOtpResponse.status).toBe(200);
			expect(otpCode).toHaveLength(6);

			const verifyOtpResponse = await authRequest(
				`${baseURL}/two-factor/verify-otp`,
				challengeJar,
				{
					method: "POST",
					body: {
						attemptId: challengePayload.challenge?.attemptId,
						code: otpCode,
					},
				},
			);
			expect(verifyOtpResponse.status).toBe(200);
			expect(hasCookie(challengeJar, "better-auth.session_token")).toBe(true);
			expect(hasCookie(challengeJar, "better-auth.two_factor")).toBe(false);
		} finally {
			await stop();
		}
	});
});
