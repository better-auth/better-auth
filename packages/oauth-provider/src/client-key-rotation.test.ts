import { memoryAdapter } from "@better-auth/memory-adapter";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import type { JWK } from "jose";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { describe, expect, it, vi } from "vitest";
import { oauthProvider } from "./oauth";
import type { OAuthOptions, SchemaClient, Scope } from "./types";

const ASSERTION_TYPE = "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";

type TestKey = {
	kid: string;
	privateKey: CryptoKey;
	publicJwk: JWK & Record<string, unknown>;
};

async function createKey(kid: string): Promise<TestKey> {
	const { privateKey, publicKey } = await generateKeyPair("ES256", {
		extractable: true,
	});
	return {
		kid,
		privateKey: privateKey as CryptoKey,
		publicJwk: { ...(await exportJWK(publicKey)), kid, alg: "ES256" },
	};
}

function createMemoryDatabase() {
	return {
		account: [],
		jwks: [],
		oauthAccessToken: [],
		oauthClient: [],
		oauthClientAssertion: [],
		oauthClientResource: [],
		oauthConsent: [],
		oauthRefreshToken: [],
		oauthResource: [],
		session: [],
		user: [],
		verification: [],
	};
}

const adapters = [
	{
		name: "sqlite",
		config: { testWith: "sqlite" as const },
		database: () => undefined,
	},
	{
		name: "memory adapter",
		config: { testWith: "sqlite" as const },
		database: () => memoryAdapter(createMemoryDatabase()),
	},
	{
		name: "postgres",
		config: { testWith: "postgres" as const },
		database: () => undefined,
	},
];

describe.each(adapters)("client key rotation ($name)", async ({
	name,
	config,
	database,
}) => {
	const baseURL = "http://localhost:3000";
	const apiURL = `${baseURL}/api/auth`;
	const rotateURL = `${apiURL}/oauth2/client/rotate-keys`;
	const introspectURL = `${apiURL}/oauth2/introspect`;
	const trustedClients = new Set<string>();
	const providerOptions = {
		loginPage: "/login",
		consentPage: "/consent",
		cachedTrustedClients: trustedClients,
		allowClientKeyRotation: true,
	} satisfies OAuthOptions<Scope[]>;

	const instance = await getTestInstance(
		{
			baseURL,
			trustedOrigins: ["https://trusted.example.com"],
			...(database() ? { database: database()! } : {}),
			plugins: [jwt(), oauthProvider(providerOptions)],
		},
		config,
	);
	const { auth, signInWithTestUser, customFetchImpl } = instance;
	const { headers } = await signInWithTestUser();
	const context = await auth.$context;

	async function createClient(keys: TestKey[]) {
		const client = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: ["http://localhost:5000/callback"],
				application_type: "native",
				skip_consent: true,
				token_endpoint_auth_method: "private_key_jwt",
				jwks: { keys: keys.map((key) => key.publicJwk) },
			},
		});
		return client!.client_id;
	}

	async function sign(
		clientId: string,
		key: TestKey,
		audience: string,
		jti: string = crypto.randomUUID(),
	) {
		const now = Math.floor(Date.now() / 1000);
		return new SignJWT({})
			.setProtectedHeader({ alg: "ES256", kid: key.kid })
			.setIssuer(clientId)
			.setSubject(clientId)
			.setAudience(audience)
			.setIssuedAt(now)
			.setExpirationTime(now + 120)
			.setJti(jti)
			.sign(key.privateKey);
	}

	/** POSTs the rotation request the way a client would. */
	async function rotate(input: {
		clientId: string;
		signer: TestKey;
		next: TestKey[];
		audience?: string;
		assertion?: string;
	}) {
		const response = await customFetchImpl(rotateURL, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				client_assertion_type: ASSERTION_TYPE,
				client_assertion:
					input.assertion ??
					(await sign(
						input.clientId,
						input.signer,
						input.audience ?? rotateURL,
					)),
				jwks: { keys: input.next.map((key) => key.publicJwk) },
			}),
		});
		return {
			status: response.status,
			headers: response.headers,
			body: (await response.json()) as Record<string, any>,
		};
	}

	/** Authenticates at the introspection endpoint, which verifies the client first. */
	async function authenticate(clientId: string, key: TestKey) {
		const response = await customFetchImpl(introspectURL, {
			method: "POST",
			headers: { "content-type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				token: "not-a-real-token",
				client_assertion_type: ASSERTION_TYPE,
				client_assertion: await sign(clientId, key, introspectURL),
			}),
		});
		return response.status;
	}

	async function readClient(clientId: string) {
		return context.adapter.findOne<SchemaClient<Scope[]>>({
			model: "oauthClient",
			where: [{ field: "clientId", value: clientId }],
		});
	}

	it("is off unless the provider opts in", async () => {
		const closed = await getTestInstance({
			baseURL,
			plugins: [
				jwt(),
				oauthProvider({ loginPage: "/login", consentPage: "/consent" }),
			],
		});
		const response = await closed.customFetchImpl(rotateURL, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				client_assertion_type: ASSERTION_TYPE,
				client_assertion: "a.b.c",
				jwks: { keys: [(await createKey("k")).publicJwk] },
			}),
		});
		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({ error: "access_denied" });
	});

	it("replaces the keys on the client's own authority", async () => {
		const oldKey = await createKey("old");
		const newKey = await createKey("new");
		const clientId = await createClient([oldKey]);

		const rotated = await rotate({
			clientId,
			signer: oldKey,
			next: [newKey],
		});

		expect(rotated.status).toBe(200);
		expect(rotated.headers.get("cache-control")).toContain("no-store");
		expect(rotated.body.client_id).toBe(clientId);
		expect(rotated.body.jwks.keys.map((key: JWK) => key.kid)).toEqual(["new"]);
		expect(await authenticate(clientId, newKey)).toBe(200);
		expect(await authenticate(clientId, oldKey)).toBe(401);
	});

	it("is callable in process through auth.api with typed input and output", async () => {
		const oldKey = await createKey("old");
		const newKey = await createKey("new");
		const clientId = await createClient([oldKey]);

		const rotated = await auth.api.rotateClientKeys({
			body: {
				client_assertion_type: ASSERTION_TYPE,
				client_assertion: await sign(clientId, oldKey, rotateURL),
				jwks: { keys: [newKey.publicJwk] },
			},
		});

		expect(rotated.client_id).toBe(clientId);
		expect(rotated.jwks.keys).toHaveLength(1);
	});

	it("rolls a key in two steps without breaking the old key in between", async () => {
		const keptKey = await createKey("kept");
		const addedKey = await createKey("added");
		const clientId = await createClient([keptKey]);

		const rotated = await rotate({
			clientId,
			signer: keptKey,
			next: [keptKey, addedKey],
		});

		expect(rotated.status).toBe(200);
		expect(await authenticate(clientId, keptKey)).toBe(200);
		expect(await authenticate(clientId, addedKey)).toBe(200);

		const dropped = await rotate({
			clientId,
			signer: addedKey,
			next: [addedKey],
		});
		expect(dropped.status).toBe(200);
		expect(await authenticate(clientId, keptKey)).toBe(401);
		expect(await authenticate(clientId, addedKey)).toBe(200);
	});

	it("does not let a removed key rotate the client again", async () => {
		const removedKey = await createKey("removed");
		const currentKey = await createKey("current");
		const attackerKey = await createKey("attacker");
		const clientId = await createClient([removedKey]);
		await rotate({ clientId, signer: removedKey, next: [currentKey] });

		const takeover = await rotate({
			clientId,
			signer: removedKey,
			next: [attackerKey],
		});

		expect(takeover.status).toBe(401);
		expect(takeover.body.error).toBe("invalid_client");
		expect(await authenticate(clientId, currentKey)).toBe(200);
		expect(await authenticate(clientId, attackerKey)).toBe(401);
	});

	it("rejects an assertion signed by a key the client never registered", async () => {
		const registered = await createKey("registered");
		const stranger = await createKey("registered");
		const clientId = await createClient([registered]);

		const response = await rotate({
			clientId,
			signer: stranger,
			next: [await createKey("new")],
		});

		expect(response.status).toBe(401);
		expect(await authenticate(clientId, registered)).toBe(200);
	});

	it("only accepts an assertion addressed to the rotation endpoint", async () => {
		const oldKey = await createKey("old");
		const clientId = await createClient([oldKey]);
		const next = [await createKey("new")];

		// An assertion minted for the token endpoint, the introspection endpoint, or the
		// issuer is a valid private_key_jwt credential elsewhere. It must not be
		// redirectable here, where it would hand over the client's keys.
		for (const audience of [
			`${apiURL}/oauth2/token`,
			introspectURL,
			apiURL,
			baseURL,
		]) {
			const response = await rotate({
				clientId,
				signer: oldKey,
				next,
				audience,
			});
			expect(response.status, audience).toBe(401);
			expect(response.body.error).toBe("invalid_client");
		}
		expect(await authenticate(clientId, oldKey)).toBe(200);
	});

	// The memory adapter does not enforce the primary key the jti tombstone relies on.
	it.skipIf(name === "memory adapter")(
		"accepts each assertion once",
		async () => {
			const signer = await createKey("signer");
			const clientId = await createClient([signer]);
			const assertion = await sign(clientId, signer, rotateURL);
			const added = await createKey("added");

			// The signer stays in the set, so only the jti stops the replay.
			const first = await rotate({
				clientId,
				signer,
				next: [signer, added],
				assertion,
			});
			const replay = await rotate({
				clientId,
				signer,
				next: [signer, await createKey("attacker")],
				assertion,
			});

			expect(first.status).toBe(200);
			expect(replay.status).toBe(400);
			expect(replay.body.error_description).toContain("already been used");
			expect(await authenticate(clientId, added)).toBe(200);
		},
	);

	it("rejects a malformed or unsafe replacement key set before touching the client", async () => {
		const oldKey = await createKey("old");
		const clientId = await createClient([oldKey]);
		const privateJwk = await exportJWK(oldKey.privateKey);

		const post = async (jwks: unknown) => {
			const response = await customFetchImpl(rotateURL, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					client_assertion_type: ASSERTION_TYPE,
					client_assertion: await sign(clientId, oldKey, rotateURL),
					jwks,
				}),
			});
			return {
				status: response.status,
				body: (await response.json()) as Record<string, any>,
			};
		};

		for (const jwks of [
			{ keys: [] },
			{ keys: [{ kty: "oct", k: "c2VjcmV0" }] },
			{ keys: [{ ...privateJwk, kid: "leaky", alg: "ES256" }] },
		]) {
			const response = await post(jwks);
			expect(response.status).toBe(400);
			expect(response.body.error).toBe("invalid_client_metadata");
		}
		expect(await authenticate(clientId, oldKey)).toBe(200);
	});

	it("leaves clients that do not hold inline keys to their own rotation path", async () => {
		const signer = await createKey("signer");
		const next = [await createKey("next")];
		const secretClient = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: ["http://localhost:5000/callback"],
				application_type: "native",
				skip_consent: true,
			},
		});
		const jwksUriClient = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: ["http://localhost:5000/callback"],
				application_type: "native",
				skip_consent: true,
				token_endpoint_auth_method: "private_key_jwt",
				jwks_uri: "https://trusted.example.com/jwks.json",
			},
		});

		for (const client of [secretClient, jwksUriClient]) {
			const response = await rotate({
				clientId: client!.client_id,
				signer,
				next,
			});
			expect(response.status).toBe(400);
			expect(response.body.error).toBe("invalid_client");
		}
	});

	it("leaves clients configured in code to be updated in code", async () => {
		const oldKey = await createKey("old");
		const clientId = await createClient([oldKey]);
		trustedClients.add(clientId);

		const response = await rotate({
			clientId,
			signer: oldKey,
			next: [await createKey("new")],
		});

		expect(response.status).toBe(400);
		expect(response.body.error_description).toContain("updated manually");
		trustedClients.delete(clientId);
	});

	it("rejects a disabled client", async () => {
		const oldKey = await createKey("old");
		const clientId = await createClient([oldKey]);
		await context.adapter.update({
			model: "oauthClient",
			where: [{ field: "clientId", value: clientId }],
			update: { disabled: true },
		});

		const response = await rotate({
			clientId,
			signer: oldKey,
			next: [await createKey("new")],
		});

		expect(response.status).toBe(400);
		expect(response.body.error_description).toContain("disabled");
	});

	it("loses to a change that lands between verification and write", async () => {
		const oldKey = await createKey("old");
		const newKey = await createKey("new");
		const ownerKey = await createKey("owner");
		const clientId = await createClient([oldKey]);
		const incrementOne = context.adapter.incrementOne;
		vi.spyOn(context.adapter, "incrementOne").mockImplementationOnce(
			async (input) => {
				// The owner replaces the keys after the assertion was verified.
				await context.adapter.update({
					model: "oauthClient",
					where: [{ field: "clientId", value: clientId }],
					update: { jwks: JSON.stringify({ keys: [ownerKey.publicJwk] }) },
				});
				return incrementOne(input);
			},
		);

		const response = await rotate({
			clientId,
			signer: oldKey,
			next: [newKey],
		});

		expect(response.status).toBe(409);
		expect(response.body.error).toBe("invalid_request");
		expect(await authenticate(clientId, ownerKey)).toBe(200);
		expect(await authenticate(clientId, newKey)).toBe(401);
		expect(await authenticate(clientId, oldKey)).toBe(401);
	});

	it("never loses an update when two rotations from the same key race", async () => {
		const oldKey = await createKey("old");
		const keyA = await createKey("a");
		const keyB = await createKey("b");
		const clientId = await createClient([oldKey]);

		const results = await Promise.all([
			rotate({ clientId, signer: oldKey, next: [keyA] }),
			rotate({ clientId, signer: oldKey, next: [keyB] }),
		]);

		// Either the writes interleaved and the stale one lost the guarded write
		// (409), or one finished first and removed the key the other was signed
		// with (401). A silent overwrite must never happen.
		const statuses = results.map((result) => result.status).sort();
		expect(statuses[0]).toBe(200);
		expect([401, 409]).toContain(statuses[1]);
		const stored = await readClient(clientId);
		const active = JSON.parse(stored!.jwks!).keys as JWK[];
		expect(active).toHaveLength(1);
		const activeKey = active[0]!.kid === "a" ? keyA : keyB;
		const otherKey = activeKey === keyA ? keyB : keyA;
		expect(await authenticate(clientId, activeKey)).toBe(200);
		expect(await authenticate(clientId, otherKey)).toBe(401);
		expect(await authenticate(clientId, oldKey)).toBe(401);
	});
});
