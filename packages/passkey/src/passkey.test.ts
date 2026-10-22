import {
	createHash,
	generateKeyPairSync,
	randomBytes,
	sign,
} from "node:crypto";
import { APIError } from "@better-auth/core/error";
import {
	isoBase64URL,
	isoCBOR,
	isoUint8Array,
} from "@simplewebauthn/server/helpers";
import type { Verification } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
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
			database: memoryAdapter({
				user: [],
				session: [],
				account: [],
				verification: [],
				passkey: [],
			}),
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
			database: memoryAdapter({
				user: [],
				session: [],
				account: [],
				verification: [],
				passkey: [],
			}),
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

/**
 * @see https://github.com/better-auth/better-auth/issues/11929
 */
describe("passkey requireUserVerification", () => {
	const setup = async (options?: { requireUserVerification?: boolean }) => {
		const instance = await getTestInstance({
			plugins: [passkey(options)],
		});

		const register = async () => {
			const { headers } = await instance.signInWithTestUser();
			headers.set("origin", "http://localhost:3000");
			serverMocks.verifyRegistrationResponse.mockResolvedValueOnce(
				mockRegistrationVerification,
			);
			await instance.client.$fetch("/passkey/generate-register-options", {
				method: "GET",
				headers,
				onResponse: instance.cookieSetter(headers),
			});
			return instance.auth.api.verifyPasskeyRegistration({
				headers,
				body: { response: mockRegistrationResponse },
			});
		};

		const authenticate = async () => {
			const { headers, user } = await instance.signInWithTestUser();
			const context = await instance.auth.$context;
			await context.adapter.create<Omit<Passkey, "id">, Passkey>({
				model: "passkey",
				data: {
					userId: user.id,
					publicKey: "mockPublicKey",
					counter: 0,
					deviceType: "singleDevice",
					credentialID: "uv-credential-id",
					createdAt: new Date(),
					backedUp: false,
				} satisfies Omit<Passkey, "id">,
			});
			headers.set("origin", "http://localhost:3000");
			await instance.client.$fetch("/passkey/generate-authenticate-options", {
				method: "GET",
				headers,
				onResponse: instance.cookieSetter(headers),
			});
			serverMocks.verifyAuthenticationResponse.mockResolvedValueOnce({
				verified: true,
				authenticationInfo: { newCounter: 1 },
			});
			return instance.auth.api.verifyPasskeyAuthentication({
				headers,
				body: {
					response: {
						id: "uv-credential-id",
						rawId: "uv-credential-id",
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
		};

		return { ...instance, register, authenticate };
	};

	afterEach(() => {
		serverMocks.verifyRegistrationResponse.mockReset();
		serverMocks.verifyAuthenticationResponse.mockReset();
	});

	it("does not require user verification by default", async () => {
		const { auth, signInWithTestUser, register, authenticate } = await setup();
		const { headers } = await signInWithTestUser();

		const registrationOptions =
			await auth.api.generatePasskeyRegistrationOptions({ headers });
		expect(registrationOptions.authenticatorSelection?.userVerification).toBe(
			"preferred",
		);
		const authenticationOptions =
			await auth.api.generatePasskeyAuthenticationOptions({ headers });
		expect(authenticationOptions.userVerification).toBe("preferred");

		await register();
		expect(serverMocks.verifyRegistrationResponse).toHaveBeenCalledWith(
			expect.objectContaining({ requireUserVerification: false }),
		);
		await authenticate();
		expect(serverMocks.verifyAuthenticationResponse).toHaveBeenCalledWith(
			expect.objectContaining({ requireUserVerification: false }),
		);
	});

	it("requests user verification in generated options when enabled", async () => {
		const { auth, signInWithTestUser } = await setup({
			requireUserVerification: true,
		});
		const { headers } = await signInWithTestUser();

		const registrationOptions =
			await auth.api.generatePasskeyRegistrationOptions({ headers });
		expect(registrationOptions.authenticatorSelection?.userVerification).toBe(
			"required",
		);
		const authenticationOptions =
			await auth.api.generatePasskeyAuthenticationOptions({ headers });
		expect(authenticationOptions.userVerification).toBe("required");
	});

	it("overrides a weaker authenticatorSelection.userVerification when enabled", async () => {
		const instance = await getTestInstance({
			plugins: [
				passkey({
					requireUserVerification: true,
					authenticatorSelection: { userVerification: "discouraged" },
				}),
			],
		});
		const { headers } = await instance.signInWithTestUser();

		const options = await instance.auth.api.generatePasskeyRegistrationOptions({
			headers,
		});
		expect(options.authenticatorSelection?.userVerification).toBe("required");
	});

	it("enforces user verification on the server when enabled", async () => {
		const { register, authenticate } = await setup({
			requireUserVerification: true,
		});

		await register();
		expect(serverMocks.verifyRegistrationResponse).toHaveBeenCalledWith(
			expect.objectContaining({ requireUserVerification: true }),
		);
		await authenticate();
		expect(serverMocks.verifyAuthenticationResponse).toHaveBeenCalledWith(
			expect.objectContaining({ requireUserVerification: true }),
		);
	});
});

/**
 * Runs the real SimpleWebAuthn verification against responses signed by a
 * software authenticator, so the UV flag check itself is exercised.
 *
 * @see https://github.com/better-auth/better-auth/issues/11929
 */
describe("passkey requireUserVerification (real WebAuthn verification)", () => {
	const origin = "http://localhost:3000";
	const rpID = "localhost";
	const FLAG_USER_PRESENT = 0x01;
	const FLAG_USER_VERIFIED = 0x04;
	const FLAG_ATTESTED_CREDENTIAL_DATA = 0x40;

	const sha256 = (data: string | Uint8Array) =>
		new Uint8Array(createHash("sha256").update(data).digest());

	const createSoftwareAuthenticator = () => {
		const { privateKey, publicKey } = generateKeyPairSync("ec", {
			namedCurve: "P-256",
		});
		const jwk = publicKey.export({ format: "jwk" });
		assert(jwk.x && jwk.y);
		const cosePublicKey = isoCBOR.encode(
			new Map<number, number | Uint8Array>([
				[1, 2], // kty: EC2
				[3, -7], // alg: ES256
				[-1, 1], // crv: P-256
				[-2, isoBase64URL.toBuffer(jwk.x)],
				[-3, isoBase64URL.toBuffer(jwk.y)],
			]),
		);
		const rawCredentialID = new Uint8Array(randomBytes(16));
		const credentialID = isoBase64URL.fromBuffer(rawCredentialID);
		const rpIdHash = sha256(rpID);
		const signCount = new Uint8Array(4);
		const encodeClientData = (type: string, challenge: string) =>
			isoBase64URL.fromUTF8String(
				JSON.stringify({ type, challenge, origin, crossOrigin: false }),
			);

		const createAttestation = (challenge: string, userVerified: boolean) => {
			const flags =
				FLAG_USER_PRESENT |
				FLAG_ATTESTED_CREDENTIAL_DATA |
				(userVerified ? FLAG_USER_VERIFIED : 0);
			const authData = isoUint8Array.concat([
				rpIdHash,
				Uint8Array.of(flags),
				signCount,
				new Uint8Array(16), // AAGUID
				Uint8Array.of(0, rawCredentialID.length),
				rawCredentialID,
				cosePublicKey,
			]);
			const attestationObject = isoCBOR.encode(
				new Map<string, string | Uint8Array | Map<string, never>>([
					["fmt", "none"],
					["attStmt", new Map<string, never>()],
					["authData", authData],
				]),
			);
			return {
				id: credentialID,
				rawId: credentialID,
				type: "public-key" as const,
				response: {
					clientDataJSON: encodeClientData("webauthn.create", challenge),
					attestationObject: isoBase64URL.fromBuffer(attestationObject),
					transports: ["internal"],
				},
				clientExtensionResults: {},
			};
		};

		const createAssertion = (challenge: string, userVerified: boolean) => {
			const flags = FLAG_USER_PRESENT | (userVerified ? FLAG_USER_VERIFIED : 0);
			const authData = isoUint8Array.concat([
				rpIdHash,
				Uint8Array.of(flags),
				signCount,
			]);
			const clientDataJSON = encodeClientData("webauthn.get", challenge);
			const signature = sign(
				"sha256",
				isoUint8Array.concat([
					authData,
					sha256(isoBase64URL.toBuffer(clientDataJSON)),
				]),
				privateKey,
			);
			return {
				id: credentialID,
				rawId: credentialID,
				type: "public-key" as const,
				response: {
					clientDataJSON,
					authenticatorData: isoBase64URL.fromBuffer(authData),
					signature: isoBase64URL.fromBuffer(new Uint8Array(signature)),
				},
				clientExtensionResults: {},
			};
		};

		return { createAttestation, createAssertion };
	};

	const setup = async (requireUserVerification: boolean) => {
		const { auth, client, cookieSetter, signInWithTestUser } =
			await getTestInstance({
				plugins: [passkey({ rpID, requireUserVerification })],
			});
		const { headers } = await signInWithTestUser();
		headers.set("origin", origin);
		const context = await auth.$context;
		const authenticator = createSoftwareAuthenticator();

		const fetchChallenge = async (path: string) => {
			const { data } = await client.$fetch<{ challenge: string }>(path, {
				method: "GET",
				headers,
				onResponse: cookieSetter(headers),
			});
			assert(data);
			return data.challenge;
		};

		const register = async ({ userVerified }: { userVerified: boolean }) => {
			const challenge = await fetchChallenge(
				"/passkey/generate-register-options",
			);
			return auth.api.verifyPasskeyRegistration({
				headers,
				body: {
					response: authenticator.createAttestation(challenge, userVerified),
				},
			});
		};

		const authenticate = async ({
			userVerified,
		}: {
			userVerified: boolean;
		}) => {
			const challenge = await fetchChallenge(
				"/passkey/generate-authenticate-options",
			);
			return auth.api.verifyPasskeyAuthentication({
				headers,
				body: {
					response: authenticator.createAssertion(challenge, userVerified),
				},
			});
		};

		return {
			register,
			authenticate,
			countPasskeys: () => context.adapter.count({ model: "passkey" }),
			countSessions: () => context.adapter.count({ model: "session" }),
		};
	};

	const errorCode = (error: unknown) => {
		expect(error).toBeInstanceOf(APIError);
		return ((error as APIError).body as { code?: string } | undefined)?.code;
	};

	beforeEach(async () => {
		const actual = await vi.importActual<
			typeof import("@simplewebauthn/server")
		>("@simplewebauthn/server");
		serverMocks.verifyRegistrationResponse.mockImplementation(
			actual.verifyRegistrationResponse,
		);
		serverMocks.verifyAuthenticationResponse.mockImplementation(
			actual.verifyAuthenticationResponse,
		);
	});

	afterEach(() => {
		serverMocks.verifyRegistrationResponse.mockReset();
		serverMocks.verifyAuthenticationResponse.mockReset();
	});

	it("accepts responses without user verification when not required", async () => {
		const { register, authenticate, countPasskeys, countSessions } =
			await setup(false);

		await register({ userVerified: false });
		expect(await countPasskeys()).toBe(1);

		const sessionsBefore = await countSessions();
		const result = await authenticate({ userVerified: false });
		expect(result.session).toBeDefined();
		expect(await countSessions()).toBe(sessionsBefore + 1);
	});

	it("rejects a registration without user verification when required", async () => {
		const { register, countPasskeys } = await setup(true);

		const error = await register({ userVerified: false }).catch(
			(e: unknown) => e,
		);
		expect(errorCode(error)).toBe("FAILED_TO_VERIFY_REGISTRATION");
		expect(await countPasskeys()).toBe(0);

		await register({ userVerified: true });
		expect(await countPasskeys()).toBe(1);
	});

	it("rejects an authentication without user verification when required", async () => {
		const { register, authenticate, countSessions } = await setup(true);
		await register({ userVerified: true });
		const sessionsBefore = await countSessions();

		const error = await authenticate({ userVerified: false }).catch(
			(e: unknown) => e,
		);
		expect(errorCode(error)).toBe("AUTHENTICATION_FAILED");
		expect(await countSessions()).toBe(sessionsBefore);

		const result = await authenticate({ userVerified: true });
		expect(result.session).toBeDefined();
		expect(await countSessions()).toBe(sessionsBefore + 1);
	});
});
