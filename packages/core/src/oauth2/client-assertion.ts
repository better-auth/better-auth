import type { JWTHeaderParameters } from "jose";
import { importJWK, importPKCS8, SignJWT } from "jose";

/** Asymmetric signing algorithms compatible with private_key_jwt (RFC 7523). */
export type AssertionSigningAlgorithm =
	| "RS256"
	| "RS384"
	| "RS512"
	| "PS256"
	| "PS384"
	| "PS512"
	| "ES256"
	| "ES384"
	| "ES512"
	| "EdDSA";

export interface ClientAssertionConfig {
	/** Pre-signed JWT assertion string. If provided, signing is skipped. */
	assertion?: string;
	/** Private key in JWK format for signing. */
	privateKeyJwk?: JsonWebKey;
	/** Private key in PKCS#8 PEM format for signing. */
	privateKeyPem?: string;
	/** Key ID to include in the JWT header. */
	kid?: string;
	/** Asymmetric signing algorithm. Symmetric algorithms (HS256) and "none" are not allowed. @default "RS256" */
	algorithm?: AssertionSigningAlgorithm;
	/** Token endpoint URL (used as the JWT `aud` claim). */
	tokenEndpoint?: string;
	/** Assertion lifetime in seconds. @default 120 */
	expiresIn?: number;
}

/**
 * Signs an RFC 7523 client assertion JWT for `private_key_jwt` authentication.
 *
 * The JWT contains: iss=clientId, sub=clientId, aud=tokenEndpoint,
 * exp=now+120s, jti=unique, iat=now.
 */
export async function signClientAssertion({
	clientId,
	tokenEndpoint,
	privateKeyJwk,
	privateKeyPem,
	kid,
	algorithm = "RS256",
	expiresIn = 120,
}: {
	clientId: string;
	tokenEndpoint: string;
	privateKeyJwk?: JsonWebKey;
	privateKeyPem?: string;
	kid?: string;
	algorithm?: AssertionSigningAlgorithm;
	expiresIn?: number;
}): Promise<string> {
	let key: Awaited<ReturnType<typeof importJWK>>;
	if (privateKeyJwk) {
		key = await importJWK(privateKeyJwk, algorithm);
	} else if (privateKeyPem) {
		key = await importPKCS8(privateKeyPem, algorithm);
	} else {
		throw new Error(
			"private_key_jwt requires either privateKeyJwk or privateKeyPem",
		);
	}

	const now = Math.floor(Date.now() / 1000);
	const jti = crypto.randomUUID();

	const header: JWTHeaderParameters = { alg: algorithm, typ: "JWT" };
	if (kid) header.kid = kid;

	return new SignJWT({})
		.setProtectedHeader(header)
		.setIssuer(clientId)
		.setSubject(clientId)
		.setAudience(tokenEndpoint)
		.setIssuedAt(now)
		.setExpirationTime(now + expiresIn)
		.setJti(jti)
		.sign(key);
}
