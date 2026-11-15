import { oauthProvider } from "@better-auth/oauth-provider";
import { createOTP } from "@better-auth/utils/otp";
import { APIError } from "better-auth/api";
import { generateRandomString, symmetricEncrypt } from "better-auth/crypto";
import { deriveDpopJkt, generateCodeChallenge } from "better-auth/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import { twoFactor } from "better-auth/plugins/two-factor";
import { getTestInstance } from "better-auth/test";
import type { JWK } from "jose";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { firstPartyApps, passwordStrategy } from ".";
import { AUTHORIZE_CHALLENGE_PATH } from "./constants";
import type { FirstPartyAuthStrategy } from "./types";

const baseURL = "http://localhost:3000";
const challengeURL = `${baseURL}/api/auth${AUTHORIZE_CHALLENGE_PATH}`;
const tokenURL = `${baseURL}/api/auth/oauth2/token`;
const password = "correct-horse-battery";

async function createDpopKey() {
	const { privateKey, publicKey } = await generateKeyPair("ES256", {
		extractable: true,
	});
	const publicJwk = await exportJWK(publicKey);
	return { privateKey, publicJwk, jkt: await deriveDpopJkt(publicJwk) };
}
type DpopKey = Awaited<ReturnType<typeof createDpopKey>>;

async function dpopProof(key: DpopKey, url: string) {
	return new SignJWT({
		jti: generateRandomString(16),
		htm: "POST",
		htu: url,
		iat: Math.floor(Date.now() / 1000),
	})
		.setProtectedHeader({
			typ: "dpop+jwt",
			alg: "ES256",
			jwk: key.publicJwk as JWK,
		})
		.sign(key.privateKey);
}

/** A test strategy that steps up in the app with a fixed code. */
const stepUpStrategy: FirstPartyAuthStrategy = {
	id: "step-up-code",
	params: ["step_up_code"],
	authenticate: async ({ ctx, authSession, params }) => {
		if (params.step_up_code !== "424242") {
			return { error: "authentication_failed", userId: authSession.userId };
		}
		const user = await ctx.context.internalAdapter.findUserById(
			authSession.userId!,
		);
		return { user: user!, amr: ["otp"] };
	},
	stepUp: async ({ authSession }) =>
		authSession.acrValues === "urn:test:native"
			? {
					error: "insufficient_authorization",
					challengeType: "step_up_code",
					user: { id: authSession.userId! } as never,
				}
			: { error: "redirect_to_web" },
};

/**
 * @see https://github.com/better-auth/better-auth/issues/10414
 */
describe("first-party apps", async () => {
	const stepUpAcr = { value: "urn:test:browser" };
	const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance({
		baseURL: `${baseURL}/api/auth`,
		emailAndPassword: { enabled: true },
		plugins: [
			jwt({ jwt: { issuer: baseURL } }),
			twoFactor(),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				scopes: ["openid", "profile", "email", "offline_access"],
				allowDynamicClientRegistration: true,
				beforeAuthorization: ({ request }) => {
					if (request.login_hint === "policy-login@example.com") {
						return { prompt: "login" };
					}
					if (request.login_hint === "policy-deny@example.com") {
						throw new APIError("BAD_REQUEST", {
							error: "access_denied",
							error_description: "Refused by policy",
						});
					}
				},
			}),
			firstPartyApps({
				strategies: [passwordStrategy(), stepUpStrategy],
				budget: { account: { max: 5 }, client: false },
				requireStepUp: ({ grantType, acr }) =>
					grantType === "refresh_token" && acr !== "step-up-done"
						? { acrValues: stepUpAcr.value }
						: undefined,
			}),
		],
	});
	const { headers } = await signInWithTestUser();
	const context = await auth.$context;

	async function createClient(
		body: Record<string, unknown> = {},
	): Promise<string> {
		const client = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				client_name: "Native App",
				token_endpoint_auth_method: "none",
				grant_types: ["authorization_code", "refresh_token"],
				redirect_uris: ["https://app.example.com/callback"],
				skip_consent: true,
				metadata: { first_party_app: true },
				...body,
			},
		});
		return client.client_id;
	}

	async function createUser(email: string, options: { totp?: boolean } = {}) {
		const { user } = await auth.api.signUpEmail({
			body: { email, password, name: "First Party" },
		});
		if (!options.totp) return { user, totpSecret: undefined };
		const totpSecret = generateRandomString(32);
		await context.adapter.create({
			model: "twoFactor",
			data: {
				userId: user.id,
				secret: await symmetricEncrypt({
					key: context.secretConfig,
					data: totpSecret,
				}),
				backupCodes: "[]",
				verified: true,
			},
		});
		await context.internalAdapter.updateUser(user.id, {
			twoFactorEnabled: true,
		});
		return { user, totpSecret };
	}

	async function post(
		url: string,
		body: Record<string, string | undefined>,
		options: { json?: boolean; dpop?: DpopKey; headers?: HeadersInit } = {},
	) {
		const values = Object.fromEntries(
			Object.entries(body).filter(([, value]) => value !== undefined),
		) as Record<string, string>;
		const requestHeaders = new Headers(options.headers);
		requestHeaders.set(
			"content-type",
			options.json ? "application/json" : "application/x-www-form-urlencoded",
		);
		if (options.dpop) {
			requestHeaders.set("dpop", await dpopProof(options.dpop, url));
		}
		const response = await customFetchImpl(url, {
			method: "POST",
			headers: requestHeaders,
			body: options.json
				? JSON.stringify(values)
				: new URLSearchParams(values).toString(),
		});
		const json = (await response.json()) as Record<string, unknown>;
		return { status: response.status, headers: response.headers, json };
	}

	async function pkce() {
		const verifier = generateRandomString(43);
		return { verifier, challenge: await generateCodeChallenge(verifier) };
	}

	async function startRequest(
		clientId: string,
		extra: Record<string, string | undefined> = {},
	) {
		const { verifier, challenge } = await pkce();
		return {
			verifier,
			body: {
				client_id: clientId,
				response_type: "code",
				scope: "openid profile offline_access",
				code_challenge: challenge,
				code_challenge_method: "S256",
				...extra,
			},
		};
	}

	function redeem(
		clientId: string,
		code: string,
		verifier: string,
		dpop?: DpopKey,
	) {
		return post(
			tokenURL,
			{
				grant_type: "authorization_code",
				code,
				code_verifier: verifier,
				client_id: clientId,
			},
			{ dpop },
		);
	}

	let clientId: string;
	beforeAll(async () => {
		clientId = await createClient();
	});

	it("advertises the authorization challenge endpoint", async () => {
		const metadata = await auth.api.getOAuthServerConfig();
		expect(metadata).toMatchObject({
			authorization_challenge_endpoint: challengeURL,
		});
	});

	it("signs in with a password and redeems the code without redirect_uri", async () => {
		await createUser("alice@example.com");
		const { body, verifier } = await startRequest(clientId, {
			login_hint: "alice@example.com",
			password,
		});
		const challenge = await post(challengeURL, body);
		expect(challenge.status).toBe(200);
		expect(challenge.headers.get("cache-control")).toBe("no-store");
		expect(challenge.json.authorization_code).toBeTypeOf("string");

		const tokens = await redeem(
			clientId,
			challenge.json.authorization_code as string,
			verifier,
		);
		expect(tokens.status).toBe(200);
		expect(tokens.json.access_token).toBeTypeOf("string");
		expect(tokens.json.refresh_token).toBeTypeOf("string");
		// §6.1: the handle comes back with the tokens.
		expect(tokens.json.auth_session).toBeTypeOf("string");
	});

	it("never stores the credentials with the authorization request", async () => {
		await createUser("stored@example.com");
		const { body } = await startRequest(clientId, {
			login_hint: "stored@example.com",
			password: "wrong-password",
		});
		const failed = await post(challengeURL, body);
		expect(failed.json.error).toBe("authentication_failed");
		const rows = await context.adapter.findMany<{ query: string }>({
			model: "firstPartyAuthSession",
		});
		for (const row of rows) {
			expect(row.query).not.toContain("wrong-password");
		}
	});

	it("rejects a JSON first request and accepts JSON later requests", async () => {
		await createUser("json@example.com", { totp: true });
		const { body } = await startRequest(clientId, {
			login_hint: "json@example.com",
			password,
		});
		const json = await post(challengeURL, body, { json: true });
		expect(json.status).toBe(400);
		expect(json.json.error).toBe("invalid_request");

		const form = await post(challengeURL, body);
		expect(form.status).toBe(403);
		const later = await post(
			challengeURL,
			{ auth_session: form.json.auth_session as string, totp: "000000" },
			{ json: true },
		);
		expect(later.json.error).toBe("authentication_failed");
	});

	describe("client checks", () => {
		it("answers unauthorized_client for a client that has not opted in", async () => {
			const notFirstParty = await createClient({ metadata: {} });
			await createUser("optin@example.com");
			const { body } = await startRequest(notFirstParty, {
				login_hint: "optin@example.com",
				password,
			});
			const response = await post(challengeURL, body);
			expect(response.status).toBe(400);
			expect(response.json.error).toBe("unauthorized_client");
		});

		it("answers unauthorized_client for a first-party app without skip_consent", async () => {
			const withConsent = await createClient({ skip_consent: false });
			const { body } = await startRequest(withConsent, {
				login_hint: "optin@example.com",
				password,
			});
			const response = await post(challengeURL, body);
			expect(response.json.error).toBe("unauthorized_client");
		});

		it("does not let dynamic registration opt a client in", async () => {
			const registered = await auth.api.registerOAuthClient({
				headers,
				body: {
					redirect_uris: ["https://other.example.com/callback"],
					token_endpoint_auth_method: "none",
					first_party_app: true,
				} as never,
			});
			const { body } = await startRequest(registered.client_id, {
				login_hint: "optin@example.com",
				password,
			});
			const response = await post(challengeURL, body);
			expect(response.json.error).toBe("unauthorized_client");
		});

		it("authenticates a confidential client before checking credentials", async () => {
			const confidential = await createClient({
				token_endpoint_auth_method: "client_secret_post",
			});
			await createUser("confidential@example.com");
			const { body } = await startRequest(confidential, {
				login_hint: "confidential@example.com",
				password,
			});
			const response = await post(challengeURL, body);
			expect(response.json.error).toBe("invalid_client");
		});

		it("rejects an auth_session presented with another client_id", async () => {
			const other = await createClient();
			await createUser("swap@example.com", { totp: true });
			const { body } = await startRequest(clientId, {
				login_hint: "swap@example.com",
				password,
			});
			const first = await post(challengeURL, body);
			const swapped = await post(challengeURL, {
				auth_session: first.json.auth_session as string,
				client_id: other,
				totp: "000000",
			});
			expect(swapped.json.error).toBe("invalid_client");
		});
	});

	describe("auth_session", () => {
		it("answers invalid_session for an unknown handle", async () => {
			const response = await post(challengeURL, {
				auth_session: "unknown",
				password,
			});
			expect(response.status).toBe(400);
			expect(response.json.error).toBe("invalid_session");
			expect(response.headers.get("cache-control")).toBe("no-store");
		});

		it("answers invalid_session for an expired handle", async () => {
			await createUser("expired@example.com", { totp: true });
			const { body } = await startRequest(clientId, {
				login_hint: "expired@example.com",
				password,
			});
			const first = await post(challengeURL, body);
			const rows = await context.adapter.findMany<{ id: string }>({
				model: "firstPartyAuthSession",
				where: [{ field: "state", value: "pending" }],
			});
			for (const row of rows) {
				await context.adapter.update({
					model: "firstPartyAuthSession",
					where: [{ field: "id", value: row.id }],
					update: { expiresAt: new Date(Date.now() - 1000) },
				});
			}
			const later = await post(challengeURL, {
				auth_session: first.json.auth_session as string,
				totp: "000000",
			});
			expect(later.json.error).toBe("invalid_session");
		});

		it("binds the handle to the DPoP key of the first request", async () => {
			const { totpSecret } = await createUser("dpop@example.com", {
				totp: true,
			});
			const key = await createDpopKey();
			const otherKey = await createDpopKey();
			const { body, verifier } = await startRequest(clientId, {
				login_hint: "dpop@example.com",
				password,
			});
			const first = await post(challengeURL, body, { dpop: key });
			expect(first.status).toBe(403);
			const authSession = first.json.auth_session as string;
			const code = await createOTP(totpSecret!).totp();

			const noProof = await post(challengeURL, {
				auth_session: authSession,
				totp: code,
			});
			expect(noProof.json.error).toBe("invalid_dpop_proof");
			const wrongKey = await post(
				challengeURL,
				{ auth_session: authSession, totp: code },
				{ dpop: otherKey },
			);
			expect(wrongKey.json.error).toBe("invalid_dpop_proof");

			const signedIn = await post(
				challengeURL,
				{ auth_session: authSession, totp: code },
				{ dpop: key },
			);
			expect(signedIn.status).toBe(200);
			const code_ = signedIn.json.authorization_code as string;
			const unbound = await redeem(clientId, code_, verifier);
			expect(unbound.json.error).toBe("invalid_dpop_proof");
			const tokens = await redeem(clientId, code_, verifier, key);
			expect(tokens.status).toBe(200);
			expect(tokens.json.token_type).toBe("DPoP");
			expect(tokens.json.auth_session).toBeTypeOf("string");
		});
	});

	describe("two-factor", () => {
		it("answers insufficient_authorization for the second factor", async () => {
			const { totpSecret } = await createUser("totp@example.com", {
				totp: true,
			});
			const { body, verifier } = await startRequest(clientId, {
				login_hint: "totp@example.com",
				password,
			});
			const first = await post(challengeURL, body);
			expect(first.status).toBe(403);
			expect(first.json).toMatchObject({
				error: "insufficient_authorization",
				challenge_type: "totp",
			});
			expect(first.json.authorization_code).toBeUndefined();

			const wrong = await post(challengeURL, {
				auth_session: first.json.auth_session as string,
				totp: "000000",
			});
			expect(wrong.status).toBe(400);
			expect(wrong.json.error).toBe("authentication_failed");

			const signedIn = await post(challengeURL, {
				auth_session: first.json.auth_session as string,
				totp: await createOTP(totpSecret!).totp(),
			});
			expect(signedIn.status).toBe(200);
			const tokens = await redeem(
				clientId,
				signedIn.json.authorization_code as string,
				verifier,
			);
			expect(tokens.status).toBe(200);
		});

		it("sends a user whose second factor the app cannot collect to the browser", async () => {
			const { user } = await createUser("emailotp@example.com");
			await context.internalAdapter.updateUser(user.id, {
				twoFactorEnabled: true,
			});
			const { body } = await startRequest(clientId, {
				login_hint: "emailotp@example.com",
				password,
			});
			const response = await post(challengeURL, body);
			expect(response.status).toBe(403);
			expect(response.json.error).toBe("redirect_to_web");
		});
	});

	describe("credential guessing (C1)", () => {
		it("answers redirect_to_web after three failures in one auth_session", async () => {
			await createUser("guess@example.com");
			const { body } = await startRequest(clientId, {
				login_hint: "guess@example.com",
				password: "wrong-1",
			});
			const first = await post(challengeURL, body);
			expect(first.status).toBe(400);
			expect(first.json.error).toBe("authentication_failed");
			const authSession = first.json.auth_session as string;
			const second = await post(challengeURL, {
				auth_session: authSession,
				password: "wrong-2",
			});
			expect(second.json.error).toBe("authentication_failed");
			const third = await post(challengeURL, {
				auth_session: authSession,
				password: "wrong-3",
			});
			expect(third.status).toBe(403);
			expect(third.json.error).toBe("redirect_to_web");
			const revoked = await post(challengeURL, {
				auth_session: authSession,
				password,
			});
			expect(revoked.json.error).toBe("invalid_session");
		});

		it("locks an account silently once its budget is spent", async () => {
			await createUser("locked@example.com");
			for (let attempt = 0; attempt < 5; attempt++) {
				const { body } = await startRequest(clientId, {
					login_hint: "locked@example.com",
					password: `wrong-${attempt}`,
				});
				const failed = await post(challengeURL, body);
				expect(failed.json.error).toBe("authentication_failed");
			}
			const { body } = await startRequest(clientId, {
				login_hint: "locked@example.com",
				password,
			});
			const locked = await post(challengeURL, body);
			expect(locked.status).toBe(400);
			expect(locked.json.error).toBe("authentication_failed");
		});

		it("answers an unknown account the same as a wrong password", async () => {
			const { body } = await startRequest(clientId, {
				login_hint: "nobody@example.com",
				password,
			});
			const response = await post(challengeURL, body);
			expect(response.status).toBe(400);
			expect(response.json.error).toBe("authentication_failed");
			expect(response.json.auth_session).toBeTypeOf("string");
		});
	});

	describe("session liveness (C2)", () => {
		async function signIn(email: string) {
			await createUser(email);
			const { body, verifier } = await startRequest(clientId, {
				login_hint: email,
				password,
			});
			const challenge = await post(challengeURL, body);
			return redeem(
				clientId,
				challenge.json.authorization_code as string,
				verifier,
			);
		}

		it("restores a live sign-in from the token response's auth_session", async () => {
			const tokens = await signIn("restore@example.com");
			const { body } = await startRequest(clientId);
			const restored = await post(challengeURL, {
				...body,
				client_id: undefined,
				auth_session: tokens.json.auth_session as string,
			});
			expect(restored.status).toBe(200);
			expect(restored.json.authorization_code).toBeTypeOf("string");
		});

		it("answers invalid_session once the session behind the handle ends", async () => {
			const tokens = await signIn("ended@example.com");
			const sessions = await context.adapter.findMany<{ token: string }>({
				model: "session",
				where: [
					{
						field: "userId",
						value: (await context.internalAdapter.findUserByEmail(
							"ended@example.com",
						))!.user.id,
					},
				],
			});
			for (const session of sessions) {
				await context.internalAdapter.deleteSession(session.token);
			}
			const { body } = await startRequest(clientId);
			const response = await post(challengeURL, {
				...body,
				client_id: undefined,
				auth_session: tokens.json.auth_session as string,
			});
			expect(response.json.error).toBe("invalid_session");
		});
	});

	describe("step-up at the token endpoint (C3, C4)", () => {
		async function signIn(email: string) {
			const { user } = await createUser(email);
			const { body, verifier } = await startRequest(clientId, {
				login_hint: email,
				password,
			});
			const challenge = await post(challengeURL, body);
			const tokens = await redeem(
				clientId,
				challenge.json.authorization_code as string,
				verifier,
			);
			return { user, tokens };
		}

		function refresh(refreshToken: string) {
			return post(tokenURL, {
				grant_type: "refresh_token",
				refresh_token: refreshToken,
				client_id: clientId,
			});
		}

		it("answers insufficient_authorization, then redirect_to_web with acr_values and max_age=0", async () => {
			const { user, tokens } = await signIn("stepup@example.com");
			const refused = await refresh(tokens.json.refresh_token as string);
			expect(refused.status).toBe(403);
			expect(refused.json.error).toBe("insufficient_authorization");
			expect(refused.json.auth_session).toBeTypeOf("string");
			expect(refused.json.challenge_type).toBeUndefined();

			const followUp = await post(challengeURL, {
				auth_session: refused.json.auth_session as string,
			});
			expect(followUp.json).toMatchObject({ error: "redirect_to_web" });
			expect(followUp.status).toBe(403);
			expect(followUp.json).toMatchObject({
				error: "redirect_to_web",
				acr_values: "urn:test:browser",
				max_age: 0,
			});
			// The step-up handle did not create the session, so it keeps it.
			const sessions = await context.internalAdapter.listSessions(user.id);
			expect(sessions.length).toBeGreaterThan(0);
		});

		it("keeps one step-up row per client, user, session, and DPoP key", async () => {
			const { user, tokens } = await signIn("stepup-reuse@example.com");
			const first = await refresh(tokens.json.refresh_token as string);
			const second = await refresh(tokens.json.refresh_token as string);
			expect(second.json.auth_session).not.toBe(first.json.auth_session);
			const rows = await context.adapter.findMany({
				model: "firstPartyAuthSession",
				where: [
					{ field: "userId", value: user.id },
					{ field: "state", value: "step_up" },
				],
			});
			expect(rows).toHaveLength(1);
			// Only the newest handle works.
			const stale = await post(challengeURL, {
				auth_session: first.json.auth_session as string,
			});
			expect(stale.json.error).toBe("invalid_session");
		});

		it("steps up in the app when a strategy can", async () => {
			stepUpAcr.value = "urn:test:native";
			try {
				const { tokens } = await signIn("stepup-native@example.com");
				const refused = await refresh(tokens.json.refresh_token as string);
				const { body, verifier } = await startRequest(clientId);
				const started = await post(challengeURL, {
					...body,
					client_id: undefined,
					auth_session: refused.json.auth_session as string,
				});
				expect(started.status).toBe(403);
				expect(started.json).toMatchObject({
					error: "insufficient_authorization",
					challenge_type: "step_up_code",
				});
				const done = await post(challengeURL, {
					auth_session: started.json.auth_session as string,
					step_up_code: "424242",
				});
				expect(done.status).toBe(200);
				const stepped = await redeem(
					clientId,
					done.json.authorization_code as string,
					verifier,
				);
				expect(stepped.status).toBe(200);
			} finally {
				stepUpAcr.value = "urn:test:browser";
			}
		});
	});

	describe("authorization policy", () => {
		it("answers redirect_to_web when beforeAuthorization asks for a sign-in", async () => {
			await createUser("policy-login@example.com");
			const { body } = await startRequest(clientId, {
				login_hint: "policy-login@example.com",
				password,
			});
			const response = await post(challengeURL, body);
			expect(response.status).toBe(403);
			expect(response.json.error).toBe("redirect_to_web");
		});

		it("passes a beforeAuthorization refusal through", async () => {
			const { user } = await createUser("policy-deny@example.com");
			const before = await context.internalAdapter.listSessions(user.id);
			const { body } = await startRequest(clientId, {
				login_hint: "policy-deny@example.com",
				password,
			});
			const response = await post(challengeURL, body);
			expect(response.status).toBe(400);
			expect(response.json.error).toBe("access_denied");
			// The session created for the refused request is gone.
			const after = await context.internalAdapter.listSessions(user.id);
			expect(after).toHaveLength(before.length);
		});
	});
});

describe("first-party apps client budget", async () => {
	const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance({
		baseURL: `${baseURL}/api/auth`,
		emailAndPassword: { enabled: true },
		plugins: [
			jwt({ jwt: { issuer: baseURL } }),
			oauthProvider({ loginPage: "/login", consentPage: "/consent" }),
			firstPartyApps({
				strategies: [passwordStrategy()],
				budget: { client: { max: 2 } },
			}),
		],
	});
	const { headers } = await signInWithTestUser();

	it("sends a client's users to the browser once its budget is spent", async () => {
		const client = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				token_endpoint_auth_method: "none",
				grant_types: ["authorization_code"],
				redirect_uris: ["https://app.example.com/callback"],
				skip_consent: true,
				metadata: { first_party_app: true },
			},
		});
		const attempt = async (email: string) => {
			const response = await customFetchImpl(challengeURL, {
				method: "POST",
				headers: { "content-type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({
					client_id: client.client_id,
					response_type: "code",
					code_challenge: await generateCodeChallenge(generateRandomString(43)),
					code_challenge_method: "S256",
					login_hint: email,
					password: "wrong",
				}).toString(),
			});
			return (await response.json()) as { error: string };
		};
		expect((await attempt("a@example.com")).error).toBe(
			"authentication_failed",
		);
		expect((await attempt("b@example.com")).error).toBe(
			"authentication_failed",
		);
		expect((await attempt("c@example.com")).error).toBe("redirect_to_web");
	});
});
