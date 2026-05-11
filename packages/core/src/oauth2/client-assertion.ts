import type { JWTHeaderParameters } from "jose";
import { importJWK, importPKCS8, SignJWT } from "jose";

/** Asymmetric signing algorithms compatible with private_key_jwt (RFC 7523). */
export const ASSERTION_SIGNING_ALGORITHMS = [
	"RS256",
	"RS384",
	"RS512",
	"PS256",
	"PS384",
	"PS512",
	"ES256",
	"ES384",
	"ES512",
	"EdDSA",
] as const;

export type AssertionSigningAlgorithm =
	(typeof ASSERTION_SIGNING_ALGORITHMS)[number];

export const CLIENT_ASSERTION_TYPE =
	"urn:ietf:params:oauth:client-assertion-type:jwt-bearer";

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
	algorithm,
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
	// Fall back to JWK-embedded kid/alg when not explicitly provided (RFC 7517).
	// JsonWebKey includes alg but not kid; access kid via index.
	const jwk = privateKeyJwk as Record<string, unknown> | undefined;
	const resolvedKid = kid ?? (jwk?.kid as string | undefined);
	const resolvedAlg =
		algorithm ??
		(privateKeyJwk?.alg as AssertionSigningAlgorithm | undefined) ??
		"RS256";

	let key: Awaited<ReturnType<typeof importJWK>>;
	if (privateKeyJwk) {
		key = await importJWK(privateKeyJwk, resolvedAlg);
	} else if (privateKeyPem) {
		key = await importPKCS8(privateKeyPem, resolvedAlg);
	} else {
		throw new Error(
			"private_key_jwt requires either privateKeyJwk or privateKeyPem",
		);
	}

	const now = Math.floor(Date.now() / 1000);
	const jti = crypto.randomUUID();

	const header: JWTHeaderParameters = { alg: resolvedAlg, typ: "JWT" };
	if (resolvedKid) header.kid = resolvedKid;

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

/**
 * Resolves a ClientAssertionConfig into `client_assertion` + `client_assertion_type`
 * params for injection into a token request body.
 */
export async function resolveAssertionParams({
	clientAssertion,
	clientId,
	tokenEndpoint,
}: {
	clientAssertion: ClientAssertionConfig;
	clientId: string;
	tokenEndpoint?: string;
}): Promise<Record<string, string>> {
	let assertion = clientAssertion.assertion;
	if (!assertion) {
		const audEndpoint = tokenEndpoint ?? clientAssertion.tokenEndpoint;
		if (!audEndpoint) {
			throw new Error(
				"private_key_jwt requires a tokenEndpoint for the JWT audience claim",
			);
		}
		assertion = await signClientAssertion({
			clientId,
			tokenEndpoint: audEndpoint,
			privateKeyJwk: clientAssertion.privateKeyJwk,
			privateKeyPem: clientAssertion.privateKeyPem,
			kid: clientAssertion.kid,
			algorithm: clientAssertion.algorithm,
			expiresIn: clientAssertion.expiresIn,
		});
	}
	return {
		client_assertion: assertion,
		client_assertion_type: CLIENT_ASSERTION_TYPE,
	};
}
