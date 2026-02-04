import type { Verification } from "better-auth";
import { APIError } from "better-auth/api";
import { createAuthClient } from "better-auth/client";
import { getTestInstance } from "better-auth/test";
import {
	afterEach,
	assert,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import type { Passkey } from ".";
import { passkey } from ".";
import { passkeyClient } from "./client";

vi.mock("@simplewebauthn/server", async (importOriginal) => {
	const mod = await importOriginal<typeof import("@simplewebauthn/server")>();
	return {
		...mod,
		verifyAuthenticationResponse: vi.fn(mod.verifyAuthenticationResponse),
	};
});

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

	it("should not delete a passkey that doesn't exist", async () => {
		const { headers } = await signInWithTestUser();
		await expect(
			auth.api.deletePasskey({
				headers: headers,
				body: {
					id: "mockPasskeyId",
				},
			}),
		).rejects.toThrowError(APIError);
	});

	it("should delete a passkey", async () => {
		const { headers, user } = await signInWithTestUser();
		const context = await auth.$context;
		const passkey = await context.adapter.create<Omit<Passkey, "id">, Passkey>({
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

		const deleteResult = await auth.api.deletePasskey({
			headers: headers,
			body: {
				id: passkey.id,
			},
		});
		expect(deleteResult.status).toBe(true);
	});
});

describe("passkey expirationTime per-request", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("should compute expirationTime per-request, not at init time", async () => {
		const initTime = Date.now();
		vi.setSystemTime(initTime);

		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [passkey()],
		});

		// Advance time by 6 minutes
		vi.advanceTimersByTime(6 * 60 * 1000);

		const { headers } = await signInWithTestUser();
		await auth.api.generatePasskeyRegistrationOptions({
			headers,
		});

		const context = await auth.$context;
		const verifications = await context.adapter.findMany<Verification>({
			model: "verification",
		});

		const passkeyVerification = verifications[verifications.length - 1];
		assert(passkeyVerification);

		const currentTime = Date.now();
		const expiresAt = new Date(passkeyVerification.expiresAt).getTime();

		expect(expiresAt).toBeGreaterThan(currentTime);
	});

	it("should compute expirationTime per-request for authentication options", async () => {
		const initTime = Date.now();
		vi.setSystemTime(initTime);

		const { auth } = await getTestInstance({
			plugins: [passkey()],
		});

		// Advance time by 6 minutes
		vi.advanceTimersByTime(6 * 60 * 1000);

		await auth.api.generatePasskeyAuthenticationOptions({});

		const context = await auth.$context;
		const verifications = await context.adapter.findMany<Verification>({
			model: "verification",
		});

		const passkeyVerification = verifications[verifications.length - 1];
		assert(passkeyVerification);

		const currentTime = Date.now();
		const expiresAt = new Date(passkeyVerification.expiresAt).getTime();

		expect(expiresAt).toBeGreaterThan(currentTime);
	});
});
