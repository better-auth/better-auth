import { createAuthClient } from "better-auth/client";
import { getTestInstance } from "better-auth/test";
import { describe, expect, it } from "vitest";
import { parseSetCookieHeader } from "../../better-auth/src/cookies/cookie-utils";
import type { Passkey } from ".";
import { passkey } from ".";
import { passkeyClient } from "./client";

describe("passkey", async () => {
	const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance({
		plugins: [passkey()],
	});

	it("should generate register options", async () => {
		const { headers } = await signInWithTestUser();
		const options = await auth.api.generatePasskeyRegistrationOptions({
			headers: headers,
		});

		expect(options).toBeDefined();
		expect(options).toHaveProperty("challenge");
		expect(options).toHaveProperty("rp");
		expect(options).toHaveProperty("user");
		expect(options).toHaveProperty("pubKeyCredParams");

		const client = createAuthClient({
			plugins: [passkeyClient()],
			baseURL: "http://localhost:3000/api/auth",
			fetchOptions: {
				headers: headers,
				customFetchImpl,
			},
		});

		await client.$fetch("/passkey/generate-register-options", {
			headers: headers,
			method: "GET",
			onResponse(context) {
				const setCookie = context.response.headers.get("Set-Cookie");
				expect(setCookie).toBeDefined();
				expect(setCookie).toContain("better-auth-passkey");
			},
		});
	});

	it("should generate authenticate options", async () => {
		const { headers } = await signInWithTestUser();
		const options = await auth.api.generatePasskeyAuthenticationOptions({
			headers: headers,
		});
		expect(options).toBeDefined();
		expect(options).toHaveProperty("challenge");
		expect(options).toHaveProperty("rpId");
		expect(options).toHaveProperty("allowCredentials");
		expect(options).toHaveProperty("userVerification");
	});

	it("should generate authenticate options without session (discoverable credentials)", async () => {
		// Test without any session/auth headers - simulating a new sign-in with discoverable credentials
		const options = await auth.api.generatePasskeyAuthenticationOptions({});
		expect(options).toBeDefined();
		expect(options).toHaveProperty("challenge");
		expect(options).toHaveProperty("rpId");
		expect(options).toHaveProperty("userVerification");
	});

	it("should list user passkeys", async () => {
		const { headers, user } = await signInWithTestUser();
		const context = await auth.$context;
		await context.adapter.create<Omit<Passkey, "id">, Passkey>({
			model: "passkey",
			data: {
				userId: user.id,
				publicKey: "mockPublicKey",
				name: "mockName",
				counter: 0,
				deviceType: "singleDevice",
				credentialID: "mockCredentialID",
				createdAt: new Date(),
				backedUp: false,
				transports: "mockTransports",
				aaguid: "mockAAGUID",
			} satisfies Omit<Passkey, "id">,
		});

		const passkeys = await auth.api.listPasskeys({
			headers: headers,
		});

		expect(Array.isArray(passkeys)).toBe(true);
		expect(passkeys[0]).toHaveProperty("id");
		expect(passkeys[0]).toHaveProperty("userId");
		expect(passkeys[0]).toHaveProperty("publicKey");
		expect(passkeys[0]).toHaveProperty("credentialID");
		expect(passkeys[0]).toHaveProperty("aaguid");
	});

	it("should update a passkey", async () => {
		const { headers } = await signInWithTestUser();
		const passkeys = await auth.api.listPasskeys({
			headers: headers,
		});
		const passkey = passkeys[0]!;
		const updateResult = await auth.api.updatePasskey({
			headers: headers,
			body: {
				id: passkey.id,
				name: "newName",
			},
		});

		expect(updateResult.passkey.name).toBe("newName");
	});

	it("should delete a passkey", async () => {
		const { headers } = await signInWithTestUser();
		const deleteResult = await auth.api.deletePasskey({
			headers: headers,
			body: {
				id: "mockPasskeyId",
			},
		});
		expect(deleteResult).toBe(null);
	});

	it("deletes challenge after successful registration and authentication", async () => {
		const { headers } = await signInWithTestUser();

		// client that uses same test fetch impl so onResponse sees Set-Cookie
		const client = createAuthClient({
			baseURL: "http://localhost:3000/api/auth",
			fetchOptions: { headers, customFetchImpl },
		});

		// Generate registration options and capture Set-Cookie
		let setCookieHeader = "";
		await client.$fetch("/passkey/generate-register-options", {
			method: "GET",
			headers,
			onResponse(ctx) {
				setCookieHeader = ctx.response.headers.get("set-cookie") || "";
			},
		});

		expect(setCookieHeader).toContain("better-auth-passkey");
		const cookies = parseSetCookieHeader(setCookieHeader);
		const challengeId = cookies.get("better-auth-passkey")?.value;
		expect(challengeId).toBeDefined();

		const ctx = await auth.$context;
		const found = await ctx.internalAdapter.findVerificationValue(challengeId!);
		expect(found).not.toBeNull();

		// Now call verify-registration (we mock verification so body may be empty)
		let verifySetCookie = "";
		await client.$fetch("/passkey/verify-registration", {
			method: "POST",
			headers: new Headers(headers),
			body: { response: {} },
			onResponse(resCtx) {
				verifySetCookie = resCtx.response.headers.get("set-cookie") || "";
			},
		});

		// DB row should be removed
		const after = await ctx.internalAdapter.findVerificationValue(challengeId!);
		expect(after).toBeNull();

		// Server should send a Set-Cookie clearing the challenge cookie
		expect(verifySetCookie).toContain("better-auth-passkey");
		expect(verifySetCookie.toLowerCase()).satisfy(
			(h: string) => h.includes("max-age=0") || h.includes("expires="),
		);

		// Authentication flow: generate, capture cookie, then verify endpoint
		let authSetCookie = "";
		await client.$fetch("/passkey/generate-authenticate-options", {
			method: "POST",
			headers,
			onResponse(ctx2) {
				authSetCookie = ctx2.response.headers.get("set-cookie") || "";
			},
		});

		const authCookies = parseSetCookieHeader(authSetCookie);
		const authChallengeId = authCookies.get("better-auth-passkey")?.value;
		expect(authChallengeId).toBeDefined();

		const foundAuth = await ctx.internalAdapter.findVerificationValue(
			authChallengeId!,
		);
		expect(foundAuth).not.toBeNull();

		// call verify-authentication
		let authVerifySetCookie = "";
		await client.$fetch("/passkey/verify-authentication", {
			method: "POST",
			headers: new Headers(headers),
			body: { response: {} },
			onResponse(ctx3) {
				authVerifySetCookie = ctx3.response.headers.get("set-cookie") || "";
			},
		});

		const afterAuth = await ctx.internalAdapter.findVerificationValue(
			authChallengeId!,
		);
		expect(afterAuth).toBeNull();

		// session cookie should be set by the verify-authentication response
		expect(authVerifySetCookie).toContain("better-auth.session_token");
	});
});
