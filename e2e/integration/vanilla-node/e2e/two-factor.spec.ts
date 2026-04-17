import { expect, test } from "@playwright/test";
import { twoFactor } from "better-auth/plugins";
import { runClient, setup } from "./utils";

type JsonResponse = {
	status: number;
	json: unknown;
};

type TwoFactorChallengeEnvelope = {
	type: "challenge";
	challenge: {
		type: "two-factor";
		attemptId: string;
		availableMethods: string[];
	};
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function findAuthCookie(cookies: Array<{ name: string }>, baseName: string) {
	return cookies.find(
		(cookie) => cookie.name === baseName || cookie.name.endsWith(baseName),
	);
}

function expectTwoFactorChallengeData(
	value: unknown,
): asserts value is TwoFactorChallengeEnvelope {
	expect(isRecord(value)).toBe(true);
	const envelope = value as Record<string, unknown>;
	expect(envelope.type).toBe("challenge");
	expect(isRecord(envelope.challenge)).toBe(true);
	const challenge = envelope.challenge as Record<string, unknown>;
	expect(challenge.type).toBe("two-factor");
	expect(typeof challenge.attemptId).toBe("string");
	expect(Array.isArray(challenge.availableMethods)).toBe(true);
}

async function postAuthJSON(
	page: Parameters<typeof runClient>[0],
	port: number,
	path: string,
	body: Record<string, unknown>,
): Promise<JsonResponse> {
	return page.evaluate(
		async ({ port, path, body }) => {
			const response = await fetch(`http://localhost:${port}/api/auth${path}`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
				},
				credentials: "include",
				body: JSON.stringify(body),
			});
			return {
				status: response.status,
				json: await response.json().catch(() => null),
			};
		},
		{ port, path, body },
	);
}

async function enableTwoFactorForTestUser(
	page: Parameters<typeof runClient>[0],
	serverPort: number,
) {
	const response = await postAuthJSON(page, serverPort, "/two-factor/enable", {
		password: "password123",
	});
	expect(response.status).toBe(200);
	return response.json;
}

async function signInAsTestUser(page: Parameters<typeof runClient>[0]) {
	return runClient(page, ({ client }) =>
		client.signIn.email({
			email: "test@test.com",
			password: "password123",
		}),
	);
}

test.describe("vanilla-node two factor", async () => {
	let lastOTP = "";
	const { ref, start, clean } = setup({
		plugins: [
			twoFactor({
				skipVerificationOnEnable: true,
				otpOptions: {
					sendOTP({ otp }) {
						lastOTP = otp;
					},
				},
			}),
		],
	});

	test.beforeEach(async () => {
		lastOTP = "";
		await start();
	});

	test.afterEach(async () => {
		await clean();
	});

	test("requires two factor before issuing a session and allows OTP completion", async ({
		page,
	}) => {
		await page.goto(
			`http://localhost:${ref.clientPort}/?port=${ref.serverPort}`,
		);
		await page.locator("text=Ready").waitFor();

		await signInAsTestUser(page);
		await enableTwoFactorForTestUser(page, ref.serverPort);
		await runClient(page, ({ client }) => client.signOut());

		const signInResult = await signInAsTestUser(page);
		expect(signInResult.error).toBeNull();
		expectTwoFactorChallengeData(signInResult.data);
		expect(signInResult.data.challenge.attemptId).toBeTruthy();
		expect(signInResult.data.challenge.availableMethods).toContain("otp");

		// The challenge must not leak an authenticated session before OTP succeeds.
		let cookies = await page.context().cookies();
		expect(
			findAuthCookie(cookies, "better-auth.session_token"),
		).toBeUndefined();
		expect(findAuthCookie(cookies, "better-auth.two_factor")).toBeDefined();

		const sendOtpResponse = await postAuthJSON(
			page,
			ref.serverPort,
			"/two-factor/send-otp",
			{ attemptId: signInResult.data.challenge.attemptId },
		);
		expect(sendOtpResponse.status).toBe(200);
		expect(lastOTP).toHaveLength(6);

		const invalidOtp = lastOTP === "000000" ? "999999" : "000000";
		const invalidResponse = await postAuthJSON(
			page,
			ref.serverPort,
			"/two-factor/verify-otp",
			{ attemptId: signInResult.data.challenge.attemptId, code: invalidOtp },
		);
		expect(invalidResponse.status).toBe(401);

		cookies = await page.context().cookies();
		expect(
			findAuthCookie(cookies, "better-auth.session_token"),
		).toBeUndefined();
		expect(findAuthCookie(cookies, "better-auth.two_factor")).toBeDefined();

		const verifyResponse = await postAuthJSON(
			page,
			ref.serverPort,
			"/two-factor/verify-otp",
			{ attemptId: signInResult.data.challenge.attemptId, code: lastOTP },
		);
		expect(verifyResponse.status).toBe(200);

		cookies = await page.context().cookies();
		expect(findAuthCookie(cookies, "better-auth.session_token")).toBeDefined();
		expect(findAuthCookie(cookies, "better-auth.two_factor")).toBeUndefined();
	});

	test("remembers a trusted device and skips the next challenge", async ({
		page,
	}) => {
		await page.goto(
			`http://localhost:${ref.clientPort}/?port=${ref.serverPort}`,
		);
		await page.locator("text=Ready").waitFor();

		await signInAsTestUser(page);
		await enableTwoFactorForTestUser(page, ref.serverPort);
		await runClient(page, ({ client }) => client.signOut());

		const challengeResult = await signInAsTestUser(page);
		expectTwoFactorChallengeData(challengeResult.data);
		expect(challengeResult.data.challenge.attemptId).toBeTruthy();

		const sendOtpResponse = await postAuthJSON(
			page,
			ref.serverPort,
			"/two-factor/send-otp",
			{ attemptId: challengeResult.data.challenge.attemptId },
		);
		expect(sendOtpResponse.status).toBe(200);
		expect(lastOTP).toHaveLength(6);

		const verifyResponse = await postAuthJSON(
			page,
			ref.serverPort,
			"/two-factor/verify-otp",
			{
				attemptId: challengeResult.data.challenge.attemptId,
				code: lastOTP,
				trustDevice: true,
			},
		);
		expect(verifyResponse.status).toBe(200);

		let cookies = await page.context().cookies();
		expect(findAuthCookie(cookies, "better-auth.trust_device")).toBeDefined();

		await runClient(page, ({ client }) => client.signOut());

		const secondSignInResult = await signInAsTestUser(page);
		expect(secondSignInResult.error).toBeNull();
		expect(
			isRecord(secondSignInResult.data) &&
				secondSignInResult.data.type === "challenge",
		).toBe(false);

		cookies = await page.context().cookies();
		expect(findAuthCookie(cookies, "better-auth.session_token")).toBeDefined();
		expect(findAuthCookie(cookies, "better-auth.two_factor")).toBeUndefined();
	});

	test("allows completing a challenged sign-in with a backup code", async ({
		page,
	}) => {
		await page.goto(
			`http://localhost:${ref.clientPort}/?port=${ref.serverPort}`,
		);
		await page.locator("text=Ready").waitFor();

		await signInAsTestUser(page);
		const enableResponse = await enableTwoFactorForTestUser(
			page,
			ref.serverPort,
		);
		expect(isRecord(enableResponse)).toBe(true);
		expect(Array.isArray(enableResponse.backupCodes)).toBe(true);

		const backupCode = Array.isArray(enableResponse.backupCodes)
			? enableResponse.backupCodes[0]
			: null;
		expect(typeof backupCode).toBe("string");

		await runClient(page, ({ client }) => client.signOut());

		const signInResult = await signInAsTestUser(page);
		expect(signInResult.error).toBeNull();
		expectTwoFactorChallengeData(signInResult.data);
		expect(signInResult.data.challenge.attemptId).toBeTruthy();

		// Recovery codes should complete the pending challenge without any
		// authenticated session existing before the code is verified.
		let cookies = await page.context().cookies();
		expect(
			findAuthCookie(cookies, "better-auth.session_token"),
		).toBeUndefined();
		expect(findAuthCookie(cookies, "better-auth.two_factor")).toBeDefined();

		const verifyResponse = await postAuthJSON(
			page,
			ref.serverPort,
			"/two-factor/verify-backup-code",
			{ attemptId: signInResult.data.challenge.attemptId, code: backupCode },
		);
		expect(verifyResponse.status).toBe(200);

		cookies = await page.context().cookies();
		expect(findAuthCookie(cookies, "better-auth.session_token")).toBeDefined();
		expect(findAuthCookie(cookies, "better-auth.two_factor")).toBeUndefined();

		await runClient(page, ({ client }) => client.signOut());

		const secondChallenge = await signInAsTestUser(page);
		expect(secondChallenge.error).toBeNull();
		expectTwoFactorChallengeData(secondChallenge.data);
		expect(secondChallenge.data.challenge.attemptId).toBeTruthy();

		const reusedCodeResponse = await postAuthJSON(
			page,
			ref.serverPort,
			"/two-factor/verify-backup-code",
			{ attemptId: secondChallenge.data.challenge.attemptId, code: backupCode },
		);
		expect(reusedCodeResponse.status).toBe(401);

		cookies = await page.context().cookies();
		expect(
			findAuthCookie(cookies, "better-auth.session_token"),
		).toBeUndefined();
		expect(findAuthCookie(cookies, "better-auth.two_factor")).toBeDefined();
	});

	test("regenerates backup codes and invalidates the previous set", async ({
		page,
	}) => {
		await page.goto(
			`http://localhost:${ref.clientPort}/?port=${ref.serverPort}`,
		);
		await page.locator("text=Ready").waitFor();

		await signInAsTestUser(page);
		const enableResponse = await enableTwoFactorForTestUser(
			page,
			ref.serverPort,
		);
		expect(isRecord(enableResponse)).toBe(true);
		expect(Array.isArray(enableResponse.backupCodes)).toBe(true);

		const previousBackupCode = Array.isArray(enableResponse.backupCodes)
			? enableResponse.backupCodes[0]
			: null;
		expect(typeof previousBackupCode).toBe("string");

		const regenerateResponse = await postAuthJSON(
			page,
			ref.serverPort,
			"/two-factor/generate-backup-codes",
			{ password: "password123" },
		);
		expect(regenerateResponse.status).toBe(200);
		expect(isRecord(regenerateResponse.json)).toBe(true);
		expect(Array.isArray(regenerateResponse.json.backupCodes)).toBe(true);

		const regeneratedBackupCode = Array.isArray(
			regenerateResponse.json.backupCodes,
		)
			? regenerateResponse.json.backupCodes[0]
			: null;
		expect(typeof regeneratedBackupCode).toBe("string");

		await runClient(page, ({ client }) => client.signOut());

		const signInResult = await signInAsTestUser(page);
		expect(signInResult.error).toBeNull();
		expectTwoFactorChallengeData(signInResult.data);
		expect(signInResult.data.challenge.attemptId).toBeTruthy();

		const previousCodeResponse = await postAuthJSON(
			page,
			ref.serverPort,
			"/two-factor/verify-backup-code",
			{
				attemptId: signInResult.data.challenge.attemptId,
				code: previousBackupCode,
			},
		);
		expect(previousCodeResponse.status).toBe(401);

		let cookies = await page.context().cookies();
		expect(
			findAuthCookie(cookies, "better-auth.session_token"),
		).toBeUndefined();
		expect(findAuthCookie(cookies, "better-auth.two_factor")).toBeDefined();

		const regeneratedCodeResponse = await postAuthJSON(
			page,
			ref.serverPort,
			"/two-factor/verify-backup-code",
			{
				attemptId: signInResult.data.challenge.attemptId,
				code: regeneratedBackupCode,
			},
		);
		expect(regeneratedCodeResponse.status).toBe(200);

		cookies = await page.context().cookies();
		expect(findAuthCookie(cookies, "better-auth.session_token")).toBeDefined();
		expect(findAuthCookie(cookies, "better-auth.two_factor")).toBeUndefined();
	});

	test("clears trusted-device state when disabling two factor", async ({
		page,
	}) => {
		await page.goto(
			`http://localhost:${ref.clientPort}/?port=${ref.serverPort}`,
		);
		await page.locator("text=Ready").waitFor();

		await signInAsTestUser(page);
		await enableTwoFactorForTestUser(page, ref.serverPort);
		await runClient(page, ({ client }) => client.signOut());

		const challengeResult = await signInAsTestUser(page);
		expect(challengeResult.error).toBeNull();
		expectTwoFactorChallengeData(challengeResult.data);
		expect(challengeResult.data.challenge.attemptId).toBeTruthy();

		const sendOtpResponse = await postAuthJSON(
			page,
			ref.serverPort,
			"/two-factor/send-otp",
			{ attemptId: challengeResult.data.challenge.attemptId },
		);
		expect(sendOtpResponse.status).toBe(200);
		expect(lastOTP).toHaveLength(6);

		const verifyResponse = await postAuthJSON(
			page,
			ref.serverPort,
			"/two-factor/verify-otp",
			{
				attemptId: challengeResult.data.challenge.attemptId,
				code: lastOTP,
				trustDevice: true,
			},
		);
		expect(verifyResponse.status).toBe(200);

		let cookies = await page.context().cookies();
		expect(findAuthCookie(cookies, "better-auth.trust_device")).toBeDefined();

		const disableResponse = await postAuthJSON(
			page,
			ref.serverPort,
			"/two-factor/disable",
			{ password: "password123" },
		);
		expect(disableResponse.status).toBe(200);

		cookies = await page.context().cookies();
		expect(findAuthCookie(cookies, "better-auth.trust_device")).toBeUndefined();

		await runClient(page, ({ client }) => client.signOut());

		const secondSignInResult = await signInAsTestUser(page);
		expect(secondSignInResult.error).toBeNull();
		expect(
			isRecord(secondSignInResult.data) &&
				secondSignInResult.data.type === "challenge",
		).toBe(false);
	});
});
