import type { JWK, ProtectedHeaderParameters } from "jose";
import { decodeProtectedHeader, importJWK, jwtVerify } from "jose";
import type { Algorithm } from "./protocol";
import { PROOF_TYPE } from "./protocol";

export type ProofKey = {
	jwk: JWK;
	algorithm: Algorithm;
};

export type ProofError =
	| "malformed_proof"
	| "invalid_type"
	| "invalid_algorithm"
	| "invalid_key"
	| "unexpected_key"
	| "invalid_signature";

// Enough for an RS256 registration proof, which carries a 2048-4096 bit key.
const MAX_PROOF_LENGTH = 8192;

/**
 * Verifies a `dbsc+jwt` proof and returns the challenge it signed.
 *
 * A registration proof carries its public key in the header and may use any
 * advertised algorithm. A refresh proof must not carry a key: it is checked
 * against the key stored at registration, so a stolen cookie cannot be
 * re-bound to an attacker's key. Consuming the challenge is the caller's job.
 *
 * jose rejects unknown `crit` headers, RSA keys under 2048 bits and private
 * keys used for verification, and WebCrypto rejects off-curve points and
 * ES256 signatures that are not 64-byte r||s.
 */
export async function verifyProof(
	proof: string,
	expected: { algorithms: readonly Algorithm[] } | { key: ProofKey },
): Promise<{ error: ProofError } | { challenge: string; key: ProofKey }> {
	const header =
		proof.length <= MAX_PROOF_LENGTH ? readProtectedHeader(proof) : null;
	if (!header) return { error: "malformed_proof" };
	if (header.typ !== PROOF_TYPE) return { error: "invalid_type" };

	const key =
		"key" in expected
			? storedKey(header, expected.key)
			: headerKey(header, expected.algorithms);
	if ("error" in key) return key;

	const cryptoKey = await importJWK(key.jwk, key.algorithm).catch(() => null);
	if (!cryptoKey) return { error: "invalid_key" };
	const verified = await jwtVerify(proof, cryptoKey, {
		algorithms: [key.algorithm],
	}).catch(() => null);
	if (!verified) return { error: "invalid_signature" };

	const challenge = verified.payload.jti;
	if (typeof challenge !== "string" || !challenge) {
		return { error: "malformed_proof" };
	}
	return { challenge, key };
}

function readProtectedHeader(proof: string) {
	try {
		return decodeProtectedHeader(proof);
	} catch {
		return null;
	}
}

function storedKey(
	header: ProtectedHeaderParameters,
	key: ProofKey,
): { error: ProofError } | ProofKey {
	if (header.jwk !== undefined) return { error: "unexpected_key" };
	if (header.alg !== key.algorithm) return { error: "invalid_algorithm" };
	return key;
}

function headerKey(
	header: ProtectedHeaderParameters,
	algorithms: readonly Algorithm[],
): { error: ProofError } | ProofKey {
	const algorithm = algorithms.find((alg) => alg === header.alg);
	if (!algorithm) return { error: "invalid_algorithm" };
	const jwk = publicJwk(header.jwk, algorithm);
	if (!jwk) return { error: "invalid_key" };
	return { jwk, algorithm };
}

/**
 * Keeps only the public members the algorithm needs, so what gets stored and
 * thumbprinted is canonical no matter what else the browser sent.
 */
function publicJwk(jwk: JWK | undefined, algorithm: Algorithm): JWK | null {
	if (algorithm === "ES256") {
		const { kty, crv, x, y } = jwk ?? {};
		if (kty !== "EC" || crv !== "P-256") return null;
		if (typeof x !== "string" || !x || typeof y !== "string" || !y) return null;
		return { kty, crv, x, y };
	}
	const { kty, n, e } = jwk ?? {};
	if (kty !== "RSA") return null;
	if (typeof n !== "string" || !n || typeof e !== "string" || !e) return null;
	return { kty, n, e };
}
