import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createAuthClient } from "better-auth/client";
import { setCookieToHeader } from "better-auth/cookies";
import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { sso } from "..";
import { ssoClient } from "../client";
import type { EncryptedOIDCConfig, OIDCConfig, SSOOptions } from "../types";
import { decryptOIDCConfig, encryptOIDCConfig } from "./encryption";

const TEST_SECRET = "better-auth-test-secret-0123456789abcdef";

interface SSOProviderData {
	id: string;
	providerId: string;
	issuer: string;
	domain: string;
	userId: string;
	organizationId?: string;
	oidcConfig?: string;
	samlConfig?: string;
}

const ISSUER = "https://idp.example.com";

function fullOIDCConfig(overrides: Partial<OIDCConfig> = {}): OIDCConfig {
	return {
		issuer: ISSUER,
		clientId: "client-id",
		clientSecret: "super-secret-value",
		pkce: true,
		discoveryEndpoint: `${ISSUER}/.well-known/openid-configuration`,
		authorizationEndpoint: `${ISSUER}/authorize`,
		tokenEndpoint: `${ISSUER}/token`,
		jwksEndpoint: `${ISSUER}/jwks`,
		...overrides,
	};
}

function createTestAuth(ssoOptions?: SSOOptions) {
	const data: {
		user: { id: string; email: string }[];
		session: object[];
		verification: object[];
		account: object[];
		ssoProvider: SSOProviderData[];
	} = {
		user: [],
		session: [],
		verification: [],
		account: [],
		ssoProvider: [],
	};

	const auth = betterAuth({
		database: memoryAdapter(data),
		baseURL: "http://localhost:3000",
		secret: TEST_SECRET,
		emailAndPassword: { enabled: true },
		plugins: [sso(ssoOptions)],
	});

	const authClient = createAuthClient({
		baseURL: "http://localhost:3000",
		plugins: [ssoClient()],
		fetchOptions: {
			customFetchImpl: async (url, init) =>
				auth.handler(new Request(url, init)),
		},
	});

	async function signInTestUser() {
		const headers = new Headers();
		await authClient.signUp.email({
			email: "owner@test.com",
			password: "password1234",
			name: "Owner",
		});
		await authClient.signIn.email(
			{ email: "owner@test.com", password: "password1234" },
			{ throw: true, onSuccess: setCookieToHeader(headers) },
		);
		const userId = data.user.find((u) => u.email === "owner@test.com")!.id;
		return { headers, userId };
	}

	function seedPlaintextProvider(userId: string, providerId: string) {
		data.ssoProvider.push({
			id: `row-${providerId}`,
			providerId,
			issuer: ISSUER,
			domain: "example.com",
			userId,
			oidcConfig: JSON.stringify(fullOIDCConfig()),
		});
	}

	function rawConfig(providerId: string): OIDCConfig | EncryptedOIDCConfig {
		const row = data.ssoProvider.find((p) => p.providerId === providerId)!;
		return JSON.parse(row.oidcConfig as string);
	}

	return { auth, data, signInTestUser, seedPlaintextProvider, rawConfig };
}

describe("OIDC client secret encryption at rest", () => {
	describe("encrypt-on-write", () => {
		it("encrypts the client secret at rest but returns plaintext to the caller", async () => {
			const { auth, signInTestUser, rawConfig } = createTestAuth({
				storeSecretAs: "encrypted",
			});
			const { headers } = await signInTestUser();

			const provider = await auth.api.registerSSOProvider({
				body: {
					providerId: "p1",
					issuer: ISSUER,
					domain: "example.com",
					oidcConfig: {
						clientId: "client-id",
						clientSecret: "super-secret-value",
						skipDiscovery: true,
						authorizationEndpoint: `${ISSUER}/authorize`,
						tokenEndpoint: `${ISSUER}/token`,
						jwksEndpoint: `${ISSUER}/jwks`,
					},
				},
				headers,
			});

			expect(provider.oidcConfig?.clientSecret).toBe("super-secret-value");

			const stored = rawConfig("p1");
			expect(typeof stored.clientSecret).toBe("object");
			const envelope = (stored as EncryptedOIDCConfig).clientSecret;
			expect(envelope.encrypted).toBe(true);
			expect(envelope.value).not.toContain("super-secret-value");
			await expect(
				symmetricDecrypt({ key: TEST_SECRET, data: envelope.value }),
			).resolves.toBe("super-secret-value");
		});

		it("stores plaintext when encryption is not configured (default)", async () => {
			const { auth, signInTestUser, rawConfig } = createTestAuth();
			const { headers } = await signInTestUser();

			await auth.api.registerSSOProvider({
				body: {
					providerId: "p1",
					issuer: ISSUER,
					domain: "example.com",
					oidcConfig: {
						clientId: "client-id",
						clientSecret: "super-secret-value",
						skipDiscovery: true,
						authorizationEndpoint: `${ISSUER}/authorize`,
						tokenEndpoint: `${ISSUER}/token`,
						jwksEndpoint: `${ISSUER}/jwks`,
					},
				},
				headers,
			});

			expect(rawConfig("p1").clientSecret).toBe("super-secret-value");
		});
	});

	describe("tolerant reads", () => {
		it("reads a plaintext provider even when encryption is enabled (mixed table)", async () => {
			const { auth, signInTestUser, seedPlaintextProvider } = createTestAuth({
				storeSecretAs: "encrypted",
			});
			const { headers, userId } = await signInTestUser();
			seedPlaintextProvider(userId, "legacy");

			const res = await auth.api.signInSSO({
				body: { providerId: "legacy", callbackURL: "http://localhost:3000/ok" },
				headers,
			});
			expect(res.url).toContain(`${ISSUER}/authorize`);
		});

		it("does not touch plaintext providers when encryption is disabled", async () => {
			const { auth, signInTestUser, seedPlaintextProvider, rawConfig } =
				createTestAuth();
			const { headers, userId } = await signInTestUser();
			seedPlaintextProvider(userId, "legacy");

			await auth.api.signInSSO({
				body: { providerId: "legacy", callbackURL: "http://localhost:3000/ok" },
				headers,
			});

			expect(rawConfig("legacy").clientSecret).toBe("super-secret-value");
		});
	});

	describe("custom encryptor", () => {
		it("uses the provided encrypt/decrypt and round-trips on read", async () => {
			const reverse = (s: string) => s.split("").reverse().join("");
			const { auth, signInTestUser, rawConfig } = createTestAuth({
				storeSecretAs: {
					encrypt: async (v) => `custom:${reverse(v)}`,
					decrypt: async (v) => reverse(v.replace(/^custom:/, "")),
				},
			});
			const { headers } = await signInTestUser();

			const provider = await auth.api.registerSSOProvider({
				body: {
					providerId: "p1",
					issuer: ISSUER,
					domain: "example.com",
					oidcConfig: {
						clientId: "client-id",
						clientSecret: "super-secret-value",
						skipDiscovery: true,
						authorizationEndpoint: `${ISSUER}/authorize`,
						tokenEndpoint: `${ISSUER}/token`,
						jwksEndpoint: `${ISSUER}/jwks`,
					},
				},
				headers,
			});

			expect(provider.oidcConfig?.clientSecret).toBe("super-secret-value");
			const envelope = (rawConfig("p1") as EncryptedOIDCConfig).clientSecret;
			expect(envelope.value).toBe(`custom:${reverse("super-secret-value")}`);
		});
	});

	describe("update path", () => {
		it("keeps a single layer of encryption when other fields change", async () => {
			const { auth, signInTestUser, rawConfig } = createTestAuth({
				storeSecretAs: "encrypted",
			});
			const { headers } = await signInTestUser();

			await auth.api.registerSSOProvider({
				body: {
					providerId: "p1",
					issuer: ISSUER,
					domain: "example.com",
					oidcConfig: {
						clientId: "client-id",
						clientSecret: "super-secret-value",
						skipDiscovery: true,
						authorizationEndpoint: `${ISSUER}/authorize`,
						tokenEndpoint: `${ISSUER}/token`,
						jwksEndpoint: `${ISSUER}/jwks`,
					},
				},
				headers,
			});

			await auth.api.updateSSOProvider({
				body: {
					providerId: "p1",
					oidcConfig: { scopes: ["openid", "email"] },
				},
				headers,
			});

			const envelope = (rawConfig("p1") as EncryptedOIDCConfig).clientSecret;
			expect(envelope.encrypted).toBe(true);
			await expect(
				symmetricDecrypt({ key: TEST_SECRET, data: envelope.value }),
			).resolves.toBe("super-secret-value");
		});
	});
});

describe("storeSecretAs transitions", () => {
	const encryptedDeps = {
		authSecret: TEST_SECRET,
		ssoOptions: { storeSecretAs: "encrypted" } as SSOOptions,
	};
	const plainDeps = {
		authSecret: TEST_SECRET,
		ssoOptions: { storeSecretAs: "plain" } as SSOOptions,
	};
	const unsetDeps = {
		authSecret: TEST_SECRET,
		ssoOptions: {} as SSOOptions,
	};

	describe("previously plain, now encrypted", () => {
		it("reads a previously-plaintext config unchanged (tolerant read)", async () => {
			const out = await decryptOIDCConfig(fullOIDCConfig(), encryptedDeps);
			expect(out.clientSecret).toBe("super-secret-value");
		});

		it("wraps into an envelope when enabled", async () => {
			const prepared = await encryptOIDCConfig(fullOIDCConfig(), encryptedDeps);
			expect(typeof prepared.clientSecret).toBe("object");
			expect((prepared as EncryptedOIDCConfig).clientSecret.encrypted).toBe(
				true,
			);
		});

		it("wraps a plaintext secret into a valid envelope that round-trips", async () => {
			const envelope = (await encryptOIDCConfig(
				fullOIDCConfig(),
				encryptedDeps,
			)) as EncryptedOIDCConfig;
			expect(envelope.clientSecret.encrypted).toBe(true);
			expect(typeof envelope.clientSecret.value).toBe("string");
			expect(envelope.clientSecret.value).not.toBe("super-secret-value");

			const back = await decryptOIDCConfig(envelope, encryptedDeps);
			expect(back.clientSecret).toBe("super-secret-value");
		});
	});

	describe("previously encrypted, now plain", () => {
		it("decrypts the envelope back to the original secret (the whole point)", async () => {
			const envelope = (await encryptOIDCConfig(
				fullOIDCConfig(),
				encryptedDeps,
			)) as EncryptedOIDCConfig;

			for (const deps of [plainDeps, unsetDeps]) {
				const out = await decryptOIDCConfig(envelope, deps);
				expect(typeof out.clientSecret).toBe("string");
				expect(out.clientSecret).toBe("super-secret-value");
				expect(out.clientSecret).not.toBe(envelope.clientSecret.value);
			}
		});

		it("reads a row written while plain (bare string) without touching it", async () => {
			for (const deps of [plainDeps, encryptedDeps]) {
				const out = await decryptOIDCConfig(fullOIDCConfig(), deps);
				expect(out.clientSecret).toBe("super-secret-value");
			}
		});

		it("is a no-op when encryption is disabled", async () => {
			const prepared = await encryptOIDCConfig(fullOIDCConfig(), plainDeps);
			expect(typeof prepared.clientSecret).toBe("string");
			expect(prepared.clientSecret).toBe("super-secret-value");
		});

		it("keeps the envelope recoverable regardless of the option flag", async () => {
			const envelope = await encryptOIDCConfig(fullOIDCConfig(), encryptedDeps);
			const recovered = await decryptOIDCConfig(envelope, encryptedDeps);
			expect(recovered.clientSecret).toBe("super-secret-value");
		});
	});
});

describe("encryption primitive", () => {
	let cipher = "";
	beforeEach(async () => {
		cipher = await symmetricEncrypt({ key: TEST_SECRET, data: "hello" });
	});
	it("round-trips", async () => {
		expect(await symmetricDecrypt({ key: TEST_SECRET, data: cipher })).toBe(
			"hello",
		);
	});
});
