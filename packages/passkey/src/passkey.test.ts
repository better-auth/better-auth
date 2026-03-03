import { APIError } from "@better-auth/core/error";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import type { Verification } from "better-auth";
import { createAuthClient } from "better-auth/client";
import { parseSetCookieHeader } from "better-auth/cookies";
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
		const updatedAt = new Date();
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
				updatedAt,
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
		expect(passkeys[0]).toHaveProperty("updatedAt");
		expect(new Date(passkeys[0]!.updatedAt!).toISOString()).toBe(
			updatedAt.toISOString(),
		);
	});

	it("should update passkey updatedAt after successful authentication", async () => {
		const { headers, user } = await signInWithTestUser();
		const context = await auth.$context;
		const previousUpdatedAt = new Date(Date.now() - 60_000);
		const passkeyRecord = await context.adapter.create<
			Omit<Passkey, "id">,
			Passkey
		>({
			model: "passkey",
			data: {
				userId: user.id,
				publicKey: "mockPublicKey",
				name: "mockName",
				counter: 0,
				deviceType: "singleDevice",
				credentialID: "mockCredentialID-auth",
				createdAt: new Date(),
				updatedAt: previousUpdatedAt,
				backedUp: false,
				transports: "mockTransports",
				aaguid: "mockAAGUID",
			} satisfies Omit<Passkey, "id">,
		});

		const client = createAuthClient({
			plugins: [passkeyClient()],
			baseURL: "http://localhost:3000/api/auth",
			fetchOptions: {
				headers: headers,
				customFetchImpl,
			},
		});

		let passkeyCookie: string | undefined;
		await client.$fetch("/passkey/generate-authenticate-options", {
			headers: headers,
			method: "GET",
			onResponse(context) {
				const setCookie = context.response.headers.get("Set-Cookie");
				expect(setCookie).toContain("better-auth-passkey");
				const cookies = parseSetCookieHeader(setCookie || "");
				const challengeCookie = [...cookies.entries()].find(([name]) =>
					name.endsWith("better-auth-passkey"),
				);
				passkeyCookie = challengeCookie
					? `${challengeCookie[0]}=${challengeCookie[1].value}`
					: undefined;
			},
		});
		expect(passkeyCookie).toBeDefined();

		vi.mocked(verifyAuthenticationResponse).mockResolvedValueOnce({
			verified: true,
			authenticationInfo: {
				newCounter: 42,
			},
		} as any);

		const authenticationResponse = {
			id: passkeyRecord.credentialID,
			rawId: passkeyRecord.credentialID,
			type: "public-key",
			clientExtensionResults: {},
			response: {
				clientDataJSON: "clientDataJSON",
				authenticatorData: "authenticatorData",
				signature: "signature",
			},
		} satisfies AuthenticationResponseJSON;

		await auth.api.verifyPasskeyAuthentication({
			headers: {
				cookie: passkeyCookie!,
				origin: "http://localhost:3000",
			},
			body: {
				response: authenticationResponse,
			},
		});

		const updatedPasskey = await context.adapter.findOne<Passkey>({
			model: "passkey",
			where: [{ field: "id", value: passkeyRecord.id }],
		});

		expect(updatedPasskey).toBeDefined();
		expect(updatedPasskey?.counter).toBe(42);
		expect(updatedPasskey?.updatedAt).toBeDefined();
		expect(new Date(updatedPasskey!.updatedAt!).getTime()).toBeGreaterThan(
			previousUpdatedAt.getTime(),
		);
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
