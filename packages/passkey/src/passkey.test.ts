import { APIError } from "@better-auth/core/error";
import type { Verification } from "better-auth";
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
import { PASSKEY_ERROR_CODES } from "./error-codes";

const serverMocks = vi.hoisted(() => ({
	verifyRegistrationResponse: vi.fn(),
	verifyAuthenticationResponse: vi.fn(),
}));

vi.mock("@simplewebauthn/server", async () => {
	const actual = await vi.importActual<typeof import("@simplewebauthn/server")>(
		"@simplewebauthn/server",
	);
	return {
		...actual,
		verifyRegistrationResponse: serverMocks.verifyRegistrationResponse,
		verifyAuthenticationResponse: serverMocks.verifyAuthenticationResponse,
	};
});

const mockRegistrationResponse = {
	id: "credential-id",
	response: {
		transports: ["internal"],
	},
};

const mockRegistrationVerification = {
	verified: true,
	registrationInfo: {
		aaguid: "test-aaguid",
		credentialDeviceType: "singleDevice",
		credentialBackedUp: false,
		credential: {
			id: "credential-id",
			publicKey: new Uint8Array([1, 2, 3]),
			counter: 0,
		},
	},
};

describe("passkey", async () => {
	const {
		auth,
		client,
		signInWithTestUser,
		sessionSetter,
		cookieSetter,
		customFetchImpl,
	} = await getTestInstance({
		plugins: [passkey()],
	});

	afterEach(() => {
		serverMocks.verifyRegistrationResponse.mockReset();
		serverMocks.verifyAuthenticationResponse.mockReset();
	});

	it("should reject registration without a response", async () => {
		const { headers } = await signInWithTestUser();
		headers.set("origin", "http://localhost:3000");
		await client.$fetch("/passkey/generate-register-options", {
			method: "GET",
			headers,
			onResponse: cookieSetter(headers),
		});
		headers.set("content-type", "application/json");

		const response = await customFetchImpl(
			"http://localhost:3000/api/auth/passkey/verify-registration",
			{
				method: "POST",
				headers,
				body: JSON.stringify({}),
			},
		);

		expect(response.status).toBe(400);
		expect(serverMocks.verifyRegistrationResponse).not.toHaveBeenCalled();
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
			onResponse(context: { response: Response }) {
				const setCookie = context.response.headers.get("Set-Cookie");
				expect(setCookie).toBeDefined();
				expect(setCookie).toContain("better-auth-passkey");
			},
		});
	});

	it("should generate register options without session when resolveUser is provided", async () => {
		const { auth: preAuth } = await getTestInstance({
			plugins: [
				passkey({
					registration: {
						requireSession: false,
						resolveUser: async () => ({
							id: "pre-auth-user",
							name: "pre-auth@example.com",
						}),
					},
				}),
			],
		});

		const options = await preAuth.api.generatePasskeyRegistrationOptions({});

		expect(options).toBeDefined();
		expect(options).toHaveProperty("challenge");
		expect(options).toHaveProperty("rp");
		expect(options).toHaveProperty("user");
		expect(options).toHaveProperty("pubKeyCredParams");
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9866
	 */
	it("should create a session after pre-auth passkey registration", async () => {
		let userId = "";
		const {
			auth: preAuth,
			client: preAuthClient,
			cookieSetter,
		} = await getTestInstance({
			plugins: [
				passkey({
					registration: {
						requireSession: false,
						resolveUser: async () => ({
							id: "pending-passkey-registration",
							name: "passkey-first@example.com",
						}),
						afterVerification: async ({ ctx }) => {
							const user = await ctx.context.internalAdapter.createUser(
								{
									name: "Passkey First",
									email: "passkey-first@example.com",
								},
								{ method: "test" },
							);
							userId = user.id;
							return { userId };
						},
					},
				}),
			],
		});
		const headers = new Headers({ origin: "http://localhost:3000" });
		const setCookie = cookieSetter(headers);

		await preAuthClient.$fetch("/passkey/generate-register-options", {
			method: "GET",
			onResponse: setCookie,
		});
		serverMocks.verifyRegistrationResponse.mockResolvedValue(
			mockRegistrationVerification,
		);

		const result = await preAuth.api.verifyPasskeyRegistration({
			headers,
			body: {
				response: mockRegistrationResponse,
				createSession: true,
			},
			returnHeaders: true,
		});

		expect(result.response).toMatchObject({
			credentialID: mockRegistrationVerification.registrationInfo.credential.id,
			session: { userId },
			user: { id: userId },
		});
		expect(result.headers.get("set-cookie")).toContain(
			"better-auth.session_token=",
		);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9866
	 */
	it("should roll back passkey persistence when session creation fails", async () => {
		let userId = "";
		const {
			auth: preAuth,
			client: preAuthClient,
			cookieSetter,
		} = await getTestInstance({
			plugins: [
				passkey({
					registration: {
						requireSession: false,
						resolveUser: async () => ({
							id: "pending-failed-registration",
							name: "failed-session@example.com",
						}),
						afterVerification: async ({ ctx }) => {
							const user = await ctx.context.internalAdapter.createUser(
								{
									name: "Failed Session",
									email: "failed-session@example.com",
								},
								{ method: "test" },
							);
							userId = user.id;
							return { userId };
						},
					},
				}),
			],
		});
		const headers = new Headers({ origin: "http://localhost:3000" });
		const setCookie = cookieSetter(headers);

		await preAuthClient.$fetch("/passkey/generate-register-options", {
			method: "GET",
			onResponse: setCookie,
		});
		serverMocks.verifyRegistrationResponse.mockResolvedValue(
			mockRegistrationVerification,
		);
		const context = await preAuth.$context;
		const createSession = vi
			.spyOn(context.internalAdapter, "createSession")
			.mockResolvedValueOnce(null as never);

		try {
			await expect(
				preAuth.api.verifyPasskeyRegistration({
					headers,
					body: {
						response: mockRegistrationResponse,
						createSession: true,
					},
				}),
			).rejects.toMatchObject({
				status: "INTERNAL_SERVER_ERROR",
				body: { code: "UNABLE_TO_CREATE_SESSION" },
			});
		} finally {
			createSession.mockRestore();
		}

		const passkeys = await context.adapter.findMany<Passkey>({
			model: "passkey",
			where: [
				{
					field: "credentialID",
					value: mockRegistrationVerification.registrationInfo.credential.id,
				},
			],
		});
		expect(passkeys).toHaveLength(0);
		expect(await context.internalAdapter.findUserById(userId)).toBeNull();
	});

	it("should require resolveUser when session is not available", async () => {
		const { auth: preAuth } = await getTestInstance({
			plugins: [
				passkey({
					registration: {
						requireSession: false,
					},
				}),
			],
		});

		await expect(
			preAuth.api.generatePasskeyRegistrationOptions({}),
		).rejects.toThrowError(APIError);
	});

	it("should call afterVerification and allow userId override", async () => {
		let linkedUserId = "";
		const afterVerification = vi.fn(async () => ({
			userId: linkedUserId,
		}));
		const {
			auth: preAuth,
			client,
			cookieSetter,
		} = await getTestInstance({
			plugins: [
				passkey({
					registration: {
						requireSession: false,
						resolveUser: async () => ({
							id: "pre-auth-user-id",
							name: "pre-auth@example.com",
							displayName: "Pre-auth user",
						}),
						afterVerification,
					},
				}),
			],
		});
		const signUp = await preAuth.api.signUpEmail({
			body: {
				email: "linked-user@example.com",
				password: "test123456",
				name: "Linked User",
			},
		});
		linkedUserId = signUp.user.id;
		serverMocks.verifyRegistrationResponse.mockResolvedValue(
			mockRegistrationVerification,
		);
		const headers = new Headers();
		headers.set("origin", "http://localhost:3000");
		const setCookie = cookieSetter(headers);

		await client.$fetch("/passkey/generate-register-options", {
			method: "GET",
			query: {
				context: "link-token",
			},
			onResponse: setCookie,
		});

		const passkeyRecord = await preAuth.api.verifyPasskeyRegistration({
			headers,
			body: {
				response: mockRegistrationResponse,
			},
		});

		expect(serverMocks.verifyRegistrationResponse).toHaveBeenCalled();
		expect(afterVerification).toHaveBeenCalledWith(
			expect.objectContaining({
				context: "link-token",
			}),
		);
		expect(passkeyRecord).not.toBeNull();
		expect(passkeyRecord!.userId).toBe(linkedUserId);
	});

	it("should reject invalid userId returned from afterVerification", async () => {
		let resolvedUserId = "";
		const afterVerification = vi.fn(async () => ({
			userId: 123 as unknown as string,
		}));
		const {
			auth: preAuth,
			client,
			cookieSetter,
		} = await getTestInstance({
			plugins: [
				passkey({
					registration: {
						requireSession: false,
						resolveUser: async () => ({
							id: resolvedUserId,
							name: "pre-auth@example.com",
						}),
						afterVerification,
					},
				}),
			],
		});
		const signUp = await preAuth.api.signUpEmail({
			body: {
				email: "invalid-user-id@example.com",
				password: "test123456",
				name: "Invalid User Id Test",
			},
		});
		resolvedUserId = signUp.user.id;
		serverMocks.verifyRegistrationResponse.mockResolvedValue(
			mockRegistrationVerification,
		);
		const headers = new Headers();
		headers.set("origin", "http://localhost:3000");
		const setCookie = cookieSetter(headers);

		await client.$fetch("/passkey/generate-register-options", {
			method: "GET",
			query: {
				context: "link-token",
			},
			onResponse: setCookie,
		});

		await expect(
			preAuth.api.verifyPasskeyRegistration({
				headers,
				body: {
					response: mockRegistrationResponse,
				},
			}),
		).rejects.toThrowError(APIError);
		expect(afterVerification).toHaveBeenCalled();
	});

	it("should reject afterVerification override that mismatches session user", async () => {
		const afterVerification = vi.fn(async () => ({
			userId: "different-user-id",
		}));
		const {
			auth: sessionAuth,
			client,
			cookieSetter,
			signInWithTestUser,
		} = await getTestInstance({
			plugins: [
				passkey({
					registration: {
						afterVerification,
					},
				}),
			],
		});
		serverMocks.verifyRegistrationResponse.mockResolvedValue(
			mockRegistrationVerification,
		);
		const { headers } = await signInWithTestUser();
		headers.set("origin", "http://localhost:3000");
		const setCookie = cookieSetter(headers);

		await client.$fetch("/passkey/generate-register-options", {
			method: "GET",
			headers,
			onResponse: setCookie,
		});

		await expect(
			sessionAuth.api.verifyPasskeyRegistration({
				headers,
				body: {
					response: mockRegistrationResponse,
				},
			}),
		).rejects.toThrowError(APIError);
		expect(afterVerification).toHaveBeenCalled();
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

	it("rejects a whitespace-only passkey name on update", async () => {
		const { headers, user } = await signInWithTestUser();
		const context = await auth.$context;
		const passkey = await context.adapter.create<Omit<Passkey, "id">, Passkey>({
			model: "passkey",
			data: {
				userId: user.id,
				publicKey: "mockPublicKey",
				name: "original",
				counter: 0,
				deviceType: "singleDevice",
				credentialID: "update-reject-cred",
				createdAt: new Date(),
				backedUp: false,
				transports: "internal",
				aaguid: "mockAAGUID",
			} satisfies Omit<Passkey, "id">,
		});
		await expect(
			auth.api.updatePasskey({
				headers,
				body: { id: passkey.id, name: "   " },
			}),
		).rejects.toMatchObject({ status: 400 });
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

	/**
	 * @see https://github.com/better-auth/better-auth/security/advisories/GHSA-4vcf-q4xf-f48m
	 */
	it("should not allow deleting another user's passkey", async () => {
		const { user: userA } = await signInWithTestUser();
		const context = await auth.$context;

		const passkey = await context.adapter.create<Omit<Passkey, "id">, Passkey>({
			model: "passkey",
			data: {
				userId: userA.id,
				publicKey: "mockPublicKey",
				name: "userA-passkey",
				counter: 0,
				deviceType: "singleDevice",
				credentialID: "cross-user-delete-test",
				createdAt: new Date(),
				backedUp: false,
				transports: "mockTransports",
				aaguid: "mockAAGUID",
			} satisfies Omit<Passkey, "id">,
		});

		await client.signUp.email(
			{
				email: "attacker-delete@test.com",
				password: "password123",
				name: "Attacker",
			},
			{ throw: true },
		);
		const headersB = new Headers();
		await client.signIn.email(
			{ email: "attacker-delete@test.com", password: "password123" },
			{ throw: true, onSuccess: sessionSetter(headersB) },
		);

		await expect(
			auth.api.deletePasskey({
				headers: headersB,
				body: { id: passkey.id },
			}),
		).rejects.toThrowError(APIError);

		const stillExists = await context.adapter.findOne({
			model: "passkey",
			where: [{ field: "id", value: passkey.id }],
		});
		expect(stillExists).not.toBeNull();
	});

	it("should not allow deleting the only passkey when user has no other sign-in method", async () => {
		const {
			auth: testAuth,
			client: testClient,
			cookieSetter,
		} = await getTestInstance({
			plugins: [
				passkey({
					registration: {
						requireSession: false,
						resolveUser: async () => ({
							id: "passkey-only-user",
							name: "only-passkey@example.com",
						}),
						afterVerification: async ({ ctx }) => {
							const user = await ctx.context.internalAdapter.createUser(
								{
									name: "Passkey Only User",
									email: "only-passkey@example.com",
								},
								{ method: "test" },
							);
							return { userId: user.id };
						},
					},
				}),
			],
		});

		const headers = new Headers({ origin: "http://localhost:3000" });
		const setCookie = cookieSetter(headers);

		await testClient.$fetch("/passkey/generate-register-options", {
			method: "GET",
			onResponse: setCookie,
		});

		serverMocks.verifyRegistrationResponse.mockResolvedValue(
			mockRegistrationVerification,
		);

		const registerRes = await testClient.$fetch<{
			id: string;
			session: { token: string };
			user: { id: string };
		}>("/passkey/verify-registration", {
			method: "POST",
			headers,
			body: {
				response: mockRegistrationResponse,
				createSession: true,
			},
			onResponse: setCookie,
		});

		const passkeyId = registerRes.data?.id!;
		expect(passkeyId).toBeDefined();

		await expect(
			testAuth.api.deletePasskey({
				headers,
				body: { id: passkeyId },
			}),
		).rejects.toThrowError(
			PASSKEY_ERROR_CODES.FAILED_TO_DELETE_LAST_PASSKEY.message,
		);

		const context = await testAuth.$context;
		const stillExists = await context.adapter.findOne({
			model: "passkey",
			where: [{ field: "id", value: passkeyId }],
		});
		expect(stillExists).not.toBeNull();
	});

	it("should allow deleting the only passkey when allowDeletingOnlyPasskey is true", async () => {
		const {
			auth: testAuth,
			client: testClient,
			cookieSetter,
		} = await getTestInstance({
			plugins: [
				passkey({
					allowDeletingOnlyPasskey: true,
					registration: {
						requireSession: false,
						resolveUser: async () => ({
							id: "passkey-only-user-override",
							name: "only-passkey-override@example.com",
						}),
						afterVerification: async ({ ctx }) => {
							const user = await ctx.context.internalAdapter.createUser(
								{
									name: "Passkey Only User",
									email: "only-passkey@example.com",
								},
								{ method: "test" },
							);
							return { userId: user.id };
						},
					},
				}),
			],
		});

		const headers = new Headers({ origin: "http://localhost:3000" });
		const setCookie = cookieSetter(headers);

		await testClient.$fetch("/passkey/generate-register-options", {
			method: "GET",
			onResponse: setCookie,
		});

		serverMocks.verifyRegistrationResponse.mockResolvedValue(
			mockRegistrationVerification,
		);

		const registerRes = await testClient.$fetch<{
			id: string;
			session: { token: string };
			user: { id: string };
		}>("/passkey/verify-registration", {
			method: "POST",
			headers,
			body: {
				response: mockRegistrationResponse,
				createSession: true,
			},
			onResponse: setCookie,
		});

		const passkeyId = registerRes.data?.id!;
		expect(passkeyId).toBeDefined();

		const result = await testAuth.api.deletePasskey({
			headers,
			body: { id: passkeyId },
		});
		expect(result.status).toBe(true);

		const context = await testAuth.$context;
		const stillExists = await context.adapter.findOne({
			model: "passkey",
			where: [{ field: "id", value: passkeyId }],
		});
		expect(stillExists).toBeNull();
	});

	it("should allow deleting a passkey when user has multiple passkeys but prevent deleting the last remaining passkey", async () => {
		let testUserId = "";
		const {
			auth: testAuth,
			client: testClient,
			cookieSetter,
		} = await getTestInstance({
			plugins: [
				passkey({
					registration: {
						requireSession: false,
						resolveUser: async () => ({
							id: "passkey-multi-user",
							name: "multi-passkey@example.com",
						}),
						afterVerification: async ({ ctx }) => {
							const user = await ctx.context.internalAdapter.createUser(
								{
									name: "Multi Passkey User",
									email: "multi-passkey@example.com",
								},
								{ method: "test" },
							);
							testUserId = user.id;
							return { userId: user.id };
						},
					},
				}),
			],
		});

		const headers = new Headers({ origin: "http://localhost:3000" });
		const setCookie = cookieSetter(headers);

		await testClient.$fetch("/passkey/generate-register-options", {
			method: "GET",
			onResponse: setCookie,
		});

		serverMocks.verifyRegistrationResponse.mockResolvedValue(
			mockRegistrationVerification,
		);

		const registerRes1 = await testClient.$fetch<{
			id: string;
			session: { token: string };
			user: { id: string };
		}>("/passkey/verify-registration", {
			method: "POST",
			headers,
			body: {
				response: mockRegistrationResponse,
				createSession: true,
			},
			onResponse: setCookie,
		});

		const passkey1Id = registerRes1.data?.id!;
		expect(passkey1Id).toBeDefined();

		// Create a second passkey for this user directly via adapter
		const context = await testAuth.$context;
		const passkey2 = await context.adapter.create<Omit<Passkey, "id">, Passkey>(
			{
				model: "passkey",
				data: {
					userId: testUserId,
					publicKey: "mockPublicKey2",
					name: "second-passkey",
					counter: 0,
					deviceType: "singleDevice",
					credentialID: "mockCredentialID2",
					createdAt: new Date(),
					backedUp: false,
					transports: "mockTransports",
					aaguid: "mockAAGUID",
				} satisfies Omit<Passkey, "id">,
			},
		);

		// Deleting passkey1 should succeed because passkey2 still exists
		const result1 = await testAuth.api.deletePasskey({
			headers,
			body: { id: passkey1Id },
		});
		expect(result1.status).toBe(true);

		const passkey1StillExists = await context.adapter.findOne({
			model: "passkey",
			where: [{ field: "id", value: passkey1Id }],
		});
		expect(passkey1StillExists).toBeNull();

		// Now passkey2 is the only passkey left and user has no accounts -> deletion should fail
		await expect(
			testAuth.api.deletePasskey({
				headers,
				body: { id: passkey2.id },
			}),
		).rejects.toThrowError(
			PASSKEY_ERROR_CODES.FAILED_TO_DELETE_LAST_PASSKEY.message,
		);

		const passkey2StillExists = await context.adapter.findOne({
			model: "passkey",
			where: [{ field: "id", value: passkey2.id }],
		});
		expect(passkey2StillExists).not.toBeNull();
	});

	it("should allow unlinking the last account when user has a passkey, but prevent deleting the only remaining passkey afterwards", async () => {
		const { auth: testAuth, signInWithTestUser: testSignInWithTestUser } =
			await getTestInstance({
				plugins: [passkey()],
			});

		const { user, headers } = await testSignInWithTestUser();
		const context = await testAuth.$context;

		const accounts = await context.internalAdapter.findAccounts(user.id);
		expect(accounts.length).toBe(1);

		const createdPasskey = await context.adapter.create<
			Omit<Passkey, "id">,
			Passkey
		>({
			model: "passkey",
			data: {
				userId: user.id,
				publicKey: "mockPublicKey",
				name: "my-passkey",
				counter: 0,
				deviceType: "singleDevice",
				credentialID: "unlink-last-account-test",
				createdAt: new Date(),
				backedUp: false,
				transports: "mockTransports",
				aaguid: "mockAAGUID",
			} satisfies Omit<Passkey, "id">,
		});

		// User has 1 account and 1 passkey: unlinking the account should succeed
		const unlinkRes = await testAuth.api.unlinkAccount({
			headers,
			body: {
				accountId: accounts[0]!.id,
			},
		});
		expect(unlinkRes.status).toBe(true);

		// Now user has 0 accounts and 1 passkey: deleting the passkey must fail
		await expect(
			testAuth.api.deletePasskey({
				headers,
				body: { id: createdPasskey.id },
			}),
		).rejects.toThrowError(
			PASSKEY_ERROR_CODES.FAILED_TO_DELETE_LAST_PASSKEY.message,
		);

		const passkeyStillExists = await context.adapter.findOne({
			model: "passkey",
			where: [{ field: "id", value: createdPasskey.id }],
		});
		expect(passkeyStillExists).not.toBeNull();
	});

	it("should allow deleting the only passkey when user has verified email and passwordless magic-link enabled", async () => {
		const { auth: testAuth, signInWithTestUser: testSignInWithTestUser } =
			await getTestInstance({
				plugins: [
					passkey(),
					{
						id: "magic-link",
					},
				],
			});

		const { user, headers } = await testSignInWithTestUser();
		const context = await testAuth.$context;

		// Delete all accounts so user has 0 accounts, but verified email
		await context.adapter.deleteMany({
			model: "account",
			where: [{ field: "userId", value: user.id }],
		});
		await context.adapter.update({
			model: "user",
			where: [{ field: "id", value: user.id }],
			update: { emailVerified: true },
		});

		const createdPasskey = await context.adapter.create<
			Omit<Passkey, "id">,
			Passkey
		>({
			model: "passkey",
			data: {
				userId: user.id,
				publicKey: "mockPublicKey",
				name: "magic-link-user-passkey",
				counter: 0,
				deviceType: "singleDevice",
				credentialID: "magic-link-passkey-cred",
				createdAt: new Date(),
				backedUp: false,
				transports: "mockTransports",
				aaguid: "mockAAGUID",
			} satisfies Omit<Passkey, "id">,
		});

		const deleteRes = await testAuth.api.deletePasskey({
			headers,
			body: { id: createdPasskey.id },
		});
		expect(deleteRes.status).toBe(true);

		const passkeyStillExists = await context.adapter.findOne({
			model: "passkey",
			where: [{ field: "id", value: createdPasskey.id }],
		});
		expect(passkeyStillExists).toBeNull();
	});

	it("should not allow deleting the only passkey when user's only account is for a disabled provider", async () => {
		const { auth: testAuth, signInWithTestUser: testSignInWithTestUser } =
			await getTestInstance({
				emailAndPassword: {
					enabled: true as boolean,
				},
				plugins: [passkey()],
			});

		const { user, headers } = await testSignInWithTestUser();
		const context = await testAuth.$context;

		const createdPasskey = await context.adapter.create<
			Omit<Passkey, "id">,
			Passkey
		>({
			model: "passkey",
			data: {
				userId: user.id,
				publicKey: "mockPublicKey",
				name: "disabled-provider-passkey",
				counter: 0,
				deviceType: "singleDevice",
				credentialID: "disabled-provider-passkey-cred",
				createdAt: new Date(),
				backedUp: false,
				transports: "mockTransports",
				aaguid: "mockAAGUID",
			} satisfies Omit<Passkey, "id">,
		});

		context.options.emailAndPassword = { enabled: false };

		await expect(
			testAuth.api.deletePasskey({
				headers,
				body: { id: createdPasskey.id },
			}),
		).rejects.toThrowError(
			PASSKEY_ERROR_CODES.FAILED_TO_DELETE_LAST_PASSKEY.message,
		);

		const passkeyStillExists = await context.adapter.findOne({
			model: "passkey",
			where: [{ field: "id", value: createdPasskey.id }],
		});
		expect(passkeyStillExists).not.toBeNull();
	});

	it("should allow deleting the only passkey when user has a configured SSO provider account", async () => {
		const { auth: testAuth, signInWithTestUser: testSignInWithTestUser } =
			await getTestInstance({
				plugins: [
					passkey(),
					{
						id: "sso",
						options: {
							defaultSSO: [
								{
									providerId: "workforce",
									domain: "example.com",
								},
							],
						},
					},
				],
			});

		const { user, headers } = await testSignInWithTestUser();
		const context = await testAuth.$context;

		// Delete credential account and create an SSO account
		await context.adapter.deleteMany({
			model: "account",
			where: [{ field: "userId", value: user.id }],
		});
		await context.internalAdapter.createAccount({
			userId: user.id,
			providerId: "workforce",
			accountId: "workforce-sso-account-id",
		});

		const createdPasskey = await context.adapter.create<
			Omit<Passkey, "id">,
			Passkey
		>({
			model: "passkey",
			data: {
				userId: user.id,
				publicKey: "mockPublicKey",
				name: "sso-user-passkey",
				counter: 0,
				deviceType: "singleDevice",
				credentialID: "sso-user-passkey-cred",
				createdAt: new Date(),
				backedUp: false,
				transports: "mockTransports",
				aaguid: "mockAAGUID",
			} satisfies Omit<Passkey, "id">,
		});

		const deleteRes = await testAuth.api.deletePasskey({
			headers,
			body: { id: createdPasskey.id },
		});
		expect(deleteRes.status).toBe(true);

		const passkeyStillExists = await context.adapter.findOne({
			model: "passkey",
			where: [{ field: "id", value: createdPasskey.id }],
		});
		expect(passkeyStillExists).toBeNull();
	});

	it("should not allow deleting the only passkey when credential account has no password", async () => {
		const { auth: testAuth, signInWithTestUser: testSignInWithTestUser } =
			await getTestInstance({
				plugins: [passkey()],
			});

		const { user, headers } = await testSignInWithTestUser();
		const context = await testAuth.$context;

		const accounts = await context.internalAdapter.findAccounts(user.id);
		const credentialAccount = accounts.find(
			(a) => a.providerId === "credential",
		)!;

		// Clear password on credential account
		await context.adapter.update({
			model: "account",
			where: [{ field: "id", value: credentialAccount.id }],
			update: { password: null },
		});

		const createdPasskey = await context.adapter.create<
			Omit<Passkey, "id">,
			Passkey
		>({
			model: "passkey",
			data: {
				userId: user.id,
				publicKey: "mockPublicKey",
				name: "no-password-passkey",
				counter: 0,
				deviceType: "singleDevice",
				credentialID: "no-password-passkey-cred",
				createdAt: new Date(),
				backedUp: false,
				transports: "mockTransports",
				aaguid: "mockAAGUID",
			} satisfies Omit<Passkey, "id">,
		});

		await expect(
			testAuth.api.deletePasskey({
				headers,
				body: { id: createdPasskey.id },
			}),
		).rejects.toThrowError(
			PASSKEY_ERROR_CODES.FAILED_TO_DELETE_LAST_PASSKEY.message,
		);

		const passkeyStillExists = await context.adapter.findOne({
			model: "passkey",
			where: [{ field: "id", value: createdPasskey.id }],
		});
		expect(passkeyStillExists).not.toBeNull();
	});

	it("should allow deleting the only passkey when email was verified in database even if session user was unverified", async () => {
		const { auth: testAuth, signInWithTestUser: testSignInWithTestUser } =
			await getTestInstance({
				plugins: [
					passkey(),
					{
						id: "magic-link",
					},
				],
			});

		const { user, headers } = await testSignInWithTestUser();
		const context = await testAuth.$context;

		// Ensure user started unverified in session
		expect(user.emailVerified).toBe(false);

		// Delete all accounts so user has 0 accounts
		await context.adapter.deleteMany({
			model: "account",
			where: [{ field: "userId", value: user.id }],
		});

		// Now mark emailVerified in DB directly
		await context.adapter.update({
			model: "user",
			where: [{ field: "id", value: user.id }],
			update: { emailVerified: true },
		});

		const createdPasskey = await context.adapter.create<
			Omit<Passkey, "id">,
			Passkey
		>({
			model: "passkey",
			data: {
				userId: user.id,
				publicKey: "mockPublicKey",
				name: "committed-email-passkey",
				counter: 0,
				deviceType: "singleDevice",
				credentialID: "committed-email-passkey-cred",
				createdAt: new Date(),
				backedUp: false,
				transports: "mockTransports",
				aaguid: "mockAAGUID",
			} satisfies Omit<Passkey, "id">,
		});

		const deleteRes = await testAuth.api.deletePasskey({
			headers,
			body: { id: createdPasskey.id },
		});
		expect(deleteRes.status).toBe(true);

		const passkeyStillExists = await context.adapter.findOne({
			model: "passkey",
			where: [{ field: "id", value: createdPasskey.id }],
		});
		expect(passkeyStillExists).toBeNull();
	});

	/**
	 * @see https://github.com/better-auth/better-auth/security/advisories/GHSA-4vcf-q4xf-f48m
	 */
	it("should not allow updating another user's passkey", async () => {
		const { user: userA } = await signInWithTestUser();
		const context = await auth.$context;

		const passkey = await context.adapter.create<Omit<Passkey, "id">, Passkey>({
			model: "passkey",
			data: {
				userId: userA.id,
				publicKey: "mockPublicKey",
				name: "original-name",
				counter: 0,
				deviceType: "singleDevice",
				credentialID: "cross-user-update-test",
				createdAt: new Date(),
				backedUp: false,
				transports: "mockTransports",
				aaguid: "mockAAGUID",
			} satisfies Omit<Passkey, "id">,
		});

		await client.signUp.email(
			{
				email: "attacker-update@test.com",
				password: "password123",
				name: "Attacker",
			},
			{ throw: true },
		);
		const headersB = new Headers();
		await client.signIn.email(
			{ email: "attacker-update@test.com", password: "password123" },
			{ throw: true, onSuccess: sessionSetter(headersB) },
		);

		await expect(
			auth.api.updatePasskey({
				headers: headersB,
				body: { id: passkey.id, name: "hacked" },
			}),
		).rejects.toThrowError(APIError);

		const unchanged = await context.adapter.findOne<Passkey>({
			model: "passkey",
			where: [{ field: "id", value: passkey.id }],
		});
		expect(unchanged?.name).toBe("original-name");
	});

	it("should verify passkey authentication and return user", async () => {
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

		const client = createAuthClient({
			plugins: [passkeyClient()],
			baseURL: "http://localhost:3000/api/auth",
			fetchOptions: {
				headers: headers,
				customFetchImpl,
			},
		});

		let passkeyCookie = "";
		await client.passkey.generateAuthenticateOptions({
			fetchOptions: {
				onResponse(context) {
					const setCookie = context.response.headers.get("Set-Cookie");
					if (setCookie) {
						passkeyCookie = setCookie.split(";")[0] ?? "";
					}
				},
			},
		});

		serverMocks.verifyAuthenticationResponse.mockResolvedValueOnce({
			verified: true,
			authenticationInfo: { newCounter: 1 },
		});

		const existingCookie = headers.get("cookie") ?? "";
		headers.set(
			"cookie",
			existingCookie ? `${existingCookie}; ${passkeyCookie}` : passkeyCookie,
		);
		headers.set("origin", "http://localhost:3000");

		const response = await auth.api.verifyPasskeyAuthentication({
			headers,
			body: {
				response: {
					id: "mockCredentialID",
					rawId: "mockRawId",
					response: {
						clientDataJSON: "mockClientDataJSON",
						authenticatorData: "mockAuthenticatorData",
						signature: "mockSignature",
						userHandle: "mockUserHandle",
					},
					type: "public-key",
					clientExtensionResults: {},
				},
			},
		});

		expect(response.session).toBeDefined();
		expect(response.user).toBeDefined();
		expect(response.user.id).toBe(user.id);
		expect(response.user.email).toBe(user.email);
	});

	it("should propagate inner APIError status when registration verification fails", async () => {
		const { headers } = await signInWithTestUser();
		headers.set("origin", "http://localhost:3000");
		const setCookie = cookieSetter(headers);

		await client.$fetch("/passkey/generate-register-options", {
			method: "GET",
			headers,
			onResponse: setCookie,
		});

		serverMocks.verifyRegistrationResponse.mockResolvedValueOnce({
			verified: false,
			registrationInfo: undefined,
		});

		let captured: APIError | undefined;
		try {
			await auth.api.verifyPasskeyRegistration({
				headers,
				body: { response: mockRegistrationResponse },
			});
		} catch (e) {
			captured = e as APIError;
		}

		expect(captured).toBeInstanceOf(APIError);
		expect(captured?.status).toBe("BAD_REQUEST");
		expect((captured?.body as { code?: string } | undefined)?.code).toBe(
			"FAILED_TO_VERIFY_REGISTRATION",
		);
	});

	it("should propagate inner APIError status when authentication verification fails", async () => {
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

		let passkeyCookie = "";
		await client.$fetch("/passkey/generate-authenticate-options", {
			method: "GET",
			headers,
			onResponse(ctx) {
				const setCookie = ctx.response.headers.get("Set-Cookie");
				if (setCookie) {
					passkeyCookie = setCookie.split(";")[0] ?? "";
				}
			},
		});

		const existingCookie = headers.get("cookie") ?? "";
		headers.set(
			"cookie",
			existingCookie ? `${existingCookie}; ${passkeyCookie}` : passkeyCookie,
		);
		headers.set("origin", "http://localhost:3000");

		serverMocks.verifyAuthenticationResponse.mockResolvedValueOnce({
			verified: false,
			authenticationInfo: { newCounter: 0 },
		});

		let captured: APIError | undefined;
		try {
			await auth.api.verifyPasskeyAuthentication({
				headers,
				body: {
					response: {
						id: "mockCredentialID",
						rawId: "mockRawId",
						response: {
							clientDataJSON: "mockClientDataJSON",
							authenticatorData: "mockAuthenticatorData",
							signature: "mockSignature",
							userHandle: "mockUserHandle",
						},
						type: "public-key",
						clientExtensionResults: {},
					},
				},
			});
		} catch (e) {
			captured = e as APIError;
		}

		expect(captured).toBeInstanceOf(APIError);
		expect(captured?.status).toBe("UNAUTHORIZED");
		expect((captured?.body as { code?: string } | undefined)?.code).toBe(
			"AUTHENTICATION_FAILED",
		);
	});

	it("should register at most one passkey under concurrent verification of the same challenge", async () => {
		let raceUserId = "";
		const {
			auth: raceAuth,
			client: raceClient,
			cookieSetter: raceCookieSetter,
		} = await getTestInstance({
			plugins: [
				passkey({
					registration: {
						requireSession: false,
						resolveUser: async () => ({
							id: raceUserId,
							name: "race@example.com",
						}),
					},
				}),
			],
		});

		const signedUp = await raceAuth.api.signUpEmail({
			body: {
				email: "race@example.com",
				password: "password1234",
				name: "Race User",
			},
		});
		raceUserId = signedUp.user.id;

		const headers = new Headers();
		headers.set("origin", "http://localhost:3000");
		const setCookie = raceCookieSetter(headers);

		await raceClient.$fetch("/passkey/generate-register-options", {
			method: "GET",
			onResponse: setCookie,
		});

		let release: () => void = () => {};
		const gate = new Promise<void>((r) => {
			release = r;
		});
		serverMocks.verifyRegistrationResponse.mockImplementation(async () => {
			await gate;
			return {
				verified: true,
				registrationInfo: {
					aaguid: "race-aaguid",
					credentialDeviceType: "singleDevice",
					credentialBackedUp: false,
					credential: {
						id: "race-reg-credential-id",
						publicKey: new Uint8Array([1, 2, 3]),
						counter: 0,
					},
				},
			};
		});

		const body = {
			response: {
				id: "race-reg-credential-id",
				response: { transports: ["internal"] },
			},
		};

		const settle = (
			p: ReturnType<typeof raceAuth.api.verifyPasskeyRegistration>,
		) =>
			p
				.then((v) => ({ ok: true as const, v }))
				.catch((e) => ({ ok: false as const, e }));
		const reqA = settle(
			raceAuth.api.verifyPasskeyRegistration({
				headers: new Headers(headers),
				body,
			}),
		);
		const reqB = settle(
			raceAuth.api.verifyPasskeyRegistration({
				headers: new Headers(headers),
				body,
			}),
		);

		for (let i = 0; i < 50; i++) {
			await new Promise((r) => setImmediate(r));
		}
		release();
		await Promise.all([reqA, reqB]);

		const raceContext = await raceAuth.$context;
		const rows = await raceContext.adapter.findMany<Passkey>({
			model: "passkey",
			where: [{ field: "credentialID", value: "race-reg-credential-id" }],
		});
		expect(rows.length).toBe(1);
	});

	it("should mint at most one session under concurrent verification of the same challenge", async () => {
		const { headers, user } = await signInWithTestUser();
		const context = await auth.$context;

		await context.adapter.create<Omit<Passkey, "id">, Passkey>({
			model: "passkey",
			data: {
				userId: user.id,
				publicKey: "mockPublicKey",
				name: "race-passkey",
				counter: 0,
				deviceType: "singleDevice",
				credentialID: "race-credential-id",
				createdAt: new Date(),
				backedUp: false,
				transports: "internal",
				aaguid: "mockAAGUID",
			} satisfies Omit<Passkey, "id">,
		});

		let passkeyCookie = "";
		await client.$fetch("/passkey/generate-authenticate-options", {
			method: "GET",
			headers,
			onResponse(ctx) {
				const setCookie = ctx.response.headers.get("Set-Cookie");
				if (setCookie) {
					passkeyCookie = setCookie.split(";")[0] ?? "";
				}
			},
		});

		const existingCookie = headers.get("cookie") ?? "";
		headers.set(
			"cookie",
			existingCookie ? `${existingCookie}; ${passkeyCookie}` : passkeyCookie,
		);
		headers.set("origin", "http://localhost:3000");

		serverMocks.verifyAuthenticationResponse.mockResolvedValue({
			verified: true,
			authenticationInfo: { newCounter: 1 },
		});

		const body = {
			response: {
				id: "race-credential-id",
				rawId: "race-credential-id",
				response: {
					clientDataJSON: "mockClientDataJSON",
					authenticatorData: "mockAuthenticatorData",
					signature: "mockSignature",
					userHandle: "mockUserHandle",
				},
				type: "public-key" as const,
				clientExtensionResults: {},
			},
		};

		const settle = (
			p: ReturnType<typeof auth.api.verifyPasskeyAuthentication>,
		) =>
			p
				.then((v) => ({ ok: true as const, v }))
				.catch((e) => ({ ok: false as const, e }));
		const results = await Promise.all([
			settle(
				auth.api.verifyPasskeyAuthentication({
					headers: new Headers(headers),
					body,
				}),
			),
			settle(
				auth.api.verifyPasskeyAuthentication({
					headers: new Headers(headers),
					body,
				}),
			),
		]);
		const fulfilled = results.filter((r) => r.ok);
		expect(fulfilled.length).toBe(1);
	});

	it("should reject when the WebAuthn challenge is not consumable", async () => {
		const headers = new Headers();
		headers.set("origin", "http://localhost:3000");
		const setCookie = cookieSetter(headers);
		await client.$fetch("/passkey/generate-authenticate-options", {
			method: "GET",
			headers,
			onResponse: setCookie,
		});

		const context = await auth.$context;
		const consumeSpy = vi
			.spyOn(context.internalAdapter, "consumeVerificationValue")
			.mockResolvedValueOnce(null);

		try {
			await expect(
				auth.api.verifyPasskeyAuthentication({
					headers,
					body: {
						response: {
							id: "",
							rawId: "",
							response: {
								clientDataJSON: "",
								authenticatorData: "",
								signature: "",
							},
							clientExtensionResults: {},
							type: "public-key" as const,
						},
					},
				}),
			).rejects.toMatchObject({
				status: "BAD_REQUEST",
				body: { code: "CHALLENGE_NOT_FOUND" },
			});
			expect(consumeSpy).toHaveBeenCalledOnce();
		} finally {
			consumeSpy.mockRestore();
		}
	});
});

describe("passkey ceremony and identity gating", async () => {
	afterEach(() => {
		serverMocks.verifyRegistrationResponse.mockReset();
		serverMocks.verifyAuthenticationResponse.mockReset();
	});

	// A challenge minted for one ceremony must never be accepted by the other
	// verifier: the stored challenge carries a ceremony-type marker, and a
	// registration ceremony cannot consume an authentication challenge.
	it("rejects a registration that reuses an authentication challenge in pre-auth mode", async () => {
		const {
			auth: preAuth,
			client: preAuthClient,
			cookieSetter,
		} = await getTestInstance({
			plugins: [
				passkey({
					registration: {
						requireSession: false,
						resolveUser: async () => ({
							id: "resolved-user-id",
							name: "resolved@example.com",
						}),
					},
				}),
			],
		});

		const headers = new Headers();
		headers.set("origin", "http://localhost:3000");
		const setCookie = cookieSetter(headers);

		// Unauthenticated caller obtains an authentication challenge.
		await preAuthClient.$fetch("/passkey/generate-authenticate-options", {
			method: "GET",
			onResponse: setCookie,
		});

		serverMocks.verifyRegistrationResponse.mockResolvedValue(
			mockRegistrationVerification,
		);

		await expect(
			preAuth.api.verifyPasskeyRegistration({
				headers,
				body: { response: mockRegistrationResponse },
			}),
		).rejects.toMatchObject({
			status: "BAD_REQUEST",
			body: { code: "CHALLENGE_NOT_FOUND" },
		});

		// The registration verifier must reject before touching the WebAuthn
		// library or persisting a passkey row.
		expect(serverMocks.verifyRegistrationResponse).not.toHaveBeenCalled();

		const context = await preAuth.$context;
		const rows = await context.adapter.findMany<Passkey>({
			model: "passkey",
			where: [{ field: "credentialID", value: mockRegistrationResponse.id }],
		});
		expect(rows.length).toBe(0);
	});

	it("rejects an authentication that reuses a registration challenge", async () => {
		const {
			auth: sessionAuth,
			client: sessionClient,
			cookieSetter,
			signInWithTestUser,
		} = await getTestInstance({
			plugins: [passkey()],
		});

		const { headers, user } = await signInWithTestUser();
		headers.set("origin", "http://localhost:3000");
		const setCookie = cookieSetter(headers);

		const context = await sessionAuth.$context;
		await context.adapter.create<Omit<Passkey, "id">, Passkey>({
			model: "passkey",
			data: {
				userId: user.id,
				publicKey: "mockPublicKey",
				name: "cross-ceremony-passkey",
				counter: 0,
				deviceType: "singleDevice",
				credentialID: "cross-ceremony-credential-id",
				createdAt: new Date(),
				backedUp: false,
				transports: "internal",
				aaguid: "mockAAGUID",
			} satisfies Omit<Passkey, "id">,
		});

		// Obtain a registration challenge, then try to spend it on authentication.
		await sessionClient.$fetch("/passkey/generate-register-options", {
			method: "GET",
			headers,
			onResponse: setCookie,
		});

		serverMocks.verifyAuthenticationResponse.mockResolvedValue({
			verified: true,
			authenticationInfo: { newCounter: 1 },
		});

		await expect(
			sessionAuth.api.verifyPasskeyAuthentication({
				headers,
				body: {
					response: {
						id: "cross-ceremony-credential-id",
						rawId: "cross-ceremony-credential-id",
						response: {
							clientDataJSON: "mockClientDataJSON",
							authenticatorData: "mockAuthenticatorData",
							signature: "mockSignature",
							userHandle: "mockUserHandle",
						},
						type: "public-key" as const,
						clientExtensionResults: {},
					},
				},
			}),
		).rejects.toMatchObject({
			status: "BAD_REQUEST",
			body: { code: "CHALLENGE_NOT_FOUND" },
		});

		expect(serverMocks.verifyAuthenticationResponse).not.toHaveBeenCalled();
	});

	// Even a well-formed registration challenge must not persist a passkey when
	// the resolved target user id is empty; an empty userId would dangle without
	// an owning account.
	it("rejects registration when the resolved target user id is empty", async () => {
		const {
			auth: preAuth,
			client: preAuthClient,
			cookieSetter,
		} = await getTestInstance({
			plugins: [
				passkey({
					registration: {
						requireSession: false,
						resolveUser: async () => ({
							id: "seed-user-id",
							name: "seed@example.com",
						}),
					},
				}),
			],
		});

		const headers = new Headers();
		headers.set("origin", "http://localhost:3000");
		const setCookie = cookieSetter(headers);

		// Generate a real registration challenge, then overwrite the stored target
		// user id with an empty string to exercise the final persistence guard.
		await preAuthClient.$fetch("/passkey/generate-register-options", {
			method: "GET",
			onResponse: setCookie,
		});

		const context = await preAuth.$context;
		const verifications = await context.adapter.findMany<Verification>({
			model: "verification",
		});
		const challenge = verifications[verifications.length - 1];
		assert(challenge);
		const parsed = JSON.parse(challenge.value);
		await context.adapter.update({
			model: "verification",
			where: [{ field: "id", value: challenge.id }],
			update: {
				value: JSON.stringify({
					...parsed,
					userData: { ...parsed.userData, id: "" },
				}),
			},
		});

		serverMocks.verifyRegistrationResponse.mockResolvedValue(
			mockRegistrationVerification,
		);

		await expect(
			preAuth.api.verifyPasskeyRegistration({
				headers,
				body: { response: mockRegistrationResponse },
			}),
		).rejects.toMatchObject({
			status: "BAD_REQUEST",
			body: { code: "RESOLVED_USER_INVALID" },
		});

		const rows = await context.adapter.findMany<Passkey>({
			model: "passkey",
			where: [{ field: "credentialID", value: mockRegistrationResponse.id }],
		});
		expect(rows.length).toBe(0);
	});
});

const buildRegistrationVerification = (
	aaguid: string,
	credentialID: string,
) => ({
	verified: true,
	registrationInfo: {
		aaguid,
		credentialDeviceType: "singleDevice",
		credentialBackedUp: false,
		credential: {
			id: credentialID,
			publicKey: new Uint8Array([1, 2, 3]),
			counter: 0,
		},
	},
});

// A known AAGUID, used to prove the server still does not derive a label from it.
const googleAaguid = "ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4";

describe("passkey registration naming (default options)", async () => {
	const { auth, client, cookieSetter, signInWithTestUser } =
		await getTestInstance({ plugins: [passkey()] });

	const register = async (opts: {
		aaguid: string;
		credentialID: string;
		name?: string;
	}) => {
		const { headers } = await signInWithTestUser();
		headers.set("origin", "http://localhost:3000");
		serverMocks.verifyRegistrationResponse.mockResolvedValue(
			buildRegistrationVerification(opts.aaguid, opts.credentialID),
		);
		await client.$fetch("/passkey/generate-register-options", {
			method: "GET",
			headers,
			onResponse: cookieSetter(headers),
		});
		return auth.api.verifyPasskeyRegistration({
			headers,
			body: {
				response: mockRegistrationResponse,
				...(opts.name === undefined ? {} : { name: opts.name }),
			},
		});
	};

	afterEach(() => {
		serverMocks.verifyRegistrationResponse.mockReset();
	});

	it("stores the trimmed client-provided name", async () => {
		const record = await register({
			aaguid: googleAaguid,
			credentialID: "cred-explicit",
			name: "  My Work Key  ",
		});
		expect(record.name).toBe("My Work Key");
	});

	it("stores no label for a whitespace-only name", async () => {
		const record = await register({
			aaguid: googleAaguid,
			credentialID: "cred-whitespace",
			name: "   ",
		});
		expect(record.name ?? null).toBeNull();
	});

	it("does not infer a label from the AAGUID, but persists the raw AAGUID", async () => {
		const record = await register({
			aaguid: googleAaguid,
			credentialID: "cred-no-name",
		});
		expect(record.name ?? null).toBeNull();
		expect(record.aaguid).toBe(googleAaguid);
	});
});

describe("passkey registration naming (afterVerification fallback)", async () => {
	const afterVerification = vi.fn(async () => ({ name: "My Provider" }));
	const { auth, client, cookieSetter, signInWithTestUser } =
		await getTestInstance({
			plugins: [passkey({ registration: { afterVerification } })],
		});

	const register = async (opts: {
		aaguid: string;
		credentialID: string;
		name?: string;
	}) => {
		const { headers } = await signInWithTestUser();
		headers.set("origin", "http://localhost:3000");
		serverMocks.verifyRegistrationResponse.mockResolvedValue(
			buildRegistrationVerification(opts.aaguid, opts.credentialID),
		);
		await client.$fetch("/passkey/generate-register-options", {
			method: "GET",
			headers,
			onResponse: cookieSetter(headers),
		});
		return auth.api.verifyPasskeyRegistration({
			headers,
			body: {
				response: mockRegistrationResponse,
				...(opts.name === undefined ? {} : { name: opts.name }),
			},
		});
	};

	afterEach(() => {
		serverMocks.verifyRegistrationResponse.mockReset();
	});

	it("uses the returned name when the client provides none", async () => {
		const record = await register({
			aaguid: googleAaguid,
			credentialID: "cred-fallback",
		});
		expect(record.name).toBe("My Provider");
	});

	it("falls back to the returned name when the client sends only whitespace", async () => {
		const record = await register({
			aaguid: googleAaguid,
			credentialID: "cred-whitespace-fallback",
			name: "   ",
		});
		expect(record.name).toBe("My Provider");
	});

	it("keeps the client-provided name over the returned one, but still runs the hook", async () => {
		const record = await register({
			aaguid: googleAaguid,
			credentialID: "cred-precedence",
			name: "Explicit Name",
		});
		expect(record.name).toBe("Explicit Name");
		expect(afterVerification).toHaveBeenCalled();
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
