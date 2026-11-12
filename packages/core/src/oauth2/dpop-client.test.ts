import { decodeJwt, decodeProtectedHeader } from "jose";
import { describe, expect, it, vi } from "vitest";
import { createDpopNonce, deriveDpopAth, verifyDpopProof } from "./dpop";
import {
	createDpopFetch,
	createDpopNonceCache,
	createDpopProof,
	deriveDpopKeyJkt,
	generateDpopKeyPair,
	isDpopNonceError,
} from "./dpop-client";

const NONCE_SECRET = "dpop-client-test-secret";

type FetchCall = { request: Request; proof: string };

/**
 * A fake server that records every request and answers from a script. Each
 * handler receives the request and the DPoP proof it carried.
 */
function createFakeFetch(
	handler: (call: FetchCall, index: number) => Response | Promise<Response>,
) {
	const calls: FetchCall[] = [];
	const fetchImpl = vi.fn(
		async (input: RequestInfo | URL, init?: RequestInit) => {
			const request = new Request(input, init);
			const proof = request.headers.get("DPoP") ?? "";
			const call = { request, proof };
			calls.push(call);
			return handler(call, calls.length - 1);
		},
	);
	return { fetchImpl, calls };
}

function tokenEndpointNonceChallenge(nonce: string) {
	return new Response(
		JSON.stringify({
			error: "use_dpop_nonce",
			error_description: "Authorization server requires nonce in DPoP proof",
		}),
		{
			status: 400,
			headers: { "Content-Type": "application/json", "DPoP-Nonce": nonce },
		},
	);
}

function resourceNonceChallenge(nonce: string) {
	return new Response(null, {
		status: 401,
		headers: {
			"WWW-Authenticate":
				'DPoP error="use_dpop_nonce", error_description="Resource server requires nonce in DPoP proof"',
			"DPoP-Nonce": nonce,
		},
	});
}

describe("createDpopProof", () => {
	it("creates a proof the server verifier accepts", async () => {
		const keyPair = await generateDpopKeyPair();
		const proof = await createDpopProof({
			keyPair,
			method: "post",
			url: "https://as.example.com/oauth2/token",
		});

		const verified = await verifyDpopProof({
			proofJwt: proof,
			method: "POST",
			url: "https://as.example.com/oauth2/token",
		});
		expect(verified.jkt).toBe(await deriveDpopKeyJkt(keyPair));
		expect(verified.htm).toBe("POST");

		const header = decodeProtectedHeader(proof);
		expect(header).toMatchObject({ typ: "dpop+jwt", alg: "ES256" });
		expect(Object.keys(header.jwk ?? {}).sort()).toEqual([
			"crv",
			"kty",
			"x",
			"y",
		]);
	});

	it("generates a non-extractable private key by default", async () => {
		const keyPair = await generateDpopKeyPair();
		expect(keyPair.privateKey.extractable).toBe(false);
		expect(keyPair.publicKey.extractable).toBe(true);
		await expect(
			crypto.subtle.exportKey("jwk", keyPair.privateKey),
		).rejects.toThrow();
	});

	it("drops the query and fragment from htu", async () => {
		const keyPair = await generateDpopKeyPair();
		const proof = await createDpopProof({
			keyPair,
			method: "GET",
			url: "HTTPS://API.Example.com:443/v1/items?limit=10#top",
		});
		expect(decodeJwt(proof).htu).toBe("https://api.example.com/v1/items");
		await verifyDpopProof({
			proofJwt: proof,
			method: "GET",
			url: "https://api.example.com/v1/items?limit=10",
		});
	});

	/**
	 * @see https://datatracker.ietf.org/doc/html/rfc9449#section-7.1
	 */
	it("derives ath as in the RFC 9449 example", async () => {
		expect(
			await deriveDpopAth("Kz~8mXK1EalYznwH-LC-1fBAo.4Ljp~zsPE_NeO.gxU"),
		).toBe("fUHyO2r2Z3DZ53EsNrWBb0xWXoaNy59IiKCAqksmQEo");
	});

	it("binds the access token with ath", async () => {
		const keyPair = await generateDpopKeyPair();
		const proof = await createDpopProof({
			keyPair,
			method: "GET",
			url: "https://api.example.com/v1/items",
			accessToken: "access-token-value",
		});
		expect(decodeJwt(proof).ath).toBe(
			await deriveDpopAth("access-token-value"),
		);
		await verifyDpopProof({
			proofJwt: proof,
			method: "GET",
			url: "https://api.example.com/v1/items",
			accessToken: "access-token-value",
			expectedJkt: await deriveDpopKeyJkt(keyPair),
			requireAth: true,
		});
	});

	it("carries a server nonce the verifier accepts", async () => {
		const keyPair = await generateDpopKeyPair();
		const nonce = await createDpopNonce({ secret: NONCE_SECRET });
		const proof = await createDpopProof({
			keyPair,
			method: "POST",
			url: "https://as.example.com/oauth2/token",
			nonce,
		});
		const verified = await verifyDpopProof({
			proofJwt: proof,
			method: "POST",
			url: "https://as.example.com/oauth2/token",
			nonce: { secret: NONCE_SECRET },
		});
		expect(verified.nonce).toBe(nonce);
	});

	it("uses a fresh jti for each proof", async () => {
		const keyPair = await generateDpopKeyPair();
		const params = {
			keyPair,
			method: "GET",
			url: "https://api.example.com/v1/items",
		};
		const first = decodeJwt(await createDpopProof(params));
		const second = decodeJwt(await createDpopProof(params));
		expect(first.jti).not.toBe(second.jti);
	});

	it.each([
		[
			"Ed25519",
			() =>
				crypto.subtle.generateKey({ name: "Ed25519" }, false, [
					"sign",
					"verify",
				]) as Promise<CryptoKeyPair>,
			"EdDSA",
		],
		[
			"RSA-PSS",
			() =>
				crypto.subtle.generateKey(
					{
						name: "RSA-PSS",
						modulusLength: 2048,
						publicExponent: new Uint8Array([1, 0, 1]),
						hash: "SHA-256",
					},
					false,
					["sign", "verify"],
				),
			"PS256",
		],
		[
			"RSASSA-PKCS1-v1_5",
			() =>
				crypto.subtle.generateKey(
					{
						name: "RSASSA-PKCS1-v1_5",
						modulusLength: 2048,
						publicExponent: new Uint8Array([1, 0, 1]),
						hash: "SHA-256",
					},
					false,
					["sign", "verify"],
				),
			"RS256",
		],
		[
			"ECDSA P-521",
			() =>
				crypto.subtle.generateKey(
					{ name: "ECDSA", namedCurve: "P-521" },
					false,
					["sign", "verify"],
				),
			"ES512",
		],
	])("signs with a caller-provided %s key", async (_name, generate, alg) => {
		const keyPair = await generate();
		const proof = await createDpopProof({
			keyPair,
			method: "GET",
			url: "https://api.example.com/",
		});
		expect(decodeProtectedHeader(proof).alg).toBe(alg);
		const verified = await verifyDpopProof({
			proofJwt: proof,
			method: "GET",
			url: "https://api.example.com/",
		});
		expect(verified.jkt).toBe(await deriveDpopKeyJkt(keyPair));
	});

	it.each([
		["ECDSA P-384", { name: "ECDSA", namedCurve: "P-384" } as EcKeyGenParams],
		[
			"RSA-PSS with SHA-512",
			{
				name: "RSA-PSS",
				modulusLength: 2048,
				publicExponent: new Uint8Array([1, 0, 1]),
				hash: "SHA-512",
			} as RsaHashedKeyGenParams,
		],
	])("rejects a %s key the server does not accept", async (_name, params) => {
		const keyPair = (await crypto.subtle.generateKey(params, false, [
			"sign",
			"verify",
		])) as CryptoKeyPair;
		await expect(
			createDpopProof({
				keyPair,
				method: "GET",
				url: "https://api.example.com/",
			}),
		).rejects.toThrow(TypeError);
		expect(() => createDpopFetch({ keyPair })).toThrow(TypeError);
	});

	it("rejects a key it cannot sign DPoP proofs with", async () => {
		const keyPair = (await crypto.subtle.generateKey(
			{ name: "ECDSA", namedCurve: "P-256" },
			false,
			["sign", "verify"],
		)) as CryptoKeyPair;
		await expect(
			createDpopProof({
				keyPair: {
					privateKey: keyPair.publicKey,
					publicKey: keyPair.publicKey,
				},
				method: "GET",
				url: "https://api.example.com/",
			}),
		).rejects.toThrow(TypeError);

		const hmac = await crypto.subtle.generateKey(
			{ name: "HMAC", hash: "SHA-256" },
			false,
			["sign"],
		);
		await expect(
			createDpopProof({
				keyPair: { privateKey: hmac, publicKey: hmac },
				method: "GET",
				url: "https://api.example.com/",
			}),
		).rejects.toThrow(TypeError);
	});
});

describe("isDpopNonceError", () => {
	it("detects a token endpoint challenge without consuming the body", async () => {
		const response = tokenEndpointNonceChallenge("n1");
		expect(await isDpopNonceError(response)).toBe(true);
		expect(await response.json()).toMatchObject({ error: "use_dpop_nonce" });
	});

	it("detects a resource server challenge", async () => {
		expect(await isDpopNonceError(resourceNonceChallenge("n1"))).toBe(true);
		const lowercase = new Response(null, {
			status: 401,
			headers: {
				"WWW-Authenticate": 'Bearer realm="api", dpop error=use_dpop_nonce',
			},
		});
		expect(await isDpopNonceError(lowercase)).toBe(true);
	});

	it("ignores other errors", async () => {
		const invalidGrant = new Response(
			JSON.stringify({ error: "invalid_grant" }),
			{ status: 400, headers: { "Content-Type": "application/json" } },
		);
		const invalidProof = new Response(null, {
			status: 401,
			headers: { "WWW-Authenticate": 'DPoP error="invalid_dpop_proof"' },
		});
		const bearerOnly = new Response(null, {
			status: 401,
			headers: { "WWW-Authenticate": 'Bearer error="use_dpop_nonce"' },
		});
		const wrongStatus = new Response(
			JSON.stringify({ error: "use_dpop_nonce" }),
			{ status: 401, headers: { "Content-Type": "application/json" } },
		);
		const notJson = new Response("use_dpop_nonce", { status: 400 });
		for (const response of [
			invalidGrant,
			invalidProof,
			bearerOnly,
			wrongStatus,
			notJson,
		]) {
			expect(await isDpopNonceError(response)).toBe(false);
		}
	});
});

describe("createDpopFetch", () => {
	it("sends a proof that matches the request", async () => {
		const keyPair = await generateDpopKeyPair();
		const { fetchImpl, calls } = createFakeFetch(
			() => new Response("{}", { status: 200 }),
		);
		const dpopFetch = createDpopFetch({ keyPair, fetch: fetchImpl });

		await dpopFetch("https://as.example.com/oauth2/token?x=1", {
			method: "POST",
			body: new URLSearchParams({ grant_type: "client_credentials" }),
		});

		expect(calls).toHaveLength(1);
		const verified = await verifyDpopProof({
			proofJwt: calls[0]!.proof,
			method: "POST",
			url: "https://as.example.com/oauth2/token",
		});
		expect(verified.ath).toBeUndefined();
		expect(await calls[0]!.request.text()).toBe(
			"grant_type=client_credentials",
		);
	});

	it("derives ath from a DPoP Authorization header", async () => {
		const keyPair = await generateDpopKeyPair();
		const { fetchImpl, calls } = createFakeFetch(
			() => new Response("{}", { status: 200 }),
		);
		const dpopFetch = createDpopFetch({ keyPair, fetch: fetchImpl });

		await dpopFetch(new URL("https://api.example.com/v1/items"), {
			headers: { Authorization: "DPoP token-123" },
		});

		await verifyDpopProof({
			proofJwt: calls[0]!.proof,
			method: "GET",
			url: "https://api.example.com/v1/items",
			accessToken: "token-123",
			requireAth: true,
		});
	});

	it("accepts a Request as input", async () => {
		const keyPair = await generateDpopKeyPair();
		const { fetchImpl, calls } = createFakeFetch(
			() => new Response("{}", { status: 200 }),
		);
		const dpopFetch = createDpopFetch({ keyPair, fetch: fetchImpl });

		await dpopFetch(
			new Request("https://api.example.com/v1/items", {
				method: "DELETE",
				headers: { Authorization: "dpop token-123" },
			}),
		);

		expect(decodeJwt(calls[0]!.proof)).toMatchObject({
			htm: "DELETE",
			htu: "https://api.example.com/v1/items",
			ath: await deriveDpopAth("token-123"),
		});
	});

	it("retries once on a token endpoint use_dpop_nonce challenge", async () => {
		const keyPair = await generateDpopKeyPair();
		const nonce = await createDpopNonce({ secret: NONCE_SECRET });
		const { fetchImpl, calls } = createFakeFetch((_call, index) =>
			index === 0
				? tokenEndpointNonceChallenge(nonce)
				: new Response(JSON.stringify({ access_token: "at" }), {
						status: 200,
					}),
		);
		const dpopFetch = createDpopFetch({ keyPair, fetch: fetchImpl });

		const response = await dpopFetch("https://as.example.com/oauth2/token", {
			method: "POST",
			body: "grant_type=client_credentials",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
		});

		expect(response.status).toBe(200);
		expect(calls).toHaveLength(2);
		expect(decodeJwt(calls[0]!.proof).nonce).toBeUndefined();
		const retried = await verifyDpopProof({
			proofJwt: calls[1]!.proof,
			method: "POST",
			url: "https://as.example.com/oauth2/token",
			nonce: { secret: NONCE_SECRET },
		});
		expect(retried.nonce).toBe(nonce);
		expect(decodeJwt(calls[1]!.proof).jti).not.toBe(
			decodeJwt(calls[0]!.proof).jti,
		);
		expect(await calls[1]!.request.text()).toBe(
			"grant_type=client_credentials",
		);
	});

	it("retries once on a resource server use_dpop_nonce challenge", async () => {
		const keyPair = await generateDpopKeyPair();
		const { fetchImpl, calls } = createFakeFetch((_call, index) =>
			index === 0
				? resourceNonceChallenge("rs-nonce")
				: new Response("ok", { status: 200 }),
		);
		const dpopFetch = createDpopFetch({ keyPair, fetch: fetchImpl });

		const response = await dpopFetch("https://api.example.com/v1/items", {
			headers: { Authorization: "DPoP token-123" },
		});

		expect(response.status).toBe(200);
		expect(calls).toHaveLength(2);
		expect(decodeJwt(calls[1]!.proof)).toMatchObject({
			nonce: "rs-nonce",
			ath: await deriveDpopAth("token-123"),
		});
	});

	it("does not retry more than once", async () => {
		const keyPair = await generateDpopKeyPair();
		const { fetchImpl, calls } = createFakeFetch((_call, index) =>
			tokenEndpointNonceChallenge(`nonce-${index}`),
		);
		const dpopFetch = createDpopFetch({ keyPair, fetch: fetchImpl });

		const response = await dpopFetch("https://as.example.com/oauth2/token", {
			method: "POST",
		});

		expect(response.status).toBe(400);
		expect(calls).toHaveLength(2);
		expect(await response.json()).toMatchObject({ error: "use_dpop_nonce" });
	});

	it.each([
		[
			"another 400 error",
			() =>
				new Response(JSON.stringify({ error: "invalid_grant" }), {
					status: 400,
					headers: { "DPoP-Nonce": "n1" },
				}),
		],
		[
			"another 401 error",
			() =>
				new Response(null, {
					status: 401,
					headers: {
						"WWW-Authenticate": 'DPoP error="invalid_token"',
						"DPoP-Nonce": "n1",
					},
				}),
		],
		[
			"a challenge without a DPoP-Nonce header",
			() =>
				new Response(JSON.stringify({ error: "use_dpop_nonce" }), {
					status: 400,
				}),
		],
		["a server error", () => new Response(null, { status: 500 })],
	])("does not retry on %s", async (_name, respond) => {
		const keyPair = await generateDpopKeyPair();
		const { fetchImpl, calls } = createFakeFetch(respond);
		const dpopFetch = createDpopFetch({ keyPair, fetch: fetchImpl });

		await dpopFetch("https://as.example.com/oauth2/token", { method: "POST" });

		expect(calls).toHaveLength(1);
	});

	it("does not retry when the challenge repeats the nonce it rejected", async () => {
		const keyPair = await generateDpopKeyPair();
		const nonceCache = createDpopNonceCache();
		await nonceCache.set("https://as.example.com", "stale");
		const { fetchImpl, calls } = createFakeFetch(() =>
			tokenEndpointNonceChallenge("stale"),
		);
		const dpopFetch = createDpopFetch({
			keyPair,
			fetch: fetchImpl,
			nonceCache,
		});

		await dpopFetch("https://as.example.com/oauth2/token", { method: "POST" });

		expect(calls).toHaveLength(1);
	});

	it("keeps nonces for different origins apart", async () => {
		const keyPair = await generateDpopKeyPair();
		const { fetchImpl, calls } = createFakeFetch(({ request }) => {
			const origin = new URL(request.url).origin;
			const nonce =
				origin === "https://as.example.com" ? "as-nonce" : "rs-nonce";
			return new Response("{}", {
				status: 200,
				headers: { "DPoP-Nonce": nonce },
			});
		});
		const dpopFetch = createDpopFetch({ keyPair, fetch: fetchImpl });

		await dpopFetch("https://as.example.com/oauth2/token", { method: "POST" });
		await dpopFetch("https://api.example.com/v1/items", {
			headers: { Authorization: "DPoP at" },
		});
		await dpopFetch("https://as.example.com/oauth2/token", { method: "POST" });
		await dpopFetch("https://api.example.com/v1/items", {
			headers: { Authorization: "DPoP at" },
		});

		expect(calls.map((call) => decodeJwt(call.proof).nonce)).toEqual([
			undefined,
			undefined,
			"as-nonce",
			"rs-nonce",
		]);
	});

	it("keeps a nonce from a redirect target under that origin", async () => {
		const keyPair = await generateDpopKeyPair();
		const nonceCache = createDpopNonceCache();
		const { fetchImpl, calls } = createFakeFetch(() => {
			const response = tokenEndpointNonceChallenge("target-nonce");
			Object.defineProperties(response, {
				redirected: { value: true },
				url: { value: "https://other.example.com/token" },
			});
			return response;
		});
		const dpopFetch = createDpopFetch({
			keyPair,
			fetch: fetchImpl,
			nonceCache,
		});

		await dpopFetch("https://as.example.com/oauth2/token", { method: "POST" });

		expect(calls).toHaveLength(1);
		expect(await nonceCache.get("https://as.example.com")).toBeUndefined();
		expect(await nonceCache.get("https://other.example.com")).toBe(
			"target-nonce",
		);
	});

	it("shares a nonce cache across fetchers", async () => {
		const keyPair = await generateDpopKeyPair();
		const nonceCache = createDpopNonceCache();
		const { fetchImpl, calls } = createFakeFetch(
			() =>
				new Response("{}", {
					status: 200,
					headers: { "DPoP-Nonce": "shared" },
				}),
		);

		await createDpopFetch({ keyPair, fetch: fetchImpl, nonceCache })(
			"https://as.example.com/oauth2/token",
			{ method: "POST" },
		);
		await createDpopFetch({ keyPair, fetch: fetchImpl, nonceCache })(
			"https://as.example.com/oauth2/token",
			{ method: "POST" },
		);

		expect(decodeJwt(calls[1]!.proof).nonce).toBe("shared");
	});
});
