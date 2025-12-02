import type { JSONWebKeySet } from "jose";
import { createLocalJWKSet, jwtVerify } from "jose";
import { describe, expect, it } from "vitest";
import { createAuthClient } from "../../client";
import { getTestInstance } from "../../test-utils/test-instance";
import { jwt } from ".";
import { jwtClient } from "./client";
import type { JWKOptions, Jwk, JwtOptions } from "./types";
import { generateExportedKeyPair } from "./utils";

describe("jwt", async () => {
	// Testing the default behavior
	const { auth, signInWithTestUser } = await getTestInstance({
		plugins: [jwt()],
		logger: {
			level: "error",
		},
	});

	const { headers } = await signInWithTestUser();
	const client = createAuthClient({
		plugins: [jwtClient()],
		baseURL: "http://localhost:3000/api/auth",
		fetchOptions: {
			customFetchImpl: async (url, init) => {
				return auth.handler(new Request(url, init));
			},
		},
	});

	it("Client gets a token from session", async () => {
		let token = "";
		await client.getSession({
			fetchOptions: {
				headers,
				onSuccess(context) {
					token = context.response.headers.get("set-auth-jwt") || "";
				},
			},
		});

		expect(token.length).toBeGreaterThan(10);
	});

	it("Client gets a token", async () => {
		const token = await client.token({
			fetchOptions: {
				headers,
			},
		});

		expect(token.data?.token).toBeDefined();
	});

	it("Get JWKS", async () => {
		// If no JWK exists, this makes sure it gets added.
		// TODO: Replace this with a generate JWKS endpoint once it exists.
		const token = await client.token({
			fetchOptions: {
				headers,
			},
		});

		expect(token.data?.token).toBeDefined();

		const jwks = await client.jwks();

		expect(jwks.data?.keys).length.above(0);
		expect(jwks.data?.keys[0]!.alg).toBe("EdDSA");
	});

	it("Signed tokens can be validated with the JWKS", async () => {
		const token = await client.token({
			fetchOptions: {
				headers,
			},
		});

		const jwks = await client.jwks();

		const localJwks = createLocalJWKSet(jwks.data!);
		const decoded = await jwtVerify(token.data?.token!, localJwks);

		expect(decoded).toBeDefined();
	});

	it("should set subject to user id by default", async () => {
		const token = await client.token({
			fetchOptions: {
				headers,
			},
		});

		const jwks = await client.jwks();

		const localJwks = createLocalJWKSet(jwks.data!);
		const decoded = await jwtVerify(token.data?.token!, localJwks);
		expect(decoded.payload.sub).toBeDefined();
		expect(decoded.payload.sub).toBe(decoded.payload.id);
	});

	const algorithmsToTest: {
		keyPairConfig: JWKOptions;
		expectedOutcome: {
			ec: string;
			length: number;
			crv?: string | undefined;
			alg: string;
		};
	}[] = [
		{
			keyPairConfig: {
				alg: "EdDSA",
				crv: "Ed25519",
			},
			expectedOutcome: {
				ec: "OKP",
				length: 43,
				crv: "Ed25519",
				alg: "EdDSA",
			},
		},
		{
			keyPairConfig: {
				alg: "ES256",
			},
			expectedOutcome: {
				ec: "EC",
				length: 43,
				crv: "P-256",
				alg: "ES256",
			},
		},
		{
			keyPairConfig: {
				alg: "ES512",
			},
			expectedOutcome: {
				ec: "EC",
				length: 88,
				crv: "P-521",
				alg: "ES512",
			},
		},
		{
			keyPairConfig: {
				alg: "PS256",
			},
			expectedOutcome: {
				ec: "RSA",
				length: 342,
				alg: "PS256",
			},
		},
		{
			keyPairConfig: {
				alg: "RS256",
			},
			expectedOutcome: {
				ec: "RSA",
				length: 342,
				alg: "RS256",
			},
		},
	];

	for (const algorithm of algorithmsToTest) {
		const expectedOutcome = algorithm.expectedOutcome;
		for (let disablePrivateKeyEncryption of [false, true]) {
			const jwtOptions: JwtOptions = {
				jwks: {
					keyPairConfig: {
						...algorithm.keyPairConfig,
					},
					disablePrivateKeyEncryption: disablePrivateKeyEncryption,
				},
			};
			try {
				const { auth, signInWithTestUser } = await getTestInstance({
					plugins: [jwt(jwtOptions)],
					logger: {
						level: "error",
					},
				});

				const alg: string =
					algorithm.keyPairConfig.alg +
					("crv" in algorithm.keyPairConfig
						? `(${algorithm.keyPairConfig.crv})`
						: "");
				const enc: string = disablePrivateKeyEncryption
					? " without private key encryption"
					: "";

				it(`${alg} algorithm${enc} can be used to generate JWKS`, async () => {
					// Unit test (JWS Supported key)
					const { publicWebKey, privateWebKey } =
						await generateExportedKeyPair(jwtOptions);
					for (const key of [publicWebKey, privateWebKey]) {
						expect(key.kty).toBe(expectedOutcome.ec);
						if (key.x) expect(key.x).toHaveLength(expectedOutcome.length);
						if (key.y) expect(key.y).toHaveLength(expectedOutcome.length);
						if (key.n) expect(key.n).toHaveLength(expectedOutcome.length);
					}

					// Functional test (JWKS)
					const jwks = await auth.api.getJwks();
					expect(jwks.keys.at(0)?.kty).toBe(expectedOutcome.ec);
					if (jwks.keys.at(0)?.crv)
						expect(jwks.keys.at(0)?.crv).toBe(expectedOutcome.crv);
					expect(jwks.keys.at(0)?.alg).toBe(expectedOutcome.alg);
					if (jwks.keys.at(0)?.x)
						expect(jwks.keys.at(0)?.x).toHaveLength(expectedOutcome.length);
					if (jwks.keys.at(0)?.y)
						expect(jwks.keys.at(0)?.y).toHaveLength(expectedOutcome.length);
					if (jwks.keys.at(0)?.n)
						expect(jwks?.keys.at(0)?.n).toHaveLength(expectedOutcome.length);
				});

				const client = createAuthClient({
					plugins: [jwtClient()],
					baseURL: "http://localhost:3000/api/auth",
					fetchOptions: {
						customFetchImpl: async (url, init) => {
							return auth.handler(new Request(url, init));
						},
					},
				});
				let headers: Headers | undefined = undefined;

				it(`${alg} algorithm${enc}: Client can sign in`, async () => {
					try {
						const { headers: heads } = await signInWithTestUser();
						headers = heads;
						expect(headers).toBeDefined();
					} catch (err) {
						console.error(err);
						expect.unreachable();
					}
				});

				it(`${alg} algorithm${enc}: Client gets a token`, async () => {
					const token = await client.token({
						fetchOptions: {
							headers,
						},
					});

					expect(token.data?.token).toBeDefined();
				});

				it(`${alg} algorithm${enc}: Client gets a token from session`, async () => {
					let token = "";
					await client.getSession({
						fetchOptions: {
							headers,
							onSuccess(context) {
								token = context.response.headers.get("set-auth-jwt") || "";
							},
						},
					});

					expect(token.length).toBeGreaterThan(10);
				});

				it(`${alg} algorithm${enc}: Signed tokens can be validated with the JWKS`, async () => {
					const token = await client.token({
						fetchOptions: {
							headers,
						},
					});

					const jwks = await client.jwks();

					const localJwks = createLocalJWKSet(jwks.data!);
					const decoded = await jwtVerify(token.data?.token!, localJwks);

					expect(decoded).toBeDefined();
				});

				it(`${alg} algorithm${enc}: Should set subject to user id by default`, async () => {
					const token = await client.token({
						fetchOptions: {
							headers,
						},
					});

					const jwks = await client.jwks();

					const localJwks = createLocalJWKSet(jwks.data!);
					const decoded = await jwtVerify(token.data?.token!, localJwks);
					expect(decoded.payload.sub).toBeDefined();
					expect(decoded.payload.sub).toBe(decoded.payload.id);
				});
			} catch (err) {
				console.error(err);
				expect.unreachable();
			}
		}
	}
});

describe.each([
	{
		alg: "EdDSA",
		crv: "Ed25519",
	},
	{
		alg: "ES256",
	},
	{
		alg: "ES512",
	},
	{
		alg: "PS256",
	},
	{
		alg: "RS256",
	},
] as JWKOptions[])("signJWT - alg: $alg", async (keyPairConfig) => {
	const { auth } = await getTestInstance({
		plugins: [
			jwt({
				jwks: {
					keyPairConfig,
				},
			}),
		],
		logger: {
			level: "error",
		},
	});

	it("should sign a JWT", async () => {
		const jwt = await auth.api.signJWT({
			body: {
				payload: {
					sub: "123",
					exp: 1000,
					iat: 1000,
					iss: "https://example.com",
					aud: "https://example.com",
					custom: "custom",
				},
			},
		});
		expect(jwt?.token).toBeDefined();
	});

	it("should be a valid JWT", async () => {
		const jwt = await auth.api.signJWT({
			body: {
				payload: {
					sub: "123",
					exp: Math.floor(Date.now() / 1000) + 600,
					iat: Math.floor(Date.now() / 1000),
					iss: "https://example.com",
					aud: "https://example.com",
					custom: "custom",
				},
			},
		});
		const jwks = await auth.api.getJwks();
		const localJwks = createLocalJWKSet(jwks);
		const decoded = await jwtVerify(jwt?.token!, localJwks);

		// Verify the kid from the JWT exists in the JWKS
		const kidFromJwt = decoded.protectedHeader.kid;
		const keyExists = jwks.keys.some((key) => key.kid === kidFromJwt);
		expect(keyExists).toBe(true);

		expect(decoded).toMatchObject({
			payload: {
				iss: "https://example.com",
				aud: "https://example.com",
				sub: "123",
				exp: expect.any(Number),
				iat: expect.any(Number),
				custom: "custom",
			},
			protectedHeader: {
				alg: keyPairConfig.alg,
				kid: expect.any(String),
			},
		});
	});

	it("shouldn't let you sign from a client", async () => {
		const client = createAuthClient({
			plugins: [jwtClient()],
			baseURL: "http://localhost:3000/api/auth",
			fetchOptions: {
				customFetchImpl: async (url, init) => {
					return auth.handler(new Request(url, init));
				},
			},
		});
		const jwt = await client.$fetch("/sign-jwt", {
			method: "POST",
			body: {
				payload: { sub: "123" },
			},
		});
		expect(jwt.error?.status).toBe(404);
	});
});

describe("jwt - remote signing", async () => {
	it("should fail if sign is defined and remoteUrl is not", async () => {
		expect(() =>
			getTestInstance({
				plugins: [
					jwt({
						jwt: {
							sign: () => {
								return "123";
							},
						},
					}),
				],
			}),
		).toThrowError("jwks_config");
	});
});

describe("jwt - remote url", async () => {
	it("should require specifying the alg when using remoteUrl", async () => {
		expect(() =>
			getTestInstance({
				plugins: [
					jwt({
						jwks: {
							remoteUrl: "https://example.com/.well-known/jwks.json",
						},
					}),
				],
			}),
		).toThrowError("jwks_config");
	});

	it("should accept remoteUrl with alg specified", async () => {
		const { auth } = await getTestInstance({
			plugins: [
				jwt({
					jwks: {
						remoteUrl: "https://example.com/.well-known/jwks.json",
						keyPairConfig: {
							alg: "ES256",
						},
					},
				}),
			],
		});
		expect(auth).toBeDefined();
	});

	it("should disable /jwks endpoint when remoteUrl is configured", async () => {
		const { auth } = await getTestInstance({
			plugins: [
				jwt({
					jwks: {
						remoteUrl: "https://example.com/.well-known/jwks.json",
						keyPairConfig: {
							alg: "ES256",
						},
					},
				}),
			],
		});

		const client = createAuthClient({
			plugins: [jwtClient()],
			baseURL: "http://localhost:3000/api/auth",
			fetchOptions: {
				customFetchImpl: async (url, init) => {
					return auth.handler(new Request(url, init));
				},
			},
		});

		const response = await client.$fetch<JSONWebKeySet>("/jwks");
		expect(response.error?.status).toBe(404);
	});

	it("should work with different algorithms when remoteUrl is set", async () => {
		const algorithms = ["ES256", "ES512", "RS256", "PS256", "EdDSA"];

		for (const alg of algorithms) {
			const { auth } = await getTestInstance({
				plugins: [
					jwt({
						jwks: {
							remoteUrl: "https://example.com/.well-known/jwks.json",
							keyPairConfig: {
								alg: alg as any,
							},
						},
					}),
				],
			});
			expect(auth).toBeDefined();
		}
	});

	it("should still allow token generation when remoteUrl is set", async () => {
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [
				jwt({
					jwks: {
						remoteUrl: "https://example.com/.well-known/jwks.json",
						keyPairConfig: {
							alg: "ES256",
						},
					},
				}),
			],
		});

		const { headers } = await signInWithTestUser();

		const client = createAuthClient({
			plugins: [jwtClient()],
			baseURL: "http://localhost:3000/api/auth",
			fetchOptions: {
				customFetchImpl: async (url, init) => {
					return auth.handler(new Request(url, init));
				},
			},
		});

		const token = await client.token({
			fetchOptions: {
				headers,
			},
		});

		expect(token.data?.token).toBeDefined();
		expect(token.data?.token).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/); // JWT format
	});

	it("should work with custom sign function and remoteUrl", async () => {
		const mockSignFunction = (payload: any) => {
			// Mock JWT with test signature
			const header = Buffer.from(
				JSON.stringify({ alg: "ES256", typ: "JWT" }),
			).toString("base64url");
			const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
			const signature = "mock-signature";
			return `${header}.${body}.${signature}`;
		};

		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [
				jwt({
					jwks: {
						remoteUrl: "https://example.com/.well-known/jwks.json",
						keyPairConfig: {
							alg: "ES256",
						},
					},
					jwt: {
						sign: mockSignFunction,
					},
				}),
			],
		});

		const { headers } = await signInWithTestUser();

		const client = createAuthClient({
			plugins: [jwtClient()],
			baseURL: "http://localhost:3000/api/auth",
			fetchOptions: {
				customFetchImpl: async (url, init) => {
					return auth.handler(new Request(url, init));
				},
			},
		});

		const token = await client.token({
			fetchOptions: {
				headers,
			},
		});

		expect(token.data?.token).toBeDefined();
		// Verify it's using our mock sign function
		expect(token.data?.token).toContain("mock-signature");
	});

	it("should validate that remoteUrl is a valid URL format", async () => {
		const invalidUrls = [
			"not-a-url",
			"http://",
			"//example.com",
			"example.com/jwks",
		];

		for (const url of invalidUrls) {
			// While the current implementation doesn't validate URL format,
			// this test documents expected behavior
			const { auth } = await getTestInstance({
				plugins: [
					jwt({
						jwks: {
							remoteUrl: url,
							keyPairConfig: {
								alg: "ES256",
							},
						},
					}),
				],
			});
			// Currently passes, but documents that URL validation might be needed
			expect(auth).toBeDefined();
		}
	});

	it("should work with remoteUrl pointing to different paths", async () => {
		const validPaths = [
			"https://example.com/.well-known/jwks.json",
			"https://auth.example.com/jwks",
			"https://api.example.com/v1/keys",
			"https://example.com:8080/jwks.json",
		];

		for (const url of validPaths) {
			const { auth } = await getTestInstance({
				plugins: [
					jwt({
						jwks: {
							remoteUrl: url,
							keyPairConfig: {
								alg: "ES256",
							},
						},
					}),
				],
			});
			expect(auth).toBeDefined();
		}
	});

	it("should handle remoteUrl with query parameters", async () => {
		const { auth } = await getTestInstance({
			plugins: [
				jwt({
					jwks: {
						remoteUrl: "https://example.com/jwks?version=1&format=json",
						keyPairConfig: {
							alg: "RS256",
						},
					},
				}),
			],
		});
		expect(auth).toBeDefined();
	});

	it("should not interfere with other JWT endpoints when remoteUrl is set", async () => {
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [
				jwt({
					jwks: {
						remoteUrl: "https://example.com/.well-known/jwks.json",
						keyPairConfig: {
							alg: "ES256",
						},
					},
				}),
			],
		});

		const { headers } = await signInWithTestUser();

		const client = createAuthClient({
			plugins: [jwtClient()],
			baseURL: "http://localhost:3000/api/auth",
			fetchOptions: {
				customFetchImpl: async (url, init) => {
					return auth.handler(new Request(url, init));
				},
			},
		});

		// Test that /token endpoint still works
		const tokenResponse = await client.token({
			fetchOptions: {
				headers,
			},
		});
		expect(tokenResponse.data?.token).toBeDefined();

		// Test that /jwks endpoint returns 404
		const jwksResponse = await client.$fetch("/jwks");
		expect(jwksResponse.error?.status).toBe(404);

		// Test that session endpoint still returns JWT header
		let jwtHeader = "";
		await client.getSession({
			fetchOptions: {
				headers,
				onSuccess(context) {
					jwtHeader = context.response.headers.get("set-auth-jwt") || "";
				},
			},
		});
		expect(jwtHeader).toBeTruthy();
	});
});

describe("jwt - custom adapter", async () => {
	it("should use custom adapter", async () => {
		const storage: Jwk[] = [];
		const { auth } = await getTestInstance({
			plugins: [
				jwt({
					adapter: {
						getJwks: async () => {
							return storage;
						},
						createJwk: async (data) => {
							const key = {
								...data,
								id: crypto.randomUUID(),
								createdAt: new Date(),
							};
							storage.push(key);
							return key;
						},
					},
				}),
			],
		});
		const token = await auth.api.signJWT({
			body: {
				payload: {
					sub: "123",
				},
			},
		});
		expect(token?.token).toBeDefined();
		expect(storage.length).toBe(1);
	});
});

describe("jwt - custom jwksPath", async () => {
	it("should use custom jwksPath when specified", async () => {
		const { auth } = await getTestInstance({
			plugins: [
				jwt({
					jwks: {
						jwksPath: "/.well-known/jwks.json",
					},
				}),
			],
		});

		const client = createAuthClient({
			plugins: [jwtClient({ jwks: { jwksPath: "/.well-known/jwks.json" } })],
			baseURL: "http://localhost:3000/api/auth",
			fetchOptions: {
				customFetchImpl: async (url, init) => {
					return auth.handler(new Request(url, init));
				},
			},
		});

		const jwks = await client.jwks();
		expect(jwks.error).toBeNull();
		expect(jwks.data?.keys).toBeDefined();
		expect(jwks.data?.keys.length).toBeGreaterThan(0);

		// Verify old /jwks endpoint is not found
		const oldJwks = await client.$fetch<JSONWebKeySet>("/jwks");
		expect(oldJwks.error?.status).toBe(404);
	});
});
