import type { BetterAuthOptions } from "@better-auth/core";
import { getTestInstance } from "better-auth/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Passkey } from ".";
import { passkey } from ".";

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

const RP_ORIGIN = "http://localhost:3000";
// RP ID matching permits this sibling host, but origin matching must reject it.
const SIBLING_ORIGIN = "http://sibling.localhost:3000";
const FRONTEND_ORIGIN = "https://app.example.com";

const encodeClientData = (origin: string) =>
	Buffer.from(JSON.stringify({ type: "webauthn.get", origin })).toString(
		"base64url",
	);

const mockAuthenticationResponse = {
	id: "mockCredentialID",
	rawId: "mockRawId",
	response: {
		clientDataJSON: "mockClientDataJSON",
		authenticatorData: "mockAuthenticatorData",
		signature: "mockSignature",
		userHandle: "mockUserHandle",
	},
	type: "public-key" as const,
	clientExtensionResults: {},
};

const mockRegistrationResponse = {
	id: "credential-id",
	response: { transports: ["internal"] },
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

/**
 * Seeds a credential and challenge so verification reaches the WebAuthn check.
 */
async function prepareAuthentication<O extends Partial<BetterAuthOptions>>(
	instance: Awaited<ReturnType<typeof getTestInstance<O, {}>>>,
	headers: Headers,
) {
	const { auth, client, cookieSetter, signInWithTestUser } = instance;
	const { user } = await signInWithTestUser();
	const ctx = await auth.$context;
	await ctx.adapter.create({
		model: "passkey",
		data: {
			userId: user.id,
			name: "mock",
			publicKey: "mockPublicKey",
			credentialID: "mockCredentialID",
			counter: 0,
			deviceType: "singleDevice",
			createdAt: new Date(),
			backedUp: false,
			transports: "mockTransports",
			aaguid: "mockAAGUID",
		} satisfies Omit<Passkey, "id">,
	});
	await client.$fetch("/passkey/generate-authenticate-options", {
		method: "GET",
		headers,
		onResponse: cookieSetter(headers),
	});
	serverMocks.verifyAuthenticationResponse.mockResolvedValueOnce({
		verified: true,
		authenticationInfo: { newCounter: 1 },
	});
	return user;
}

afterEach(() => {
	serverMocks.verifyRegistrationResponse.mockReset();
	serverMocks.verifyAuthenticationResponse.mockReset();
});

/**
 * RP ID matching admits sibling origins, so verification must use server configuration.
 */
describe("passkey expected origin", () => {
	it("verifies authentication against the server origin, not the Origin header", async () => {
		const instance = await getTestInstance({
			plugins: [passkey()],
		});
		const headers = new Headers({
			origin: SIBLING_ORIGIN,
		});
		const user = await prepareAuthentication(instance, headers);

		// Direct server-side invocation: no origin middleware runs here, the
		// forwarded header is the only client-controlled input.
		const response = await instance.auth.api.verifyPasskeyAuthentication({
			headers,
			body: {
				response: mockAuthenticationResponse,
			},
		});
		expect(response.user.id).toBe(user.id);

		expect(serverMocks.verifyAuthenticationResponse).toHaveBeenCalledTimes(1);
		const call = serverMocks.verifyAuthenticationResponse.mock.calls[0]![0];
		expect(call.expectedOrigin).toEqual([RP_ORIGIN]);
		expect(call.expectedOrigin).not.toContain(SIBLING_ORIGIN);
	});

	it("verifies registration against the server origin, not the Origin header", async () => {
		const instance = await getTestInstance({
			plugins: [passkey()],
		});
		const { headers } = await instance.signInWithTestUser();
		headers.set("origin", SIBLING_ORIGIN);
		await instance.client.$fetch("/passkey/generate-register-options", {
			method: "GET",
			headers,
			onResponse: instance.cookieSetter(headers),
		});
		serverMocks.verifyRegistrationResponse.mockResolvedValueOnce(
			mockRegistrationVerification,
		);

		await instance.auth.api.verifyPasskeyRegistration({
			headers,
			body: {
				response: mockRegistrationResponse,
			},
		});

		expect(serverMocks.verifyRegistrationResponse).toHaveBeenCalledTimes(1);
		const call = serverMocks.verifyRegistrationResponse.mock.calls[0]![0];
		expect(call.expectedOrigin).toEqual([RP_ORIGIN]);
		expect(call.expectedOrigin).not.toContain(SIBLING_ORIGIN);
	});

	it("ignores a sibling origin even when a wildcard trusted origin admits it over HTTP", async () => {
		const instance = await getTestInstance({
			plugins: [passkey()],
			trustedOrigins: ["http://*.localhost:3000"],
		});
		const headers = new Headers({
			origin: SIBLING_ORIGIN,
		});
		await prepareAuthentication(instance, headers);
		headers.set("content-type", "application/json");

		// Through the HTTP handler the CSRF allowlist lets the sibling origin
		// in. The WebAuthn origin pin must still not be derived from it.
		const res = await instance.customFetchImpl(
			`${RP_ORIGIN}/api/auth/passkey/verify-authentication`,
			{
				method: "POST",
				headers,
				body: JSON.stringify({
					response: mockAuthenticationResponse,
				}),
			},
		);
		expect(res.status).toBe(200);

		expect(serverMocks.verifyAuthenticationResponse).toHaveBeenCalledTimes(1);
		const call = serverMocks.verifyAuthenticationResponse.mock.calls[0]![0];
		expect(call.expectedOrigin).toEqual([RP_ORIGIN]);
	});

	it.for([
		{
			label: "a frontend origin listed exactly in trustedOrigins",
			trustedOrigins: [FRONTEND_ORIGIN],
			reported: FRONTEND_ORIGIN,
			expected: [RP_ORIGIN, FRONTEND_ORIGIN],
		},
		{
			label: "not a sibling origin that only a wildcard admits",
			trustedOrigins: ["http://*.localhost:3000"],
			reported: SIBLING_ORIGIN,
			expected: [RP_ORIGIN],
		},
		{
			label: "not an untrusted origin",
			trustedOrigins: [],
			reported: FRONTEND_ORIGIN,
			expected: [RP_ORIGIN],
		},
	])(
		"accepts the origin the credential reports only for $label",
		async ({ trustedOrigins, reported, expected }) => {
			const instance = await getTestInstance({
				plugins: [passkey()],
				trustedOrigins,
			});
			const headers = new Headers();
			await prepareAuthentication(instance, headers);

			await instance.auth.api.verifyPasskeyAuthentication({
				headers,
				body: {
					response: {
						...mockAuthenticationResponse,
						response: {
							...mockAuthenticationResponse.response,
							clientDataJSON: encodeClientData(reported),
						},
					},
				},
			});

			const call = serverMocks.verifyAuthenticationResponse.mock.calls[0]![0];
			expect(call.expectedOrigin).toEqual(expected);
		},
	);

	it("uses the configured origins verbatim, as a list, regardless of the request", async () => {
		const configured = ["https://app.example.com", "https://admin.example.com"];
		const instance = await getTestInstance({
			plugins: [
				passkey({
					origin: configured,
				}),
			],
		});
		const headers = new Headers({
			origin: SIBLING_ORIGIN,
		});
		await prepareAuthentication(instance, headers);

		await instance.auth.api.verifyPasskeyAuthentication({
			headers,
			body: {
				response: mockAuthenticationResponse,
			},
		});

		const call = serverMocks.verifyAuthenticationResponse.mock.calls[0]![0];
		expect(call.expectedOrigin).toEqual(configured);
	});

	it("accepts a single configured origin string", async () => {
		const instance = await getTestInstance({
			plugins: [
				passkey({
					origin: "https://app.example.com",
				}),
			],
		});
		const headers = new Headers({
			origin: SIBLING_ORIGIN,
		});
		await prepareAuthentication(instance, headers);

		await instance.auth.api.verifyPasskeyAuthentication({
			headers,
			body: {
				response: mockAuthenticationResponse,
			},
		});

		const call = serverMocks.verifyAuthenticationResponse.mock.calls[0]![0];
		expect(call.expectedOrigin).toEqual(["https://app.example.com"]);
	});

	it("fails closed when no server-side origin can be determined", async () => {
		const instance = await getTestInstance({
			plugins: [passkey()],
			baseURL: undefined,
		});
		const headers = new Headers({
			origin: SIBLING_ORIGIN,
		});
		await prepareAuthentication(instance, headers);

		// Direct call with no configured baseURL: nothing server-side pins the
		// origin, so the header must not be used as a fallback.
		await expect(
			instance.auth.api.verifyPasskeyAuthentication({
				headers,
				body: {
					response: mockAuthenticationResponse,
				},
			}),
		).rejects.toMatchObject({
			status: "INTERNAL_SERVER_ERROR",
			body: { code: "ORIGIN_NOT_CONFIGURED" },
		});
		expect(serverMocks.verifyAuthenticationResponse).not.toHaveBeenCalled();
	});

	it("does not derive the expected origin from x-forwarded-host when baseURL is unset", async () => {
		const instance = await getTestInstance({
			plugins: [passkey()],
			baseURL: undefined,
			advanced: {
				trustedProxyHeaders: true,
			},
		});
		const headers = new Headers({
			origin: SIBLING_ORIGIN,
			"x-forwarded-host": "sibling.localhost:3000",
			"x-forwarded-proto": "http",
		});
		await prepareAuthentication(instance, headers);
		headers.set("content-type", "application/json");

		await instance.customFetchImpl(
			`${RP_ORIGIN}/api/auth/passkey/verify-authentication`,
			{
				method: "POST",
				headers,
				body: JSON.stringify({
					response: mockAuthenticationResponse,
				}),
			},
		);

		expect(serverMocks.verifyAuthenticationResponse).toHaveBeenCalledTimes(1);
		const call = serverMocks.verifyAuthenticationResponse.mock.calls[0]![0];
		expect(call.expectedOrigin).toEqual([RP_ORIGIN]);
	});

	it("derives the expected origin from the validated allowed host under a dynamic baseURL", async () => {
		const instance = await getTestInstance({
			plugins: [passkey()],
			baseURL: {
				allowedHosts: ["localhost:3000", "sibling.localhost:3000"],
				protocol: "http",
			},
		});
		const headers = new Headers({
			origin: SIBLING_ORIGIN,
		});
		await prepareAuthentication(instance, headers);
		headers.set("content-type", "application/json");

		await instance.customFetchImpl(
			`${SIBLING_ORIGIN}/api/auth/passkey/verify-authentication`,
			{
				method: "POST",
				headers,
				body: JSON.stringify({
					response: mockAuthenticationResponse,
				}),
			},
		);

		const call = serverMocks.verifyAuthenticationResponse.mock.calls[0]![0];
		expect(call.expectedOrigin).toEqual([SIBLING_ORIGIN]);
	});

	it.for(["*.localhost:3000", "app-?.localhost:3000"])(
		"requires origin when the wildcard allowed host %s covers the configured rpID",
		async (allowedHost) => {
			await expect(
				getTestInstance({
					plugins: [
						passkey({
							rpID: "localhost",
						}),
					],
					baseURL: {
						allowedHosts: [allowedHost],
						protocol: "http",
					},
				}),
			).rejects.toThrow("Passkey `origin` must be set");
		},
	);

	it("control: allows a wildcard allowed host with an explicit origin or a per-host rpID", async () => {
		const baseURL = {
			allowedHosts: ["*.localhost:3000", "*.vercel.app"],
			protocol: "http" as const,
		};
		await expect(
			getTestInstance({
				plugins: [
					passkey({
						rpID: "localhost",
						origin: RP_ORIGIN,
					}),
				],
				baseURL,
			}),
		).resolves.toBeDefined();
		await expect(
			getTestInstance({
				plugins: [passkey()],
				baseURL,
			}),
		).resolves.toBeDefined();
		await expect(
			getTestInstance({
				plugins: [
					passkey({
						rpID: "example.com",
					}),
				],
				baseURL: {
					allowedHosts: ["example.com", "*.vercel.app"],
				},
			}),
		).resolves.toBeDefined();
	});
});

/**
 * One `passkey()` result can be shared by several auth instances, so the
 * origin source must follow each instance's own `baseURL`.
 */
describe("passkey shared across auth instances", () => {
	it.for([
		{
			label: "static baseURL instance built first",
			staticFirst: true,
		},
		{
			label: "request-derived instance built first",
			staticFirst: false,
		},
	])(
		"keeps each instance's origin source when the $label",
		async ({ staticFirst }) => {
			const plugin = passkey();
			const buildStatic = () =>
				getTestInstance({
					plugins: [plugin],
				});
			const buildRequest = () =>
				getTestInstance({
					plugins: [plugin],
					baseURL: undefined,
					advanced: {
						trustedProxyHeaders: true,
					},
				});
			const requestFirst = staticFirst ? null : await buildRequest();
			const staticInstance = await buildStatic();
			const requestInstance = requestFirst ?? (await buildRequest());

			const staticHeaders = new Headers();
			await prepareAuthentication(staticInstance, staticHeaders);
			await expect(
				staticInstance.auth.api.verifyPasskeyAuthentication({
					headers: staticHeaders,
					body: {
						response: mockAuthenticationResponse,
					},
				}),
			).resolves.toBeDefined();
			expect(
				serverMocks.verifyAuthenticationResponse.mock.calls[0]![0]
					.expectedOrigin,
			).toEqual([RP_ORIGIN]);

			const requestHeaders = new Headers({
				origin: SIBLING_ORIGIN,
				"x-forwarded-host": "sibling.localhost:3000",
				"x-forwarded-proto": "http",
			});
			await prepareAuthentication(requestInstance, requestHeaders);
			requestHeaders.set("content-type", "application/json");
			await requestInstance.customFetchImpl(
				`${RP_ORIGIN}/api/auth/passkey/verify-authentication`,
				{
					method: "POST",
					headers: requestHeaders,
					body: JSON.stringify({
						response: mockAuthenticationResponse,
					}),
				},
			);
			expect(
				serverMocks.verifyAuthenticationResponse.mock.calls[1]![0]
					.expectedOrigin,
			).toEqual([RP_ORIGIN]);
		},
	);
});
