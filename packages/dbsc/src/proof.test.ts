import { base64url, exportJWK, SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { verifyProof } from "./proof";
import { ALGORITHMS, challengeHeader, readItem, readSkipped } from "./protocol";

async function ecKey() {
	const pair = await crypto.subtle.generateKey(
		{ name: "ECDSA", namedCurve: "P-256" },
		true,
		["sign", "verify"],
	);
	return { ...pair, jwk: await exportJWK(pair.publicKey) };
}

async function rsaKey(modulusLength: number) {
	const pair = await crypto.subtle.generateKey(
		{
			name: "RSASSA-PKCS1-v1_5",
			modulusLength,
			publicExponent: new Uint8Array([1, 0, 1]),
			hash: "SHA-256",
		},
		true,
		["sign", "verify"],
	);
	return { ...pair, jwk: await exportJWK(pair.publicKey) };
}

const sign = (
	key: CryptoKey,
	header: Record<string, unknown>,
	payload: Record<string, unknown> = { jti: "challenge" },
) =>
	new SignJWT(payload)
		.setProtectedHeader({ alg: "ES256", typ: "dbsc+jwt", ...header })
		.sign(key);

// jose refuses to produce some malformed proofs, so attackers' are built by hand.
async function signRaw(
	key: CryptoKey,
	header: Record<string, unknown>,
	payload: Record<string, unknown> = { jti: "challenge" },
) {
	const encode = (value: unknown) => base64url.encode(JSON.stringify(value));
	const input = `${encode({ typ: "dbsc+jwt", ...header })}.${encode(payload)}`;
	const algorithm =
		key.algorithm.name === "ECDSA"
			? { name: "ECDSA", hash: "SHA-256" }
			: { name: "RSASSA-PKCS1-v1_5" };
	const signature = await crypto.subtle.sign(
		algorithm,
		key,
		new TextEncoder().encode(input),
	);
	return `${input}.${base64url.encode(new Uint8Array(signature))}`;
}

describe("verifyProof", () => {
	it("returns the signed challenge and a canonical public key", async () => {
		const { privateKey, jwk } = await ecKey();
		const proof = await sign(privateKey, { jwk: { ...jwk, kid: "extra" } });
		const result = await verifyProof(proof, { algorithms: ALGORITHMS });
		expect(result).toEqual({
			challenge: "challenge",
			key: {
				algorithm: "ES256",
				jwk: { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y },
			},
		});
	});

	it("accepts RS256 registration proofs", async () => {
		const { privateKey, jwk } = await rsaKey(2048);
		const proof = await sign(privateKey, { alg: "RS256", jwk });
		expect(await verifyProof(proof, { algorithms: ALGORITHMS })).toMatchObject({
			key: { algorithm: "RS256" },
		});
	});

	it("rejects RSA keys under 2048 bits", async () => {
		const { privateKey, jwk } = await rsaKey(1024);
		const proof = await signRaw(privateKey, { alg: "RS256", jwk });
		expect(await verifyProof(proof, { algorithms: ALGORITHMS })).toEqual({
			error: "invalid_signature",
		});
	});

	it("rejects an algorithm that was not offered", async () => {
		const { privateKey, jwk } = await rsaKey(2048);
		const proof = await sign(privateKey, { alg: "RS256", jwk });
		expect(await verifyProof(proof, { algorithms: ["ES256"] })).toEqual({
			error: "invalid_algorithm",
		});
	});

	it("rejects `alg: none`", async () => {
		const { jwk } = await ecKey();
		const header = base64url.encode(
			JSON.stringify({ alg: "none", typ: "dbsc+jwt", jwk }),
		);
		const payload = base64url.encode(JSON.stringify({ jti: "challenge" }));
		expect(
			await verifyProof(`${header}.${payload}.`, { algorithms: ALGORITHMS }),
		).toEqual({ error: "invalid_algorithm" });
	});

	it("rejects another JWT type", async () => {
		const { privateKey, jwk } = await ecKey();
		const proof = await sign(privateKey, { typ: "dpop+jwt", jwk });
		expect(await verifyProof(proof, { algorithms: ALGORITHMS })).toEqual({
			error: "invalid_type",
		});
	});

	it("rejects a key that does not match the algorithm", async () => {
		const { privateKey } = await ecKey();
		const { jwk } = await rsaKey(2048);
		const proof = await sign(privateKey, { jwk });
		expect(await verifyProof(proof, { algorithms: ALGORITHMS })).toEqual({
			error: "invalid_key",
		});
	});

	it("rejects a point that is not on the curve", async () => {
		const { privateKey, jwk } = await ecKey();
		const proof = await sign(privateKey, { jwk: { ...jwk, y: jwk.x } });
		expect(await verifyProof(proof, { algorithms: ALGORITHMS })).toEqual({
			error: "invalid_key",
		});
	});

	it("rejects an ES256 signature that is not 64-byte r||s", async () => {
		const { privateKey, jwk } = await ecKey();
		const [header, payload, signature] = (
			await sign(privateKey, { jwk })
		).split(".");
		const truncated = base64url.encode(base64url.decode(signature!).slice(1));
		expect(
			await verifyProof(`${header}.${payload}.${truncated}`, {
				algorithms: ALGORITHMS,
			}),
		).toEqual({ error: "invalid_signature" });
	});

	it("rejects an unknown critical header", async () => {
		const { privateKey, jwk } = await ecKey();
		const proof = await signRaw(privateKey, {
			alg: "ES256",
			jwk,
			crit: ["exp"],
			exp: 1,
		});
		expect(await verifyProof(proof, { algorithms: ALGORITHMS })).toEqual({
			error: "invalid_signature",
		});
	});

	it("rejects a proof without a challenge", async () => {
		const { privateKey, jwk } = await ecKey();
		const proof = await sign(privateKey, { jwk }, {});
		expect(await verifyProof(proof, { algorithms: ALGORITHMS })).toEqual({
			error: "malformed_proof",
		});
	});

	it("rejects garbage and oversized input", async () => {
		expect(await verifyProof("a.b.c", { algorithms: ALGORITHMS })).toEqual({
			error: "malformed_proof",
		});
		expect(
			await verifyProof("a".repeat(9000), { algorithms: ALGORITHMS }),
		).toEqual({ error: "malformed_proof" });
	});

	describe("refresh", () => {
		it("verifies against the stored key and algorithm only", async () => {
			const { privateKey, jwk } = await ecKey();
			const key = { jwk, algorithm: "ES256" as const };
			expect(await verifyProof(await sign(privateKey, {}), { key })).toEqual({
				challenge: "challenge",
				key,
			});
			expect(
				await verifyProof(await sign(privateKey, { jwk }), { key }),
			).toEqual({ error: "unexpected_key" });
		});
	});
});

describe("protocol headers", () => {
	it("escapes only backslashes and quotes in a string", () => {
		expect(challengeHeader('a"b\\c', "id")).toBe('"a\\"b\\\\c";id="id"');
	});

	it("refuses a value that cannot be a Structured Field string", () => {
		expect(() => challengeHeader("challenge", "세션")).toThrow(
			/printable ASCII/,
		);
		expect(() => challengeHeader("line\nbreak", "id")).toThrow(
			/printable ASCII/,
		);
	});

	it("rejects a malformed quoted item", () => {
		// No closing quote, an escape other than a backslash or quote, and a
		// character outside printable ASCII.
		expect(readItem('"abc')).toBeNull();
		expect(readItem('"a\\nb"')).toBeNull();
		expect(readItem('"세션"')).toBeNull();
	});

	it("reads quoted and bare items", () => {
		expect(readItem('"a\\"b";x=1')).toBe('a"b');
		expect(readItem("abc;x=1")).toBe("abc");
		expect(readItem("")).toBeNull();
		expect(readItem('""')).toBeNull();
		expect(readItem(null)).toBeNull();
	});

	it("reads skipped refreshes", () => {
		expect(
			readSkipped('unreachable, server_error;session_identifier="s1"'),
		).toEqual([
			{ reason: "unreachable", sessionId: null },
			{ reason: "server_error", sessionId: "s1" },
		]);
	});
});
