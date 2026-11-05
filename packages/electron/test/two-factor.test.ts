import { randomBytes } from "node:crypto";
import { base64Url } from "@better-auth/utils/base64";
import { parseSetCookieHeader } from "better-auth/cookies";
import { generateCodeChallenge } from "better-auth/oauth2";
import { twoFactor } from "better-auth/plugins";
import { convertSetCookieToCookie, getTestInstance } from "better-auth/test";
import { describe, expect, it } from "vitest";
import { electron } from "../src/index";
import { hashSessionToken } from "../src/routes";

const baseURL = "http://localhost:3000/api/auth";

function redirectCode(response: Response) {
	const cookie = parseSetCookieHeader(
		response.headers.get("set-cookie") || "",
	).get("better-auth.electron");
	if (!cookie?.value) return null;
	const { identifier } = JSON.parse(
		new TextDecoder().decode(base64Url.decode(cookie.value)),
	) as { identifier: string };
	return identifier;
}

async function setup(order: "electron-first" | "two-factor-first") {
	let otp = "";
	const sessionTokens: string[] = [];
	const secondFactor = twoFactor({
		skipVerificationOnEnable: true,
		otpOptions: {
			sendOTP: ({ otp: code }) => {
				otp = code;
			},
		},
	});
	const instance = await getTestInstance({
		databaseHooks: {
			session: {
				create: {
					after: async (session) => {
						sessionTokens.push(session.token);
					},
				},
			},
		},
		plugins:
			order === "electron-first"
				? [electron(), secondFactor]
				: [secondFactor, electron()],
	});
	const { auth, testUser, signInWithTestUser } = instance;
	const { user, headers } = await signInWithTestUser();
	const { backupCodes } = await auth.api.enableTwoFactor({
		headers,
		body: { password: testUser.password },
	});
	const verifier = base64Url.encode(randomBytes(32));
	const challenge = await generateCodeChallenge(verifier);
	const signIn = () =>
		auth.handler(
			new Request(
				`${baseURL}/sign-in/email?client_id=electron&state=abc&code_challenge=${challenge}`,
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						email: testUser.email,
						password: testUser.password,
					}),
				},
			),
		);
	const exchange = (token: string) =>
		auth.handler(
			new Request(`${baseURL}/electron/token`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ token, state: "abc", code_verifier: verifier }),
			}),
		);
	return {
		...instance,
		user,
		backupCodes,
		challenge,
		sessionTokens,
		signIn,
		exchange,
		getOTP: () => otp,
	};
}

/**
 * @see https://www.better-auth.com/docs/plugins/2fa#sign-in-with-2fa
 */
describe("Electron sign-in with two-factor authentication", () => {
	for (const order of ["electron-first", "two-factor-first"] as const) {
		it(`does not issue a code before verification (${order})`, async () => {
			const { signIn } = await setup(order);

			const response = await signIn();

			const body = await response.json();
			expect(body).toMatchObject({ twoFactorRedirect: true });
			expect(body.electron_authorization_code).toBeUndefined();
			expect(redirectCode(response)).toBeNull();
		});

		it(`rejects a code bound to the challenged sign-in session (${order})`, async () => {
			const { auth, user, challenge, sessionTokens, signIn, exchange } =
				await setup(order);
			await signIn();
			const code = "pre-two-factor-code";
			const ctx = await auth.$context;
			await ctx.internalAdapter.createVerificationValue({
				identifier: `electron:${code}`,
				value: JSON.stringify({
					userId: user.id,
					sourceSessionTokenHash: await hashSessionToken(sessionTokens.at(-1)!),
					codeChallenge: challenge,
					state: "abc",
				}),
				expiresAt: new Date(Date.now() + 60_000),
			});

			expect((await exchange(code)).status).toBe(404);
		});

		for (const method of ["otp", "backup-code"] as const) {
			it(`transfers the user after ${method} verification (${order})`, async () => {
				const { auth, testUser, backupCodes, signIn, exchange, getOTP } =
					await setup(order);
				const response = await signIn();
				const headers = convertSetCookieToCookie(response.headers);

				let verified: Response;
				if (method === "otp") {
					await auth.api.sendTwoFactorOTP({ headers, body: {} });
					verified = await auth.api.verifyTwoFactorOTP({
						headers,
						body: { code: getOTP() },
						asResponse: true,
					});
				} else {
					verified = await auth.api.verifyBackupCode({
						headers,
						body: { code: backupCodes[0]! },
						asResponse: true,
					});
				}

				expect(verified.status).toBe(200);
				const { electron_authorization_code } = await verified.json();
				expect(electron_authorization_code).toEqual(expect.any(String));
				expect(redirectCode(verified)).toBe(electron_authorization_code);
				const exchanged = await exchange(electron_authorization_code);
				expect(exchanged.status).toBe(200);
				expect((await exchanged.json()).user.email).toBe(testUser.email);
			});
		}
	}

	it("does not issue a code when verification fails", async () => {
		const { auth, signIn, getOTP } = await setup("electron-first");
		const response = await signIn();
		const headers = convertSetCookieToCookie(response.headers);
		await auth.api.sendTwoFactorOTP({ headers, body: {} });

		const failed = await auth.api.verifyTwoFactorOTP({
			headers,
			body: { code: getOTP() === "000000" ? "111111" : "000000" },
			asResponse: true,
		});

		expect(failed.status).toBe(401);
		expect(redirectCode(failed)).toBeNull();
	});
});

describe("Electron authorization code", () => {
	it("is rejected after the browser session that issued it ends", async () => {
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [electron()],
		});
		const { headers } = await signInWithTestUser();
		const verifier = base64Url.encode(randomBytes(32));
		const challenge = await generateCodeChallenge(verifier);
		const { electron_authorization_code } = await auth.api.electronTransferUser(
			{
				headers,
				query: {
					client_id: "electron",
					state: "abc",
					code_challenge: challenge,
				},
				body: {},
			},
		);
		await auth.api.signOut({ headers });

		const exchanged = await auth.handler(
			new Request(`${baseURL}/electron/token`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					token: electron_authorization_code,
					state: "abc",
					code_verifier: verifier,
				}),
			}),
		);

		expect(exchanged.status).toBe(404);
	});
});
