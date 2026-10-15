import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";

const mswServer = setupServer();

describe("server-issued id_token nonce", async () => {
	const keyPair = await generateKeyPair("RS256");
	const jwk = await exportJWK(keyPair.publicKey);
	jwk.kid = "test-google-kid";
	jwk.alg = "RS256";
	const clientId = "web.googleusercontent.com";

	const signIdToken = (claims: Record<string, unknown> = {}) =>
		new SignJWT({
			email: "native-user@example.com",
			email_verified: true,
			name: "Native User",
			sub: "google-sub-nonce",
			...claims,
		})
			.setProtectedHeader({ alg: "RS256", kid: "test-google-kid" })
			.setIssuedAt()
			.setIssuer("https://accounts.google.com")
			.setAudience(clientId)
			.setExpirationTime("1h")
			.sign(keyPair.privateKey);

	beforeAll(() => {
		mswServer.listen({ onUnhandledRequest: "bypass" });
		mswServer.use(
			http.get("https://www.googleapis.com/oauth2/v3/certs", () =>
				HttpResponse.json({ keys: [jwk] }),
			),
		);
	});
	afterAll(() => mswServer.close());

	const { client, signInWithTestUser } = await getTestInstance({
		socialProviders: {
			google: {
				clientId,
				clientSecret: "test-secret",
				requireIssuedIdTokenNonce: true,
			},
			apple: { clientId: "apple-client", clientSecret: "test-secret" },
		},
	});

	const issueNonce = async (provider: "google" | "apple" = "google") =>
		client.idToken.nonce({ provider });

	it("signs in with an issued nonce that matches the token's nonce claim", async () => {
		const { data } = await issueNonce();
		expect(data?.nonce).toMatch(/^[a-zA-Z0-9]{32}$/);
		const res = await client.signIn.social({
			provider: "google",
			idToken: {
				token: await signIdToken({ nonce: data!.nonce }),
				nonce: data!.nonce,
			},
		});
		expect(res.error).toBeNull();
		expect(res.data).toMatchObject({ redirect: false });
	});

	it("rejects a sign-in without a nonce", async () => {
		const res = await client.signIn.social({
			provider: "google",
			idToken: { token: await signIdToken() },
		});
		expect(res.error?.status).toBe(400);
		expect(res.error?.code).toBe("INVALID_ID_TOKEN_NONCE");
	});

	it("rejects a nonce the server did not issue, even when it matches the claim", async () => {
		const nonce = "a".repeat(32);
		const res = await client.signIn.social({
			provider: "google",
			idToken: { token: await signIdToken({ nonce }), nonce },
		});
		expect(res.error?.status).toBe(400);
		expect(res.error?.code).toBe("INVALID_ID_TOKEN_NONCE");
	});

	it("consumes the nonce, so the same token and nonce cannot be used twice", async () => {
		const { data } = await issueNonce();
		const idToken = {
			token: await signIdToken({ nonce: data!.nonce }),
			nonce: data!.nonce,
		};
		const first = await client.signIn.social({ provider: "google", idToken });
		expect(first.error).toBeNull();
		const replay = await client.signIn.social({ provider: "google", idToken });
		expect(replay.error?.code).toBe("INVALID_ID_TOKEN_NONCE");
	});

	it("rejects a token whose nonce claim differs from the issued nonce", async () => {
		const { data } = await issueNonce();
		const res = await client.signIn.social({
			provider: "google",
			idToken: {
				token: await signIdToken({ nonce: "b".repeat(32) }),
				nonce: data!.nonce,
			},
		});
		expect(res.error?.status).toBe(401);
		expect(res.error?.code).toBe("INVALID_TOKEN");
	});

	it("does not issue nonces for a provider that has not opted in", async () => {
		const res = await issueNonce("apple");
		expect(res.error?.status).toBe(400);
		expect(res.error?.code).toBe("ID_TOKEN_NONCE_NOT_ENABLED");
	});

	it("requires an issued nonce when linking an account with an id token", async () => {
		const { headers } = await signInWithTestUser();
		const withoutNonce = await client.linkSocial(
			{ provider: "google", idToken: { token: await signIdToken() } },
			{ headers },
		);
		expect(withoutNonce.error?.code).toBe("INVALID_ID_TOKEN_NONCE");

		const { data } = await issueNonce();
		const linked = await client.linkSocial(
			{
				provider: "google",
				idToken: {
					token: await signIdToken({
						nonce: data!.nonce,
						email: "test@test.com",
						sub: "google-sub-link",
					}),
					nonce: data!.nonce,
				},
			},
			{ headers },
		);
		expect(linked.error).toBeNull();
	});

	it("issues and consumes nonces through secondary storage", async () => {
		const store = new Map<string, string>();
		const { client } = await getTestInstance({
			secondaryStorage: {
				get: (key) => store.get(key) ?? null,
				set: (key, value) => void store.set(key, value),
				delete: (key) => void store.delete(key),
				getAndDelete: (key) => {
					const value = store.get(key) ?? null;
					store.delete(key);
					return value;
				},
				increment: (key) => {
					const next = Number(store.get(key) ?? 0) + 1;
					store.set(key, String(next));
					return next;
				},
			},
			socialProviders: {
				google: {
					clientId,
					clientSecret: "test-secret",
					requireIssuedIdTokenNonce: true,
				},
			},
		});
		const { data } = await client.idToken.nonce({ provider: "google" });
		expect([...store.keys()].some((key) => key.includes(data!.nonce))).toBe(
			true,
		);
		const idToken = {
			token: await signIdToken({ nonce: data!.nonce, sub: "google-sub-ss" }),
			nonce: data!.nonce,
		};
		const first = await client.signIn.social({ provider: "google", idToken });
		expect(first.error).toBeNull();
		const replay = await client.signIn.social({ provider: "google", idToken });
		expect(replay.error?.code).toBe("INVALID_ID_TOKEN_NONCE");
	});
});
