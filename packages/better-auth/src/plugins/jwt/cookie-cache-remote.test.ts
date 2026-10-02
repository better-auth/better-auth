import { describe, expect, it } from "vitest";
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
});
