import { generateRandomString } from "better-auth/crypto";
import { deriveDpopAth, deriveDpopJkt } from "better-auth/oauth2";
import type { JWK } from "jose";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

/** A client-held DPoP key pair with its public JWK and JWK thumbprint. */
export type DpopKey = Awaited<ReturnType<typeof createDpopKey>>;

/** Generates an extractable ES256 DPoP key. */
export async function createDpopKey() {
	const { privateKey, publicKey } = await generateKeyPair("ES256", {
		extractable: true,
	});
	const publicJwk = await exportJWK(publicKey);
	return { privateKey, publicJwk, jkt: await deriveDpopJkt(publicJwk) };
}

/**
 * Signs a DPoP proof JWT for `method` and `url`. `ath` is derived from
 * `accessToken`; `jti` and `iat` default to a fresh id and the current time.
 */
export async function createDpopProof(
	key: DpopKey,
	params: {
		url: string;
		method?: string;
		accessToken?: string;
		nonce?: string | null;
		jti?: string;
		iat?: number;
	},
) {
	return new SignJWT({
		jti: params.jti ?? generateRandomString(16),
		htm: params.method ?? "POST",
		htu: params.url,
		iat: params.iat ?? Math.floor(Date.now() / 1000),
		...(params.nonce ? { nonce: params.nonce } : {}),
		...(params.accessToken
			? { ath: await deriveDpopAth(params.accessToken) }
			: {}),
	})
		.setProtectedHeader({
			typ: "dpop+jwt",
			alg: "ES256",
			jwk: key.publicJwk as JWK,
		})
		.sign(key.privateKey);
}
