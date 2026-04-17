import { expect, test } from "@playwright/test";
import type { BetterAuthOptions } from "better-auth";
import { lastLoginMethod, magicLink, twoFactor } from "better-auth/plugins";
import { setupServer } from "./utils";

type CookieJar = Map<string, string>;

type ChallengeResponse = {
	kind: "challenge";
	challenge: {
		kind: "two-factor";
		attemptId: string;
		availableMethods: string[];
	};
};

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

function getCookieValue(jar: CookieJar, baseName: string) {
	for (const [name, value] of jar.entries()) {
		if (name === baseName || name.endsWith(baseName)) {
			return value;
		}
	}
	return undefined;
}

function resolveServerURL(url: string, port: number) {
	const resolved = new URL(url);
	resolved.protocol = "http:";
	resolved.hostname = "localhost";
	resolved.port = String(port);
	return resolved.toString();
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

async function readWhoAmI(baseURL: string, jar: CookieJar) {
	const response = await authRequest(
		baseURL.replace("/api/auth", "/whoami"),
		jar,
	);
	return (await response.json()) as {
		session: {
			user: {
				email: string;
				twoFactorEnabled?: boolean;
				lastLoginMethod?: string | null;
			} | null;
		} | null;
	};
}

async function signInWithEmail(
	baseURL: string,
	jar: CookieJar,
	email: string,
	password: string,
) {
	return authRequest(`${baseURL}/sign-in/email`, jar, {
		method: "POST",
		body: {
			email,
			password,
		},
	});
}

async function enableTwoFactor(
	baseURL: string,
	jar: CookieJar,
	password: string,
) {
	const response = await authRequest(`${baseURL}/two-factor/enable`, jar, {
		method: "POST",
		body: {
			password,
		},
	});
	expect(response.status).toBe(200);
}

async function sendTwoFactorOtp(
	baseURL: string,
	jar: CookieJar,
	attemptId?: string,
) {
	return authRequest(`${baseURL}/two-factor/send-otp`, jar, {
		method: "POST",
		body: attemptId ? { attemptId } : {},
	});
}

async function verifyTwoFactorOtp(
	baseURL: string,
	jar: CookieJar,
	code: string,
	attemptId?: string,
) {
	return authRequest(`${baseURL}/two-factor/verify-otp`, jar, {
		method: "POST",
		body: attemptId ? { code, attemptId } : { code },
	});
}

async function signInWithMagicLink(
	baseURL: string,
	jar: CookieJar,
	email: string,
	callbackURL: string,
) {
	return authRequest(`${baseURL}/sign-in/magic-link`, jar, {
		method: "POST",
		body: {
			email,
			callbackURL,
		},
	});
}

function expectChallengeResponse(
	value: unknown,
): asserts value is ChallengeResponse {
	expect(value).toBeTruthy();
	expect(typeof value).toBe("object");
	expect(value).not.toBeNull();
	const envelope = value as Record<string, unknown>;
	expect(envelope.kind).toBe("challenge");
	expect(envelope.challenge).toBeTruthy();
	const challenge = envelope.challenge as Record<string, unknown>;
	expect(challenge.kind).toBe("two-factor");
	expect(typeof challenge.attemptId).toBe("string");
	expect(Array.isArray(challenge.availableMethods)).toBe(true);
}

function twoFactorConfig(
	sendOTP: (input: { email: string | null; otp: string }) => void,
) {
	return twoFactor({
		skipVerificationOnEnable: true,
		otpOptions: {
			sendOTP({ user, otp }) {
				sendOTP({
					email: user.email ?? null,
					otp,
				});
			},
		},
	});
}

test.describe("two factor user journeys", () => {
	test("user can finish a paused magic-link sign-in after the redirect challenge", async () => {
		let magicLinkURL = "";
		let otpCode = "";
		const { port, stop } = await setupServer({
			plugins: [
				twoFactorConfig(({ otp }) => {
					otpCode = otp;
				}),
				magicLink({
					async sendMagicLink({ url }) {
						magicLinkURL = url;
					},
				}),
			],
		});

		try {
			const baseURL = `http://localhost:${port}/api/auth`;
			const activeJar: CookieJar = new Map();
			const freshJar: CookieJar = new Map();

			const signInResponse = await signInWithEmail(
				baseURL,
				activeJar,
				"test@test.com",
				"password123",
			);
			expect(signInResponse.status).toBe(200);

			await enableTwoFactor(baseURL, activeJar, "password123");

			const signOutResponse = await authRequest(
				`${baseURL}/sign-out`,
				activeJar,
				{
					method: "POST",
				},
			);
			expect(signOutResponse.status).toBe(200);
			expect(hasCookie(activeJar, "better-auth.session_token")).toBe(false);

			const magicLinkStart = await signInWithMagicLink(
				baseURL,
				freshJar,
				"test@test.com",
				"/dashboard",
			);
			expect(magicLinkStart.status).toBe(200);
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

			const location = verifyResponse.headers.get("location");
			expect(location).toBeTruthy();
			const redirectURL = new URL(location!, "http://localhost:3000");
			expect(redirectURL.searchParams.get("challenge")).toBe("two-factor");
			expect(redirectURL.searchParams.get("attemptId")).toBeNull();
			expect(hasCookie(freshJar, "better-auth.session_token")).toBe(false);
			expect(hasCookie(freshJar, "better-auth.two_factor")).toBe(true);

			const sendOtpResponse = await sendTwoFactorOtp(baseURL, freshJar);
			expect(sendOtpResponse.status).toBe(200);
			expect(otpCode).toHaveLength(6);

			const verifyOtpResponse = await verifyTwoFactorOtp(
				baseURL,
				freshJar,
				otpCode,
			);
			expect(verifyOtpResponse.status).toBe(200);
			expect(hasCookie(freshJar, "better-auth.session_token")).toBe(true);
			expect(hasCookie(freshJar, "better-auth.two_factor")).toBe(false);

			const whoAmI = await readWhoAmI(baseURL, freshJar);
			expect(whoAmI.session?.user?.email).toBe("test@test.com");
		} finally {
			await stop();
		}
	});

	test("user can keep using account security actions while another login is paused", async () => {
		const sentOtps: Array<{ email: string | null; otp: string }> = [];
		const overrides: Partial<BetterAuthOptions> = {
			plugins: [
				twoFactorConfig((input) => {
					sentOtps.push(input);
				}),
			],
		};
		const { port, stop } = await setupServer(overrides, {
			disableTestUser: true,
		});

		try {
			const baseURL = `http://localhost:${port}/api/auth`;
			const browserJar: CookieJar = new Map();
			const pendingSetupJar: CookieJar = new Map();

			const createUser = async (email: string) => {
				const signUpResponse = await authRequest(
					`${baseURL}/sign-up/email`,
					new Map(),
					{
						method: "POST",
						body: {
							name: email.split("@")[0],
							email,
							password: "password123",
						},
					},
				);
				expect(signUpResponse.status).toBe(200);
			};

			await createUser("active-user@test.com");
			await createUser("pending-user@test.com");

			const pendingSetupSignIn = await signInWithEmail(
				baseURL,
				pendingSetupJar,
				"pending-user@test.com",
				"password123",
			);
			expect(pendingSetupSignIn.status).toBe(200);
			await enableTwoFactor(baseURL, pendingSetupJar, "password123");
			const pendingSetupSignOut = await authRequest(
				`${baseURL}/sign-out`,
				pendingSetupJar,
				{
					method: "POST",
				},
			);
			expect(pendingSetupSignOut.status).toBe(200);

			const activeSignIn = await signInWithEmail(
				baseURL,
				browserJar,
				"active-user@test.com",
				"password123",
			);
			expect(activeSignIn.status).toBe(200);
			await enableTwoFactor(baseURL, browserJar, "password123");

			const pendingSignIn = await signInWithEmail(
				baseURL,
				browserJar,
				"pending-user@test.com",
				"password123",
			);
			expect(pendingSignIn.status).toBe(200);
			const pendingChallenge =
				(await pendingSignIn.json()) as ChallengeResponse;
			expectChallengeResponse(pendingChallenge);
			expect(hasCookie(browserJar, "better-auth.session_token")).toBe(true);
			expect(hasCookie(browserJar, "better-auth.two_factor")).toBe(true);

			sentOtps.length = 0;
			const settingsOtpResponse = await sendTwoFactorOtp(baseURL, browserJar);
			expect(settingsOtpResponse.status).toBe(200);
			expect(sentOtps.at(-1)?.email).toBe("active-user@test.com");

			const challengeOtpResponse = await sendTwoFactorOtp(
				baseURL,
				browserJar,
				pendingChallenge.challenge.attemptId,
			);
			expect(challengeOtpResponse.status).toBe(200);
			expect(sentOtps.at(-1)?.email).toBe("pending-user@test.com");

			const activeSession = await readWhoAmI(baseURL, browserJar);
			expect(activeSession.session?.user?.email).toBe("active-user@test.com");

			const pendingOtp = sentOtps.at(-1)?.otp;
			expect(pendingOtp).toBeTruthy();
			const verifyPendingResponse = await verifyTwoFactorOtp(
				baseURL,
				browserJar,
				pendingOtp!,
				pendingChallenge.challenge.attemptId,
			);
			expect(verifyPendingResponse.status).toBe(200);

			const finalizedSession = await readWhoAmI(baseURL, browserJar);
			expect(finalizedSession.session?.user?.email).toBe(
				"pending-user@test.com",
			);
		} finally {
			await stop();
		}
	});

	test("user can complete an older paused login even after starting a newer one", async () => {
		let magicLinkURL = "";
		const sentOtps: Array<{ email: string | null; otp: string }> = [];
		const { port, stop } = await setupServer({
			plugins: [
				lastLoginMethod({
					storeInDatabase: true,
				}),
				twoFactorConfig((input) => {
					sentOtps.push(input);
				}),
				magicLink({
					async sendMagicLink({ url }) {
						magicLinkURL = url;
					},
				}),
			],
		});

		try {
			const baseURL = `http://localhost:${port}/api/auth`;
			const browserJar: CookieJar = new Map();

			const signInResponse = await signInWithEmail(
				baseURL,
				browserJar,
				"test@test.com",
				"password123",
			);
			expect(signInResponse.status).toBe(200);
			await enableTwoFactor(baseURL, browserJar, "password123");

			const signOutResponse = await authRequest(
				`${baseURL}/sign-out`,
				browserJar,
				{
					method: "POST",
				},
			);
			expect(signOutResponse.status).toBe(200);

			const firstChallengeResponse = await signInWithEmail(
				baseURL,
				browserJar,
				"test@test.com",
				"password123",
			);
			expect(firstChallengeResponse.status).toBe(200);
			const firstChallenge =
				(await firstChallengeResponse.json()) as ChallengeResponse;
			expectChallengeResponse(firstChallenge);

			sentOtps.length = 0;
			const firstOtpResponse = await sendTwoFactorOtp(
				baseURL,
				browserJar,
				firstChallenge.challenge.attemptId,
			);
			expect(firstOtpResponse.status).toBe(200);
			const firstOtp = sentOtps.at(-1)?.otp;
			expect(firstOtp).toBeTruthy();

			const magicLinkStart = await signInWithMagicLink(
				baseURL,
				browserJar,
				"test@test.com",
				"/dashboard",
			);
			expect(magicLinkStart.status).toBe(200);

			const firstTwoFactorCookie = getCookieValue(
				browserJar,
				"better-auth.two_factor",
			);
			expect(firstTwoFactorCookie).toBeTruthy();

			const secondChallengeRedirect = await authRequest(
				resolveServerURL(magicLinkURL, port),
				browserJar,
				{
					method: "GET",
					redirect: "manual",
				},
			);
			expect(secondChallengeRedirect.status).toBe(302);
			const secondLocation = secondChallengeRedirect.headers.get("location");
			expect(secondLocation).toBeTruthy();
			expect(
				new URL(secondLocation!, "http://localhost:3000").searchParams.get(
					"attemptId",
				),
			).toBeNull();
			// A fresh challenge rotates the signed `better-auth.two_factor` cookie;
			// comparing the cookie value is how we assert the magic-link flow
			// issued a new attempt instead of reusing the paused password one.
			const secondTwoFactorCookie = getCookieValue(
				browserJar,
				"better-auth.two_factor",
			);
			expect(secondTwoFactorCookie).toBeTruthy();
			expect(secondTwoFactorCookie).not.toBe(firstTwoFactorCookie);

			const verifyResponse = await verifyTwoFactorOtp(
				baseURL,
				browserJar,
				firstOtp!,
				firstChallenge.challenge.attemptId,
			);
			expect(verifyResponse.status).toBe(200);

			const whoAmI = await readWhoAmI(baseURL, browserJar);
			expect(whoAmI.session?.user?.email).toBe("test@test.com");
			expect(whoAmI.session?.user?.lastLoginMethod).toBe("email");
		} finally {
			await stop();
		}
	});
});
