import { randomBytes } from "node:crypto";
import { base64Url } from "@better-auth/utils/base64";
import { createOTP } from "@better-auth/utils/otp";
import { createAuthMiddleware } from "better-auth/api";
import { parseSetCookieHeader } from "better-auth/cookies";
import { symmetricDecrypt } from "better-auth/crypto";
import { generateCodeChallenge } from "better-auth/oauth2";
import {
	magicLink,
	phoneNumber,
	twoFactor,
	username,
} from "better-auth/plugins";
import { convertSetCookieToCookie, getTestInstance } from "better-auth/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { electron } from "../src/index";
import { electronProxyClient } from "../src/proxy";
import { hashSessionToken } from "../src/routes";

const baseURL = "http://localhost:3000/api/auth";

const cookies = (response: Response) =>
	parseSetCookieHeader(response.headers.get("set-cookie") || "");

async function signIn(
	handler: (request: Request) => Promise<Response>,
	email: string,
	password: string,
	state: string,
	challenge: string,
	headers?: Headers,
) {
	return handler(
		new Request(
			`${baseURL}/sign-in/email?client_id=electron&state=${state}&code_challenge=${challenge}`,
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					...(headers?.get("cookie") ? { cookie: headers.get("cookie")! } : {}),
				},
				body: JSON.stringify({ email, password }),
			},
		),
	);
}

async function exchange(
	handler: (request: Request) => Promise<Response>,
	code: string,
	state: string,
	verifier: string,
) {
	return handler(
		new Request(`${baseURL}/electron/token`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ token: code, state, code_verifier: verifier }),
		}),
	);
}

/**
 * @see https://www.better-auth.com/docs/plugins/2fa#sign-in-with-2fa
 */
describe("Electron authentication completion", () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it.for(["electron-first", "two-factor-first"] as const)(
		"waits for OTP in %s order and transfers the verified user",
		async (order) => {
			let otp = "";
			const twoFactorMaxAge = order === "electron-first" ? 600 : 900;
			const secondFactor = twoFactor({
				twoFactorCookieMaxAge: twoFactorMaxAge,
				otpOptions: {
					sendOTP: ({ otp: code }) => {
						otp = code;
					},
				},
			});
			const { auth, testUser, signInWithTestUser } = await getTestInstance({
				plugins:
					order === "electron-first"
						? [electron(), secondFactor]
						: [secondFactor, electron()],
			});
			const { headers: enrollmentHeaders } = await signInWithTestUser();
			await auth.api.enableTwoFactor({
				headers: enrollmentHeaders,
				body: { password: testUser.password, method: "otp" },
			});
			const verifier = base64Url.encode(randomBytes(32));
			const challenge = await generateCodeChallenge(verifier);
			const response = await signIn(
				auth.handler,
				testUser.email,
				testUser.password,
				"otp-state",
				challenge,
			);
			expect(await response.json()).toMatchObject({ twoFactorRedirect: true });
			expect(cookies(response).get("better-auth.electron")?.value).toBeFalsy();
			expect(
				cookies(response).get("better-auth.transfer_token")?.["max-age"],
			).toBe(300);
			const browserHeaders = convertSetCookieToCookie(response.headers);
			await auth.api.sendTwoFactorOTP({ headers: browserHeaders, body: {} });
			const failed = await auth.api.verifyTwoFactorOTP({
				headers: browserHeaders,
				body: { code: otp === "000000" ? "111111" : "000000" },
				asResponse: true,
			});
			expect(failed.status).toBeGreaterThanOrEqual(400);
			expect(cookies(failed).get("better-auth.electron")?.value).toBeFalsy();
			const verified = await auth.api.verifyTwoFactorOTP({
				headers: browserHeaders,
				body: { code: otp },
				asResponse: true,
			});
			expect(verified.status).toBe(200);
			const completed = await verified.json();
			expect(completed.electron_authorization_code).toEqual(expect.any(String));
			expect(cookies(verified).has("better-auth.electron")).toBe(true);
			const exchanged = await exchange(
				auth.handler,
				completed.electron_authorization_code,
				"otp-state",
				verifier,
			);
			expect(exchanged.status).toBe(200);
			expect((await exchanged.json()).user.email).toBe(testUser.email);
		},
	);

	it.for(["username", "phone-number"] as const)(
		"requires OTP before the %s credential handoff",
		async (route) => {
			let otp = "";
			const { auth, db, testUser, signInWithTestUser } = await getTestInstance({
				plugins: [
					electron(),
					username(),
					phoneNumber(),
					twoFactor({
						otpOptions: {
							sendOTP: ({ otp: code }) => {
								otp = code;
							},
						},
					}),
				],
			});
			const { user, headers: enrollmentHeaders } = await signInWithTestUser();
			await db.update({
				model: "user",
				where: [{ field: "id", value: user.id }],
				update: {
					username: "electron_user",
					displayUsername: "electron_user",
					phoneNumber: "+15551234567",
					phoneNumberVerified: true,
				},
			});
			await auth.api.enableTwoFactor({
				headers: enrollmentHeaders,
				body: { password: testUser.password, method: "otp" },
			});
			const verifier = base64Url.encode(randomBytes(32));
			const challenge = await generateCodeChallenge(verifier);
			const response = await auth.handler(
				new Request(
					`${baseURL}/sign-in/${route}?client_id=electron&state=${route}-state&code_challenge=${challenge}`,
					{
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							[route === "username" ? "username" : "phoneNumber"]:
								route === "username" ? "electron_user" : "+15551234567",
							password: testUser.password,
						}),
					},
				),
			);
			expect(await response.json()).toMatchObject({ twoFactorRedirect: true });
			expect(cookies(response).get("better-auth.electron")?.value).toBeFalsy();
			const browserHeaders = convertSetCookieToCookie(response.headers);
			await auth.api.sendTwoFactorOTP({ headers: browserHeaders, body: {} });
			const verified = await auth.api.verifyTwoFactorOTP({
				headers: browserHeaders,
				body: { code: otp },
				asResponse: true,
			});
			expect(verified.status).toBe(200);
			const code = (await verified.json()).electron_authorization_code;
			expect(code).toEqual(expect.any(String));
			expect(
				(await exchange(auth.handler, code, `${route}-state`, verifier)).status,
			).toBe(200);
		},
	);

	it("ignores an earlier request's cookie during page-load redirect polling", async () => {
		const { client } = await getTestInstance(
			{ plugins: [electron()] },
			{
				clientOptions: {
					plugins: [electronProxyClient({ protocol: "com.example.app" })],
				},
			},
		);
		const packed = (state: string) =>
			base64Url.encode(
				new TextEncoder().encode(
					JSON.stringify({ identifier: "identifier", state }),
				),
			);
		let cookie = `better-auth.electron=${packed("old-state")}`;
		const replace = vi.fn();
		vi.stubGlobal("document", {
			get cookie() {
				return cookie;
			},
			set cookie(value: string) {
				cookie = value;
			},
		});
		vi.stubGlobal("window", {
			location: { search: "?client_id=electron&state=new-state", replace },
		});
		vi.useFakeTimers();
		expect(client.electron.getAuthorizationCode()).toBeNull();
		cookie = "better-auth.electron=malformed";
		expect(client.electron.getAuthorizationCode()).toBeNull();
		for (const identifier of [undefined, "", 123]) {
			cookie = `better-auth.electron=${base64Url.encode(new TextEncoder().encode(JSON.stringify({ identifier, state: "new-state" })))}`;
			expect(client.electron.getAuthorizationCode()).toBeNull();
		}
		cookie = `better-auth.electron=${packed("old-state")}`;
		const timer = client.ensureElectronRedirect();
		await vi.advanceTimersByTimeAsync(200);
		expect(replace).not.toHaveBeenCalled();
		cookie = `better-auth.electron=${packed("new-state")}`;
		expect(client.electron.getAuthorizationCode()).toBe(packed("new-state"));
		window.location.search = "";
		expect(client.electron.getAuthorizationCode()).toBe(packed("new-state"));
		window.location.search = "?client_id=electron&state=new-state";
		await vi.advanceTimersByTimeAsync(100);
		expect(replace).toHaveBeenCalledOnce();
		clearInterval(timer);
	});

	it("clears an earlier handoff when a new two-factor challenge begins", async () => {
		const { auth, testUser, signInWithTestUser } = await getTestInstance({
			plugins: [electron(), twoFactor({ otpOptions: { sendOTP: () => {} } })],
		});
		const challenge = await generateCodeChallenge(
			base64Url.encode(randomBytes(32)),
		);
		const previous = await signIn(
			auth.handler,
			testUser.email,
			testUser.password,
			"previous-state",
			challenge,
		);
		const oldCode = cookies(previous).get("better-auth.electron")?.value;
		expect(oldCode).toEqual(expect.any(String));
		const { headers } = await signInWithTestUser();
		await auth.api.enableTwoFactor({
			headers,
			body: { password: testUser.password, method: "otp" },
		});
		const pending = await signIn(
			auth.handler,
			testUser.email,
			testUser.password,
			"new-state",
			challenge,
			new Headers({ cookie: `better-auth.electron=${oldCode}` }),
		);
		expect(await pending.json()).toMatchObject({ twoFactorRedirect: true });
		const cleared = cookies(pending).get("better-auth.electron");
		expect(cleared?.value).toBe("");
		expect(cleared?.["max-age"]).toBe(0);
	});

	it("rejects retained pending intent after its server deadline", async () => {
		let otp = "";
		const { auth, testUser, signInWithTestUser } = await getTestInstance({
			plugins: [
				electron(),
				twoFactor({
					otpOptions: {
						sendOTP: ({ otp: code }) => {
							otp = code;
						},
					},
				}),
			],
		});
		const { headers } = await signInWithTestUser();
		await auth.api.enableTwoFactor({
			headers,
			body: { password: testUser.password, method: "otp" },
		});
		vi.useFakeTimers({ toFake: ["Date"] });
		const challenge = await generateCodeChallenge(
			base64Url.encode(randomBytes(32)),
		);
		const pending = await signIn(
			auth.handler,
			testUser.email,
			testUser.password,
			"expired-state",
			challenge,
		);
		const browserHeaders = convertSetCookieToCookie(pending.headers);
		browserHeaders.set(
			"cookie",
			`${browserHeaders.get("cookie")}; better-auth.electron=previous-handoff`,
		);
		vi.setSystemTime(Date.now() + 301_000);
		await auth.api.sendTwoFactorOTP({ headers: browserHeaders, body: {} });
		const verified = await auth.api.verifyTwoFactorOTP({
			headers: browserHeaders,
			body: { code: otp },
			asResponse: true,
		});
		expect(verified.status).toBe(200);
		const result = await verified.json();
		expect(result.token).toEqual(expect.any(String));
		expect(result.electron_authorization_code).toBeUndefined();
		expect(cookies(verified).get("better-auth.electron")?.value).toBeFalsy();
	});

	it("retains an Electron handoff through a successful magic-link redirect", async () => {
		let verificationURL = "";
		const { auth, testUser } = await getTestInstance({
			plugins: [
				electron(),
				magicLink({
					sendMagicLink({ url }) {
						verificationURL = url;
					},
				}),
			],
		});
		const verifier = base64Url.encode(randomBytes(32));
		const challenge = await generateCodeChallenge(verifier);
		const requested = await auth.handler(
			new Request(
				`${baseURL}/sign-in/magic-link?client_id=electron&state=magic-state&code_challenge=${challenge}`,
				{
					method: "POST",
					headers: {
						"content-type": "application/json",
						origin: "http://localhost:3000",
					},
					body: JSON.stringify({
						email: testUser.email,
						callbackURL: "/signed-in",
					}),
				},
			),
		);
		expect(requested.status).toBe(200);
		expect(verificationURL).toContain("/magic-link/verify");
		const browserHeaders = convertSetCookieToCookie(requested.headers);
		const invalidURL = new URL(verificationURL);
		invalidURL.searchParams.set("token", "invalid-magic-token");
		const failed = await auth.handler(
			new Request(invalidURL, { headers: browserHeaders }),
		);
		expect(failed.status).toBe(302);
		expect(failed.headers.get("location")).toContain("error=");
		expect(cookies(failed).get("better-auth.electron")?.value).toBeFalsy();

		const verified = await auth.handler(
			new Request(verificationURL, { headers: browserHeaders }),
		);
		expect(verified.status).toBe(302);
		expect(verified.headers.get("location")).toBe(
			"http://localhost:3000/signed-in",
		);
		const redirectCookie = cookies(verified).get("better-auth.electron")?.value;
		expect(redirectCookie).toEqual(expect.any(String));
		const redirect = JSON.parse(
			new TextDecoder().decode(base64Url.decode(redirectCookie!)),
		) as { identifier: string; state: string };
		expect(redirect.state).toBe("magic-state");
		expect(
			(
				await exchange(
					auth.handler,
					redirect.identifier,
					redirect.state,
					verifier,
				)
			).status,
		).toBe(200);
	});

	it("does not issue a code when an after-hook rejects sign-in", async () => {
		const { auth, testUser } = await getTestInstance({
			plugins: [
				electron(),
				{
					id: "reject-sign-in",
					hooks: {
						after: [
							{
								matcher: (ctx) => ctx.path === "/sign-in/email",
								handler: createAuthMiddleware(async (ctx) => {
									throw ctx.error("FORBIDDEN", {
										message: "Sign-in rejected",
									});
								}),
							},
						],
					},
				},
			],
		});
		const verifier = base64Url.encode(randomBytes(32));
		const challenge = await generateCodeChallenge(verifier);
		const response = await signIn(
			auth.handler,
			testUser.email,
			testUser.password,
			"rejected-state",
			challenge,
		);
		expect(response.status).toBe(403);
		expect(cookies(response).get("better-auth.electron")?.value).toBeFalsy();
	});

	it("completes immediately when the browser has a valid trusted device", async () => {
		let otp = "";
		const { auth, testUser, signInWithTestUser } = await getTestInstance({
			plugins: [
				electron(),
				twoFactor({
					otpOptions: {
						sendOTP: ({ otp: code }) => {
							otp = code;
						},
					},
				}),
			],
		});
		const { headers: enrollmentHeaders } = await signInWithTestUser();
		await auth.api.enableTwoFactor({
			headers: enrollmentHeaders,
			body: { password: testUser.password, method: "otp" },
		});
		const firstChallenge = await auth.api.signInEmail({
			body: { email: testUser.email, password: testUser.password },
			asResponse: true,
		});
		const challengeHeaders = convertSetCookieToCookie(firstChallenge.headers);
		await auth.api.sendTwoFactorOTP({ headers: challengeHeaders, body: {} });
		const trusted = await auth.api.verifyTwoFactorOTP({
			headers: challengeHeaders,
			body: { code: otp, trustDevice: true },
			asResponse: true,
		});
		const trustCookie = cookies(trusted).get("better-auth.trust_device")?.value;
		expect(trustCookie).toEqual(expect.any(String));
		const verifier = base64Url.encode(randomBytes(32));
		const challenge = await generateCodeChallenge(verifier);
		const response = await signIn(
			auth.handler,
			testUser.email,
			testUser.password,
			"trusted-state",
			challenge,
			new Headers({ cookie: `better-auth.trust_device=${trustCookie}` }),
		);
		const body = await response.json();
		expect(body.twoFactorRedirect).toBeUndefined();
		expect(body.electron_authorization_code).toEqual(expect.any(String));
		expect(
			(
				await exchange(
					auth.handler,
					body.electron_authorization_code,
					"trusted-state",
					verifier,
				)
			).status,
		).toBe(200);
	});

	it("stores a digest of the source session token, not the token", async () => {
		const { auth, testUser } = await getTestInstance({
			plugins: [electron()],
		});
		const verifier = base64Url.encode(randomBytes(32));
		const challenge = await generateCodeChallenge(verifier);
		const response = await signIn(
			auth.handler,
			testUser.email,
			testUser.password,
			"digest-state",
			challenge,
		);
		expect(response.status).toBe(200);
		const { electron_authorization_code: code } = await response.json();
		const sessionToken = cookies(response)
			.get("better-auth.session_token")
			?.value.split(".")[0];
		if (!sessionToken) throw new Error("Sign-in did not set a session cookie");
		const context = await auth.$context;

		const row = await context.internalAdapter.findVerificationValue(
			`electron:${code}`,
		);

		expect(row?.value).not.toContain(sessionToken);
		expect(JSON.parse(row?.value ?? "{}")).toMatchObject({
			sourceSessionTokenHash: await hashSessionToken(sessionToken),
		});
		const exchanged = await exchange(
			auth.handler,
			code,
			"digest-state",
			verifier,
		);
		expect(exchanged.status).toBe(200);
	});

	it("rejects a code after its source browser session is revoked", async () => {
		const { auth, testUser } = await getTestInstance({ plugins: [electron()] });
		const verifier = base64Url.encode(randomBytes(32));
		const challenge = await generateCodeChallenge(verifier);
		const response = await signIn(
			auth.handler,
			testUser.email,
			testUser.password,
			"revoked-state",
			challenge,
		);
		const body = await response.json();
		expect(body.electron_authorization_code).toEqual(expect.any(String));
		const sourceToken: unknown = body.token;
		if (typeof sourceToken !== "string")
			throw new Error("Missing source token");
		await (await auth.$context).internalAdapter.deleteSession(sourceToken);
		const exchanged = await exchange(
			auth.handler,
			body.electron_authorization_code,
			"revoked-state",
			verifier,
		);
		expect(exchanged.status).toBe(404);
		const replay = await exchange(
			auth.handler,
			body.electron_authorization_code,
			"revoked-state",
			verifier,
		);
		expect(replay.status).toBe(404);
	});

	it("transfers an existing live browser session", async () => {
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [electron()],
		});
		const { headers } = await signInWithTestUser();
		const verifier = base64Url.encode(randomBytes(32));
		const challenge = await generateCodeChallenge(verifier);
		const response = await auth.handler(
			new Request(
				`${baseURL}/electron/transfer-user?client_id=electron&state=transfer-state&code_challenge=${challenge}`,
				{
					method: "POST",
					headers: {
						"content-type": "application/json",
						cookie: headers.get("cookie") || "",
					},
					body: "{}",
				},
			),
		);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.electron_authorization_code).toEqual(expect.any(String));
		const exchanged = await exchange(
			auth.handler,
			body.electron_authorization_code,
			"transfer-state",
			verifier,
		);
		expect(exchanged.status).toBe(200);
	});

	it("does not transfer a different user's completed challenge", async () => {
		let otp = "";
		const { auth, db, testUser, signInWithTestUser } = await getTestInstance({
			plugins: [
				electron(),
				twoFactor({
					otpOptions: {
						sendOTP: ({ otp: code }) => {
							otp = code;
						},
					},
				}),
			],
		});
		const { headers: enrollmentHeaders } = await signInWithTestUser();
		await auth.api.enableTwoFactor({
			headers: enrollmentHeaders,
			body: { password: testUser.password, method: "otp" },
		});
		const otherEmail = "other-electron-user@example.com";
		const otherPassword = "other-password";
		const other = await auth.api.signUpEmail({
			body: {
				email: otherEmail,
				password: otherPassword,
				name: "Other Electron User",
			},
		});
		await db.update({
			model: "user",
			where: [{ field: "id", value: other.user.id }],
			update: { twoFactorEnabled: true },
		});

		const verifier = base64Url.encode(randomBytes(32));
		const challenge = await generateCodeChallenge(verifier);
		const first = await signIn(
			auth.handler,
			testUser.email,
			testUser.password,
			"first-state",
			challenge,
		);
		expect(await first.json()).toMatchObject({ twoFactorRedirect: true });
		const transferCookie = cookies(first).get(
			"better-auth.transfer_token",
		)?.value;
		expect(transferCookie).toEqual(expect.any(String));
		const second = await auth.api.signInEmail({
			body: { email: otherEmail, password: otherPassword },
			asResponse: true,
		});
		const secondHeaders = convertSetCookieToCookie(second.headers);
		secondHeaders.set(
			"cookie",
			`${secondHeaders.get("cookie")}; better-auth.transfer_token=${transferCookie}`,
		);
		await auth.api.sendTwoFactorOTP({ headers: secondHeaders, body: {} });
		const verified = await auth.api.verifyTwoFactorOTP({
			headers: secondHeaders,
			body: { code: otp },
			asResponse: true,
		});
		expect(verified.status).toBe(200);
		expect((await verified.json()).electron_authorization_code).toBeUndefined();
		expect(cookies(verified).get("better-auth.electron")?.value).toBeFalsy();
	});

	it.for(["totp", "backup-code"] as const)(
		"completes %s verification before issuing a code",
		async (method) => {
			const { auth, db, testUser, signInWithTestUser } = await getTestInstance({
				plugins: [electron(), twoFactor()],
			});
			const { user, headers: enrollmentHeaders } = await signInWithTestUser();
			const enrollment = await auth.api.enableTwoFactor({
				headers: enrollmentHeaders,
				body: { password: testUser.password, method: "totp" },
			});
			if (enrollment.method !== "totp") {
				throw new Error("Expected TOTP enrollment");
			}
			const row = await db.findOne<{ secret: string }>({
				model: "twoFactor",
				where: [{ field: "userId", value: user.id }],
			});
			if (!row) throw new Error("Missing TOTP enrollment");
			const secret = await symmetricDecrypt({
				key: (await auth.$context).secretConfig,
				data: row.secret,
			});
			await auth.api.verifyTOTP({
				headers: enrollmentHeaders,
				body: { code: await createOTP(secret).totp() },
			});

			const verifier = base64Url.encode(randomBytes(32));
			const challenge = await generateCodeChallenge(verifier);
			const response = await signIn(
				auth.handler,
				testUser.email,
				testUser.password,
				`${method}-state`,
				challenge,
			);
			expect(await response.json()).toMatchObject({ twoFactorRedirect: true });
			expect(cookies(response).get("better-auth.electron")?.value).toBeFalsy();
			const browserHeaders = convertSetCookieToCookie(response.headers);
			const verified =
				method === "totp"
					? await auth.api.verifyTOTP({
							headers: browserHeaders,
							body: { code: await createOTP(secret).totp() },
							asResponse: true,
						})
					: await auth.api.verifyBackupCode({
							headers: browserHeaders,
							body: { code: enrollment.backupCodes[0]! },
							asResponse: true,
						});
			expect(verified.status).toBe(200);
			const completed = await verified.json();
			expect(completed.electron_authorization_code).toEqual(expect.any(String));
			const exchanged = await exchange(
				auth.handler,
				completed.electron_authorization_code,
				`${method}-state`,
				verifier,
			);
			expect(exchanged.status).toBe(200);
		},
	);
});
