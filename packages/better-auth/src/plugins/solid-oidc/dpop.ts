import type { DpopSigningAlgorithm } from "@better-auth/core/oauth2";
import {
	DPOP_PROOF_TYPE,
	DPOP_SIGNING_ALGORITHMS,
	deriveDpopAth,
	deriveDpopJkt,
	normalizeDpopHtu,
} from "@better-auth/core/oauth2";
import type { JWK } from "jose";
import { exportJWK, generateKeyPair, importJWK, SignJWT } from "jose";
import { generateRandomString } from "../../crypto/random";

/**
 * Private JWK members that must never be published in a DPoP proof header.
 *
 * @see https://www.rfc-editor.org/rfc/rfc7517.html#section-9.3
 */
const PRIVATE_JWK_MEMBERS = ["d", "p", "q", "dp", "dq", "qi", "oth", "k"];

/**
 * Default proof-signing algorithm. `ES256` is what Solid Protocol Servers
 * advertise in `dpop_signing_alg_values_supported`, and what the Solid client
 * libraries default to.
 *
 * @see https://solidproject.org/TR/oidc#dpop
 */
export const DEFAULT_SOLID_DPOP_ALGORITHM: DpopSigningAlgorithm = "ES256";

/**
 * An ephemeral DPoP key pair bound to one Solid access/refresh token family.
 *
 * `privateJwk` is the signing key and is encrypted at rest by the plugin key
 * store. `publicJwk` is what gets embedded in every proof header, and `jkt` is
 * its RFC 7638 thumbprint — the value the authorization server records in the
 * token's `cnf` claim.
 */
export interface SolidDpopKeyPair {
	algorithm: DpopSigningAlgorithm;
	privateJwk: JWK;
	publicJwk: JWK;
	jkt: string;
}

export interface CreateSolidDpopProofOptions {
	keyPair: SolidDpopKeyPair;
	/** HTTP method of the request the proof is attached to. */
	method: string;
	/**
	 * Target URI. Its query is dropped to form `htu`; a URL carrying a fragment
	 * is rejected rather than silently trimmed, so a proof can never name a
	 * request URL it does not actually match.
	 */
	url: string;
	/**
	 * Access token the proof is presented with. Required for resource requests
	 * so the proof carries the `ath` claim; omitted for token-endpoint requests,
	 * where no access token exists yet.
	 */
	accessToken?: string | undefined;
	/**
	 * Server-supplied DPoP nonce, echoed back as the `nonce` claim.
	 *
	 * @see https://www.rfc-editor.org/rfc/rfc9449.html#section-8
	 */
	nonce?: string | undefined;
	/** Overrides `Date.now()` in tests. */
	nowSeconds?: number | undefined;
}

/**
 * Whether `algorithm` is one of the asymmetric JWS algorithms Better Auth
 * accepts for DPoP proofs.
 */
export function isSolidDpopAlgorithm(
	algorithm: string,
): algorithm is DpopSigningAlgorithm {
	return (DPOP_SIGNING_ALGORITHMS as readonly string[]).includes(algorithm);
}

function assertPublicJwk(publicJwk: JWK) {
	for (const member of PRIVATE_JWK_MEMBERS) {
		if (member in publicJwk) {
			throw new Error(
				"Solid DPoP public JWK must not contain private key material",
			);
		}
	}
}

/**
 * Generates a fresh, extractable DPoP key pair.
 *
 * The key is generated per token exchange rather than per deployment: RFC 9449
 * binds the refresh token to this key, so reusing one key across users would
 * let any holder of one user's refresh token be replayed with another's proof.
 */
export async function generateSolidDpopKeyPair(
	algorithm: DpopSigningAlgorithm = DEFAULT_SOLID_DPOP_ALGORITHM,
): Promise<SolidDpopKeyPair> {
	if (!isSolidDpopAlgorithm(algorithm)) {
		throw new Error(
			`Unsupported Solid DPoP signing algorithm "${algorithm}". Supported: ${DPOP_SIGNING_ALGORITHMS.join(", ")}`,
		);
	}
	// `extractable` is required: the private key is serialized to a JWK so the
	// refresh grant can reuse it after the process that minted it is gone.
	const { privateKey, publicKey } = await generateKeyPair(algorithm, {
		extractable: true,
	});
	const privateJwk = await exportJWK(privateKey);
	const publicJwk = await exportJWK(publicKey);
	assertPublicJwk(publicJwk);
	return {
		algorithm,
		privateJwk,
		publicJwk,
		jkt: await deriveDpopJkt(publicJwk),
	};
}

/**
 * Rebuilds a key pair from a stored private JWK, recomputing the public JWK and
 * thumbprint rather than trusting persisted copies of them.
 */
export async function importSolidDpopKeyPair(
	privateJwk: JWK,
	algorithm: DpopSigningAlgorithm,
): Promise<SolidDpopKeyPair> {
	if (!isSolidDpopAlgorithm(algorithm)) {
		throw new Error(
			`Unsupported Solid DPoP signing algorithm "${algorithm}". Supported: ${DPOP_SIGNING_ALGORITHMS.join(", ")}`,
		);
	}
	const stripped: Record<string, unknown> = { ...privateJwk };
	for (const member of [...PRIVATE_JWK_MEMBERS, "key_ops", "ext"]) {
		delete stripped[member];
	}
	const publicJwk = stripped as JWK;
	assertPublicJwk(publicJwk);
	return {
		algorithm,
		privateJwk,
		publicJwk,
		jkt: await deriveDpopJkt(publicJwk),
	};
}

/**
 * Signs an RFC 9449 DPoP proof JWT for a single request.
 *
 * Proofs are single-use: `jti` is fresh on every call, so a caller must mint a
 * new proof per request instead of caching one.
 *
 * @see https://www.rfc-editor.org/rfc/rfc9449.html#section-4.2
 */
export async function createSolidDpopProof({
	keyPair,
	method,
	url,
	accessToken,
	nonce,
	nowSeconds,
}: CreateSolidDpopProofOptions): Promise<string> {
	const signingKey = await importJWK(keyPair.privateJwk, keyPair.algorithm);
	const issuedAt = nowSeconds ?? Math.floor(Date.now() / 1000);
	const payload: Record<string, unknown> = {
		htm: method.toUpperCase(),
		htu: normalizeDpopHtu(url),
		jti: generateRandomString(32),
	};
	if (accessToken) {
		payload.ath = await deriveDpopAth(accessToken);
	}
	if (nonce) {
		payload.nonce = nonce;
	}
	return new SignJWT(payload)
		.setProtectedHeader({
			alg: keyPair.algorithm,
			typ: DPOP_PROOF_TYPE,
			jwk: keyPair.publicJwk,
		})
		.setIssuedAt(issuedAt)
		.sign(signingKey);
}
