import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { describe, expect, it, vi } from "vitest";
import { createCookieCacheSigner } from "./cookie-cache";
import { jwt } from "./index";

describe("remote jwt session cookie cache", () => {
	it("allows a remote signer when the cookie cache uses jwt", () => {
		const plugin = jwt({
			sessionCookieCache: true,
			jwks: {
				remoteUrl: "https://idp.example/jwks",
				keyPairConfig: { alg: "EdDSA" },
			},
			jwt: {
				sign: async () => "signed-by-idp",
			},
		});

		expect(() =>
			plugin.init?.({
				options: {
					session: { cookieCache: { strategy: "jwt", maxAge: 60 } },
				},
				sessionConfig: {},
				logger: { warn() {} },
			} as never),
		).not.toThrow();
	});

	it("signs the cookie with the remote sign function", async () => {
		let seenTyp: string | undefined;
		const signer = createCookieCacheSigner({
			jwks: {
				remoteUrl: "https://idp.example/jwks",
				keyPairConfig: { alg: "EdDSA" },
			},
			jwt: {
				sign: async (_payload, header) => {
					seenTyp = header?.typ;
					return "remote.jwt.token";
				},
			},
		});

		const token = await signer.sign(
			{
				context: {
					options: { baseURL: "https://app.example" },
					baseURL: "https://app.example",
					logger: { debug() {} },
				},
			} as never,
			{
				session: { token: "session-token" },
				user: { id: "user-1" },
				updatedAt: 1,
			} as never,
			60,
		);

		expect(token).toBe("remote.jwt.token");
		expect(seenTyp).toBe("better-auth.session-cache+jwt");
	});

	it("verifies a remotely signed cookie against the remote jwks", async () => {
		const { publicKey, privateKey } = await generateKeyPair("EdDSA", {
			extractable: true,
		});
		const publicJwk = await exportJWK(publicKey);
		publicJwk.kid = "remote-key";
		publicJwk.alg = "EdDSA";
		publicJwk.use = "sig";
		const remoteUrl = "https://idp.example/jwks";
		vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
			const url = typeof input === "string" ? input : input.toString();
			if (url === remoteUrl) {
				return new Response(JSON.stringify({ keys: [publicJwk] }), {
					headers: { "content-type": "application/json" },
				});
			}
			throw new Error(`unexpected fetch ${url}`);
		});

		const now = new Date();
		const signer = createCookieCacheSigner({
			jwks: {
				remoteUrl,
				keyPairConfig: { alg: "EdDSA" },
			},
			jwt: {
				sign: async (claims, header) =>
					await new SignJWT(claims)
						.setProtectedHeader({
							alg: "EdDSA",
							kid: "remote-key",
							typ: header?.typ,
						})
						.sign(privateKey),
			},
		});
		const ctx = {
			context: {
				options: { baseURL: "https://app.example" },
				baseURL: "https://app.example",
				logger: { debug() {} },
			},
		} as never;
		const token = await signer.sign(
			ctx,
			{
				session: {
					id: "s1",
					token: "session-token",
					userId: "user-1",
					expiresAt: new Date(Date.now() + 60_000),
					createdAt: now,
					updatedAt: now,
				},
				user: {
					id: "user-1",
					email: "cache@test.com",
					emailVerified: true,
					name: "Cache User",
					createdAt: now,
					updatedAt: now,
				},
				updatedAt: Date.now(),
			} as never,
			60,
		);

		const verified = await signer.verify(ctx, token);
		expect(verified?.payload.user.id).toBe("user-1");
		expect(verified?.payload.session.token).toBe("session-token");
	});
});
