import {
	CLIENT_ASSERTION_TYPE,
	signPrivateKeyJwtClientAssertion,
} from "@better-auth/core/oauth2";
import { memoryAdapter } from "@better-auth/memory-adapter";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import type { JWK } from "jose";
import { exportJWK, generateKeyPair, importJWK, SignJWT } from "jose";
import { describe, expect, it, vi } from "vitest";
import { oauthProvider } from "../oauth";

const baseURL = "http://localhost:3000";
const apiURL = `${baseURL}/api/auth`;
const rotateURL = `${apiURL}/oauth2/client/rotate-keys`;
const introspectURL = `${apiURL}/oauth2/introspect`;

type TestKey = {
	kid: string;
	privateJwk: JWK;
	publicJwk: JWK & Record<string, unknown>;
};

async function createKey(kid: string): Promise<TestKey> {
	const { privateKey, publicKey } = await generateKeyPair("ES256", {
		extractable: true,
	});
	return {
		kid,
		privateJwk: await exportJWK(privateKey),
		publicJwk: { ...(await exportJWK(publicKey)), kid, alg: "ES256" },
	};
}

function sign(clientId: string, key: TestKey, audience = rotateURL) {
	return signPrivateKeyJwtClientAssertion({
		clientId,
		tokenEndpoint: audience,
		privateKeyJwk: key.privateJwk,
		kid: key.kid,
		algorithm: "ES256",
	});
}

async function setup(
	testWith: "sqlite" | "postgres" = "sqlite",
	authBaseURL = baseURL,
) {
	const trustedClients = new Set<string>();
	const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance(
		{
			baseURL: authBaseURL,
			trustedOrigins: ["https://trusted.example.com"],
			plugins: [
				jwt(),
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					cachedTrustedClients: trustedClients,
					allowClientKeyRotation: true,
				}),
			],
		},
		{ testWith },
	);
	const { headers } = await signInWithTestUser();

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

	/** POSTs the rotation request the way a client would. */
	async function rotate(input: {
		clientId: string;
		signer: TestKey;
		next: TestKey[];
		/** Sent instead of `next`, to exercise malformed key sets. */
		jwks?: unknown;
		audience?: string;
		assertion?: string;
	}) {
		const response = await customFetchImpl(rotateURL, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				client_assertion_type: CLIENT_ASSERTION_TYPE,
				client_assertion:
					input.assertion ??
					(await sign(input.clientId, input.signer, input.audience)),
				jwks:
					input.jwks !== undefined
						? input.jwks
						: { keys: input.next.map((key) => key.publicJwk) },
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
				client_assertion_type: CLIENT_ASSERTION_TYPE,
				client_assertion: await sign(clientId, key, introspectURL),
			}),
		});
		return response.status;
	}

	return {
		auth,
		headers,
		trustedClients,
		createClient,
		rotate,
		authenticate,
	};
}

describe("client key rotation", async () => {
	const env = await setup();
	const { auth, headers, trustedClients, createClient, rotate, authenticate } =
		env;

	storageCases(env);

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
				client_assertion_type: CLIENT_ASSERTION_TYPE,
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

		const rotated = await rotate({ clientId, signer: oldKey, next: [newKey] });

		expect(rotated.status).toBe(200);
		expect(rotated.headers.get("cache-control")).toContain("no-store");
		expect(rotated.body.client_id).toBe(clientId);
		expect(rotated.body.jwks.keys.map((key: JWK) => key.kid)).toEqual(["new"]);
		expect(await authenticate(clientId, newKey)).toBe(200);
		expect(await authenticate(clientId, oldKey)).toBe(401);
	});

	it("rolls a key in two steps without breaking the old key in between", async () => {
		const oldKey = await createKey("old");
		const newKey = await createKey("new");
		const clientId = await createClient([oldKey]);

		const added = await rotate({
			clientId,
			signer: oldKey,
			next: [oldKey, newKey],
		});
		expect(added.status).toBe(200);
		expect(await authenticate(clientId, oldKey)).toBe(200);
		expect(await authenticate(clientId, newKey)).toBe(200);

		// In process through auth.api, with typed input and output.
		const dropped = await auth.api.rotateClientKeys({
			body: {
				client_assertion_type: CLIENT_ASSERTION_TYPE,
				client_assertion: await sign(clientId, newKey),
				jwks: { keys: [newKey.publicJwk] },
			},
		});
		expect(dropped.jwks.keys).toHaveLength(1);
		expect(await authenticate(clientId, oldKey)).toBe(401);
		expect(await authenticate(clientId, newKey)).toBe(200);

		// The removed key can no longer rotate the client to someone else's key.
		const attackerKey = await createKey("attacker");
		const takeover = await rotate({
			clientId,
			signer: oldKey,
			next: [attackerKey],
		});
		expect(takeover.status).toBe(401);
		expect(takeover.body.error).toBe("invalid_client");
		expect(await authenticate(clientId, attackerKey)).toBe(401);
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

	it("accepts an audience list only when it names the rotation endpoint", async () => {
		const oldKey = await createKey("old");
		const clientId = await createClient([oldKey]);
		const signFor = async (audience: string[]) =>
			new SignJWT({})
				.setProtectedHeader({ alg: "ES256", kid: oldKey.kid })
				.setIssuer(clientId)
				.setSubject(clientId)
				.setAudience(audience)
				.setIssuedAt()
				.setExpirationTime("1m")
				.setJti(crypto.randomUUID())
				.sign(await importJWK(oldKey.privateJwk, "ES256"));

		const elsewhere = await rotate({
			clientId,
			signer: oldKey,
			next: [await createKey("new")],
			assertion: await signFor([apiURL, baseURL, `${apiURL}/oauth2/token`]),
		});
		const addressed = await rotate({
			clientId,
			signer: oldKey,
			next: [await createKey("new")],
			assertion: await signFor([apiURL, rotateURL]),
		});

		expect(elsewhere.status).toBe(401);
		expect(addressed.status).toBe(200);
	});

	it("rejects a malformed or unsafe replacement key set before touching the client", async () => {
		const oldKey = await createKey("old");
		const clientId = await createClient([oldKey]);

		for (const jwks of [
			{ keys: [] },
			{ keys: [{ kty: "oct", k: "c2VjcmV0" }] },
			{ keys: [{ ...oldKey.privateJwk, kid: "leaky", alg: "ES256" }] },
		]) {
			const response = await rotate({
				clientId,
				signer: oldKey,
				next: [],
				jwks,
			});
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

	it("refuses a trusted client before spending its assertion", async () => {
		const oldKey = await createKey("old");
		const newKey = await createKey("new");
		const clientId = await createClient([oldKey]);
		const assertion = await sign(clientId, oldKey);

		trustedClients.add(clientId);
		const refused = await rotate({
			clientId,
			signer: oldKey,
			next: [newKey],
			assertion,
		});
		trustedClients.delete(clientId);
		expect(refused.status).toBe(400);
		expect(refused.body.error_description).toContain("updated manually");

		// The refusal came before verification, so the jti was never consumed.
		const accepted = await rotate({
			clientId,
			signer: oldKey,
			next: [newKey],
			assertion,
		});
		expect(accepted.status).toBe(200);
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/10800
 */
describe("client key rotation with a trailing-slash baseURL", async () => {
	const { createClient, rotate } = await setup("sqlite", `${apiURL}/`);

	it("accepts an assertion addressed to the URL the client calls", async () => {
		const oldKey = await createKey("old");
		const clientId = await createClient([oldKey]);

		const response = await rotate({
			clientId,
			signer: oldKey,
			next: [await createKey("new")],
		});

		expect(response.status).toBe(200);
	});
});

/**
 * A rotation assertion must be single-use: replaying a captured one while its
 * signing key is still current would hand the client's keys to whoever holds
 * it. The memory adapter does not enforce the primary key the jti tombstone
 * relies on, and `generateId: "serial"` replaces the tombstone's derived id.
 */
describe("client key rotation without single-use assertions", () => {
	const rotationEnabled = oauthProvider({
		loginPage: "/login",
		consentPage: "/consent",
		allowClientKeyRotation: true,
	});

	it("refuses to start on the memory adapter", async () => {
		await expect(
			getTestInstance({
				baseURL,
				database: memoryAdapter({
					account: [],
					jwks: [],
					oauthClient: [],
					session: [],
					user: [],
					verification: [],
				}),
				plugins: [jwt(), rotationEnabled],
			}),
		).rejects.toThrow("single-use");
	});

	it('refuses to start with generateId: "serial"', async () => {
		await expect(
			getTestInstance({
				baseURL,
				advanced: { database: { generateId: "serial" } },
				plugins: [jwt(), rotationEnabled],
			}),
		).rejects.toThrow("single-use");
	});
});

/** Cases that depend on how the database enforces keys and guarded writes. */
function storageCases(env: Awaited<ReturnType<typeof setup>>) {
	const { auth, createClient, rotate, authenticate } = env;

	it("accepts each assertion once", async () => {
		const signer = await createKey("signer");
		const clientId = await createClient([signer]);
		const assertion = await sign(clientId, signer);
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
	});

	it("loses to a change that lands between verification and write", async () => {
		const oldKey = await createKey("old");
		const newKey = await createKey("new");
		const ownerKey = await createKey("owner");
		const clientId = await createClient([oldKey]);
		const context = await auth.$context;
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
		expect(response.headers.get("cache-control")).toContain("no-store");
		expect(await authenticate(clientId, ownerKey)).toBe(200);
		expect(await authenticate(clientId, newKey)).toBe(401);
		expect(await authenticate(clientId, oldKey)).toBe(401);
	});
}

describe("client key rotation storage (postgres)", async () => {
	storageCases(await setup("postgres"));
});
