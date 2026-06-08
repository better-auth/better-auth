import { APIError } from "@better-auth/core/error";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import type { Verification } from "better-auth";
import { createAuthClient } from "better-auth/client";
import { parseSetCookieHeader } from "better-auth/cookies";
import { twoFactor } from "better-auth/plugins";
import {
	expectNoTwoFactorChallenge,
	getTestInstance,
	seedVerifiedOtpMethod,
} from "better-auth/test";
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

const mockAuthenticationResponse = {
	id: "credential-id",
	rawId: "credential-id",
	type: "public-key",
	clientExtensionResults: {},
	response: {
		clientDataJSON: "client-data-json",
		authenticatorData: "authenticator-data",
		signature: "signature",
	},
} satisfies AuthenticationResponseJSON;

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

function expectPasskeyAuthenticationSuccess(value: unknown): asserts value is {
	session: { token: string };
	user: { email: string };
} {
	assert(typeof value === "object" && value !== null);
	assert("session" in value);
	assert("user" in value);
}

function isTwoFactorChallengeResponse(value: unknown): value is {
	kind: "challenge";
	challenge: {
		kind: "two-factor";
		attemptId: string;
		methods: { id: string; kind: string; label: string | null }[];
	};
} {
	if (!value || typeof value !== "object") return false;
	const record = value as { kind?: unknown; challenge?: { kind?: unknown } };
	return record.kind === "challenge" && record.challenge?.kind === "two-factor";
}

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

	it("should challenge passkey sign-in when user verification is not performed", async () => {
		const {
			auth: twoFactorAuth,
			client,
			cookieSetter,
			testUser,
		} = await getTestInstance({
			user: {
				additionalFields: {
					internalNote: {
						type: "string",
						defaultValue: "server-only",
						returned: false,
					},
				},
			},
			plugins: [
				passkey(),
				twoFactor({
					otpOptions: {
						async sendOTP() {},
					},
				}),
			],
		});

		const context = await twoFactorAuth.$context;
		const user = await context.internalAdapter.findUserByEmail(testUser.email);
		if (!user) {
			throw new Error("Expected test user");
		}
		await seedVerifiedOtpMethod(context.adapter, user.user.id);
		await context.adapter.create<Omit<Passkey, "id">, Passkey>({
			model: "passkey",
			data: {
				userId: user.user.id,
				publicKey: "mockPublicKey",
				name: "mockName",
				counter: 0,
				deviceType: "singleDevice",
				credentialID: "credential-id",
				createdAt: new Date(),
				backedUp: false,
				transports: "internal",
				aaguid: "mockAAGUID",
			} satisfies Omit<Passkey, "id">,
		});

		serverMocks.verifyAuthenticationResponse.mockResolvedValue({
			verified: true,
			authenticationInfo: {
				newCounter: 1,
				userVerified: false,
			},
		});

		const headers = new Headers({ origin: "http://localhost:3000" });
		await client.$fetch("/passkey/generate-authenticate-options", {
			method: "GET",
			onResponse: cookieSetter(headers),
		});
		const beforeSessions = await context.internalAdapter.listSessions(
			user.user.id,
		);

		const challengeResponse =
			await twoFactorAuth.api.verifyPasskeyAuthentication({
				headers,
				body: {
					response: mockAuthenticationResponse,
				},
				asResponse: true,
			});
		expect(challengeResponse.headers.get("set-auth-token")).toBeNull();
		const challengeCookies = parseSetCookieHeader(
			challengeResponse.headers.get("set-cookie") || "",
		);
		expect(
			challengeCookies.get("better-auth.two_factor_challenge")?.value,
		).toBeDefined();
		const challengeJson: unknown = await challengeResponse.json();
		assert(isTwoFactorChallengeResponse(challengeJson));
		expect(challengeJson.challenge.kind).toBe("two-factor");
		expect(challengeJson.challenge.attemptId).toBeTruthy();
		expect(challengeJson.challenge.methods).toEqual([
			{
				id: expect.any(String),
				kind: "otp",
				label: null,
			},
		]);

		const sessions = await context.internalAdapter.listSessions(user.user.id);
		expect(sessions).toHaveLength(beforeSessions.length);
	});

	it("should finalize passkey sign-in when user verification is performed", async () => {
		const {
			auth: twoFactorAuth,
			client,
			cookieSetter,
			testUser,
		} = await getTestInstance({
			plugins: [
				passkey(),
				twoFactor({
					otpOptions: {
						async sendOTP() {},
					},
				}),
			],
		});

		const context = await twoFactorAuth.$context;
		const user = await context.internalAdapter.findUserByEmail(testUser.email);
		if (!user) {
			throw new Error("Expected test user");
		}
		await seedVerifiedOtpMethod(context.adapter, user.user.id);
		await context.adapter.create<Omit<Passkey, "id">, Passkey>({
			model: "passkey",
			data: {
				userId: user.user.id,
				publicKey: "mockPublicKey",
				name: "mockName",
				counter: 0,
				deviceType: "singleDevice",
				credentialID: "credential-id",
				createdAt: new Date(),
				backedUp: false,
				transports: "internal",
				aaguid: "mockAAGUID",
			} satisfies Omit<Passkey, "id">,
		});

		serverMocks.verifyAuthenticationResponse.mockResolvedValue({
			verified: true,
			authenticationInfo: {
				newCounter: 2,
				userVerified: true,
			},
		});

		const headers = new Headers({ origin: "http://localhost:3000" });
		await client.$fetch("/passkey/generate-authenticate-options", {
			method: "GET",
			onResponse: cookieSetter(headers),
		});
		const beforeSessions = await context.internalAdapter.listSessions(
			user.user.id,
		);

		const authResponse = await twoFactorAuth.api.verifyPasskeyAuthentication({
			headers,
			body: {
				response: mockAuthenticationResponse,
			},
			asResponse: true,
		});
		cookieSetter(headers)({
			response: authResponse,
		});
		const authJson: unknown = await authResponse.json();
		expect(isTwoFactorChallengeResponse(authJson)).toBe(false);
		expectPasskeyAuthenticationSuccess(authJson);
		expect(authJson.session).toBeDefined();
		expect(authJson.user.email).toBe(testUser.email);
		expect(authJson.user).not.toHaveProperty("internalNote");

		const sessions = await context.internalAdapter.listSessions(user.user.id);
		expect(sessions).toHaveLength(beforeSessions.length + 1);
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

		expectNoTwoFactorChallenge(response);
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
