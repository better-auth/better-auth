import type { GenericEndpointContext } from "@better-auth/core";
import { CLIENT_ASSERTION_TYPE } from "@better-auth/core/oauth2";
import { generateRandomString } from "better-auth/crypto";
import { generateCodeChallenge } from "better-auth/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { exportJWK, generateKeyPair, jwtVerify, SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { oauthProvider } from "./oauth";
import type { OAuthOptions, Scope } from "./types";
import { consumeClientAssertion } from "./utils/client-assertion";

const baseURL = "http://localhost:3000";
const issuer = "https://issuer.example.com";
const tokenEndpoint = `${baseURL}/api/auth/oauth2/token`;
const parEndpoint = `${baseURL}/api/auth/oauth2/par`;
const redirectUri = "https://rp.example.com/callback";
const attestationMethod = "test_attestation_jwt";
const attestationType =
	"urn:better-auth:test:client-assertion-type:attestation";

async function setup(
	assertionAudience?: OAuthOptions<Scope[]>["assertionAudience"],
) {
	const clientKeys = await generateKeyPair("RS256", { extractable: true });
	const attestationKeys = await generateKeyPair("ES256", {
		extractable: true,
	});
	const observedAcceptedAudiences: string[][] = [];

	async function verifyAssertionSignature(assertion: string) {
		const { payload } = await jwtVerify(assertion, attestationKeys.publicKey);
		if (typeof payload.sub !== "string") {
			throw new Error("attestation must name the client in sub");
		}
		return { ...payload, sub: payload.sub };
	}

	const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance({
		baseURL,
		plugins: [
			jwt({ jwt: { issuer } }),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				scopes: ["openid", "read:posts"],
				clientPrivileges: () => true,
				pushedAuthorizationRequests: { enabled: true },
				...(assertionAudience && { assertionAudience }),
				extensions: [
					{
						clientAuthentication: {
							[attestationMethod]: {
								assertionTypes: [attestationType],
								authenticate: async ({
									ctx,
									opts,
									assertion,
									acceptedAudiences,
								}) => {
									observedAcceptedAudiences.push(acceptedAudiences);
									const payload = await verifyAssertionSignature(assertion);
									await consumeClientAssertion(ctx, opts, {
										namespace: `urn:example:attestation:${payload.sub}`,
										payload,
										acceptedAudiences,
									});
									return { clientId: payload.sub };
								},
							},
						},
					},
				],
			}),
		],
	});
	const { headers } = await signInWithTestUser();

	const keyClient = await auth.api.adminCreateOAuthClient({
		headers,
		body: {
			redirect_uris: [redirectUri],
			skip_consent: true,
			grant_types: ["authorization_code", "client_credentials"],
			scope: "openid read:posts",
			client_credentials_scopes: ["read:posts"],
			token_endpoint_auth_method: "private_key_jwt",
			jwks: {
				keys: [
					{
						...(await exportJWK(clientKeys.publicKey)),
						kid: "client-key",
						alg: "RS256",
						use: "sig",
					},
				],
			},
		},
	});
	const attestationClient = await auth.api.adminCreateOAuthClient({
		headers,
		body: {
			redirect_uris: [redirectUri],
			skip_consent: true,
			grant_types: ["authorization_code", "client_credentials"],
			scope: "openid read:posts",
			client_credentials_scopes: ["read:posts"],
			token_endpoint_auth_method: attestationMethod,
		},
	});

	function sign(
		clientId: string,
		aud: string | string[],
		key: CryptoKey,
		alg: string,
	) {
		const now = Math.floor(Date.now() / 1000);
		return new SignJWT({})
			.setProtectedHeader({ alg, typ: "client-authentication+jwt" })
			.setIssuer(clientId)
			.setSubject(clientId)
			.setAudience(aud)
			.setIssuedAt(now)
			.setExpirationTime(now + 60)
			.setJti(generateRandomString(16))
			.sign(key);
	}

	const methods = {
		private_key_jwt: async (aud: string | string[]) => ({
			client_id: keyClient!.client_id,
			client_assertion_type: CLIENT_ASSERTION_TYPE,
			client_assertion: await sign(
				keyClient!.client_id,
				aud,
				clientKeys.privateKey as CryptoKey,
				"RS256",
			),
		}),
		strategy: async (aud: string | string[]) => ({
			client_id: attestationClient!.client_id,
			client_assertion_type: attestationType,
			client_assertion: await sign(
				attestationClient!.client_id,
				aud,
				attestationKeys.privateKey as CryptoKey,
				"ES256",
			),
		}),
	};

	async function post(url: string, body: Record<string, string>) {
		const response = await customFetchImpl(url, {
			method: "POST",
			headers: { "content-type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams(body).toString(),
		});
		const text = await response.text();
		return {
			status: response.status,
			body: (text ? JSON.parse(text) : {}) as Record<string, unknown>,
		};
	}

	async function requestToken(credentials: Record<string, string>) {
		return post(tokenEndpoint, {
			grant_type: "client_credentials",
			...credentials,
		});
	}

	async function pushRequest(credentials: Record<string, string>) {
		return post(parEndpoint, {
			response_type: "code",
			redirect_uri: redirectUri,
			scope: "openid",
			state: "audience-state",
			code_challenge: await generateCodeChallenge(generateRandomString(43)),
			code_challenge_method: "S256",
			...credentials,
		});
	}

	return { methods, requestToken, pushRequest, observedAcceptedAudiences };
}

const invalidClient = { body: { error: "invalid_client" } };

/**
 * @see https://www.rfc-editor.org/rfc/rfc10070#section-4
 * @see https://www.rfc-editor.org/rfc/rfc10070#section-5
 */
describe("client assertion audience", () => {
	describe("with the default issuer audience", async () => {
		const { methods, requestToken, pushRequest, observedAcceptedAudiences } =
			await setup();

		it.each(["private_key_jwt", "strategy"] as const)(
			"accepts %s assertions addressed to the issuer",
			async (method) => {
				const token = await requestToken(await methods[method](issuer));
				expect(token.status).toBe(200);
				expect(token.body.access_token).toEqual(expect.any(String));

				const pushed = await pushRequest(await methods[method](issuer));
				expect(pushed.status).toBe(201);
			},
		);

		it.each([
			["private_key_jwt", "the token endpoint", tokenEndpoint],
			["private_key_jwt", "the PAR endpoint", parEndpoint],
			["private_key_jwt", "the issuer and another audience", [issuer, "x"]],
			["strategy", "the token endpoint", tokenEndpoint],
			["strategy", "the PAR endpoint", parEndpoint],
			["strategy", "the issuer and another audience", [issuer, "x"]],
		] as const)(
			"rejects %s assertions addressed to %s",
			async (method, _, aud) => {
				const audience = typeof aud === "string" ? aud : [...aud];
				const token = await requestToken(await methods[method](audience));
				expect(token).toMatchObject(invalidClient);

				const pushed = await pushRequest(await methods[method](audience));
				expect(pushed).toMatchObject(invalidClient);
			},
		);

		it("offers a strategy only the issuer as the accepted audience", async () => {
			observedAcceptedAudiences.length = 0;
			await requestToken(await methods.strategy(issuer));
			await pushRequest(await methods.strategy(issuer));
			expect(observedAcceptedAudiences).toEqual([[issuer], [issuer]]);
		});
	});

	describe("with assertionAudience: issuer-or-endpoint", async () => {
		const { methods, requestToken, pushRequest, observedAcceptedAudiences } =
			await setup("issuer-or-endpoint");

		it.each([
			["private_key_jwt", "the token endpoint", tokenEndpoint],
			["private_key_jwt", "the issuer", issuer],
			["strategy", "the token endpoint", tokenEndpoint],
			["strategy", "the issuer", issuer],
		] as const)(
			"accepts %s assertions addressed to %s at the token endpoint",
			async (method, _, aud) => {
				const token = await requestToken(await methods[method](aud));
				expect(token.status).toBe(200);
			},
		);

		it.each([
			["private_key_jwt", "the PAR endpoint", parEndpoint],
			["private_key_jwt", "the token endpoint", tokenEndpoint],
			["private_key_jwt", "the issuer", issuer],
			["strategy", "the PAR endpoint", parEndpoint],
			["strategy", "the token endpoint", tokenEndpoint],
			["strategy", "the issuer", issuer],
		] as const)(
			"accepts %s assertions addressed to %s at the PAR endpoint",
			async (method, _, aud) => {
				const pushed = await pushRequest(await methods[method](aud));
				expect(pushed.status).toBe(201);
			},
		);

		it("rejects an assertion for another endpoint", async () => {
			const token = await requestToken(
				await methods.private_key_jwt(parEndpoint),
			);
			expect(token).toMatchObject(invalidClient);
		});

		it("offers a strategy the endpoint, the issuer, and at PAR the token endpoint", async () => {
			observedAcceptedAudiences.length = 0;
			await requestToken(await methods.strategy(issuer));
			await pushRequest(await methods.strategy(issuer));
			expect(observedAcceptedAudiences).toEqual([
				[tokenEndpoint, issuer],
				[parEndpoint, issuer, tokenEndpoint],
			]);
		});
	});

	describe("consumeClientAssertion", async () => {
		const opts = {
			loginPage: "/login",
			consentPage: "/consent",
		} satisfies OAuthOptions<Scope[]>;
		const instance = await getTestInstance({
			baseURL,
			plugins: [jwt({ jwt: { issuer } }), oauthProvider(opts)],
		});
		const ctx = {
			context: await instance.auth.$context,
		} as GenericEndpointContext;
		const payload = (aud: unknown) => ({
			aud,
			exp: Math.floor(Date.now() / 1000) + 60,
			jti: generateRandomString(16),
		});

		it("requires every audience value to be accepted", async () => {
			await expect(
				consumeClientAssertion(ctx, opts, {
					namespace: "test:sole",
					payload: payload([issuer, tokenEndpoint]),
					acceptedAudiences: [issuer],
				}),
			).rejects.toMatchObject(invalidClient);
			await expect(
				consumeClientAssertion(ctx, opts, {
					namespace: "test:sole",
					payload: payload([]),
					acceptedAudiences: [issuer],
				}),
			).rejects.toMatchObject(invalidClient);
			await expect(
				consumeClientAssertion(ctx, opts, {
					namespace: "test:sole",
					payload: payload(issuer),
					acceptedAudiences: [issuer],
				}),
			).resolves.toBeUndefined();
		});

		it("still accepts the deprecated expectedAudience", async () => {
			await expect(
				consumeClientAssertion(ctx, opts, {
					namespace: "test:deprecated",
					payload: payload(issuer),
					expectedAudience: issuer,
				}),
			).resolves.toBeUndefined();
		});

		it("requires exactly one of acceptedAudiences and expectedAudience", async () => {
			const neither = { namespace: "test:neither", payload: payload(issuer) };
			await expect(
				consumeClientAssertion(
					ctx,
					opts,
					neither as Parameters<typeof consumeClientAssertion>[2],
				),
			).rejects.toThrow("acceptedAudiences");
			const both = {
				namespace: "test:both",
				payload: payload(issuer),
				acceptedAudiences: [issuer],
				expectedAudience: issuer,
			};
			await expect(
				consumeClientAssertion(
					ctx,
					opts,
					both as unknown as Parameters<typeof consumeClientAssertion>[2],
				),
			).rejects.toThrow("acceptedAudiences");
		});
	});
});
