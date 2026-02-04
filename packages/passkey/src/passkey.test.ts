import { APIError } from "@better-auth/core/error";
import { base64 } from "@better-auth/utils/base64";
import { createAuthClient } from "better-auth/client";
import { getTestInstance } from "better-auth/test";
import { describe, expect, it, vi } from "vitest";
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

describe("passkey with secondary storage", async () => {
	const store = new Map<string, string>();

	const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance({
		plugins: [passkey()],
		secondaryStorage: {
			set(key, value, ttl) {
				store.set(key, value);
			},
			get(key) {
				return store.get(key) || null;
			},
			delete(key) {
				store.delete(key);
			},
		},
		rateLimit: {
			enabled: false,
		},
	});

	it("should clean up verification from secondary storage after passkey authentication", async () => {
		const { verifyAuthenticationResponse } = await import(
			"@simplewebauthn/server"
		);
		vi.mocked(verifyAuthenticationResponse).mockResolvedValueOnce({
			verified: true,
			authenticationInfo: {
				newCounter: 1,
				credentialID: "cleanup-test-credential",
				credentialDeviceType: "singleDevice",
				credentialBackedUp: false,
				origin: "http://localhost:3000",
				rpID: "localhost",
				userVerified: true,
				authenticatorExtensionResults: undefined,
			},
		});

		const { headers, user } = await signInWithTestUser();
		const ctx = await auth.$context;

		await ctx.adapter.create<Omit<Passkey, "id">, Passkey>({
			model: "passkey",
			data: {
				userId: user.id,
				credentialID: "cleanup-test-credential",
				publicKey: base64.encode(new Uint8Array(32)),
				counter: 0,
				deviceType: "singleDevice",
				backedUp: false,
				transports: "internal",
				createdAt: new Date(),
				aaguid: "00000000-0000-0000-0000-000000000000",
				name: "Test Passkey",
			} satisfies Omit<Passkey, "id">,
		});

		// Generate authentication options — creates verification in secondary storage
		const generateRes = await customFetchImpl(
			"http://localhost:3000/api/auth/passkey/generate-authenticate-options",
			{ method: "GET", headers },
		);
		const setCookie = generateRes.headers.get("set-cookie");
		const passkeyCookie = setCookie?.split(";")[0] || "";

		// Verification should exist in secondary storage
		const verificationKeys = [...store.keys()].filter((k) =>
			k.startsWith("verification:"),
		);
		expect(verificationKeys.length).toBe(1);

		// Verify authentication
		const sessionCookie = headers.get("cookie") || "";
		const verifyRes = await customFetchImpl(
			"http://localhost:3000/api/auth/passkey/verify-authentication",
			{
				method: "POST",
				headers: {
					cookie: `${passkeyCookie}; ${sessionCookie}`,
					origin: "http://localhost:3000",
					"content-type": "application/json",
				},
				body: JSON.stringify({
					response: {
						id: "cleanup-test-credential",
						rawId: "cleanup-test-credential",
						response: {
							authenticatorData: "mock",
							clientDataJSON: "mock",
							signature: "mock",
						},
						type: "public-key",
						authenticatorAttachment: "platform",
						clientExtensionResults: {},
					},
				}),
			},
		);

		expect(verifyRes.status).toBe(200);

		// Verification should be cleaned up from secondary storage
		const remainingKeys = [...store.keys()].filter((k) =>
			k.startsWith("verification:"),
		);
		expect(remainingKeys.length).toBe(0);
	});
});
