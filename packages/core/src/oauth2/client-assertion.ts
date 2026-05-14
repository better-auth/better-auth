import type { JWTHeaderParameters } from "jose";
import { importJWK, importPKCS8, SignJWT } from "jose";

/** Asymmetric signing algorithms compatible with private_key_jwt (RFC 7523). */
export const PRIVATE_KEY_JWT_SIGNING_ALGORITHMS = [
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

export type PrivateKeyJwtSigningAlgorithm =
	(typeof PRIVATE_KEY_JWT_SIGNING_ALGORITHMS)[number];

export const CLIENT_ASSERTION_TYPE =
	"urn:ietf:params:oauth:client-assertion-type:jwt-bearer";

export type ClientAssertionProvider = () => Promise<string>;

export interface PrivateKeyJwtClientAssertionProviderOptions {
	clientId: string;
	tokenEndpoint: string;
	/** Private key in JWK format for signing. */
	privateKeyJwk?: JsonWebKey;
	/** Private key in PKCS#8 PEM format for signing. */
	privateKeyPem?: string;
	/** Key ID to include in the JWT header. */
	kid?: string;
	/** Asymmetric signing algorithm. Symmetric algorithms (HS256) and "none" are not allowed. @default "RS256" */
	algorithm?: PrivateKeyJwtSigningAlgorithm;
	/** Assertion lifetime in seconds. @default 120 */
	expiresIn?: number;
}

/**
 * Signs an RFC 7523 client assertion JWT for `private_key_jwt` authentication.
 *
 * The JWT contains these claims:
 *
 * - iss=clientId
 * - sub=clientId
 * - aud=tokenEndpoint
 * - exp=now + 120s
 * - jti=unique
 * - iat=now
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
	algorithm?: PrivateKeyJwtSigningAlgorithm;
	expiresIn?: number;
}): Promise<string> {
	// Fall back to JWK-embedded kid/alg when not explicitly provided (RFC 7517).
	// JsonWebKey includes alg but not kid; access kid via index.
	const jwk = privateKeyJwk as Record<string, unknown> | undefined;
	const resolvedKid = kid ?? (jwk?.kid as string | undefined);
	const resolvedAlg =
		algorithm ??
		(privateKeyJwk?.alg as PrivateKeyJwtSigningAlgorithm | undefined) ??
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
	if (resolvedKid) {
		header.kid = resolvedKid;
	}

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
 * Creates a client assertion provider for `private_key_jwt` authentication.
 *
 * The returned function signs a fresh RFC 7523 JWT assertion for every token endpoint request.
 */
export function createPrivateKeyJwtClientAssertionProvider(
	options: PrivateKeyJwtClientAssertionProviderOptions,
): ClientAssertionProvider {
	return () => signClientAssertion(options);
}

/**
 * Resolves a client assertion provider into `client_assertion` + `client_assertion_type` params for injection into a token request body.
 */
export async function resolveAssertionParams({
	clientAssertionProvider,
}: {
	clientAssertionProvider: ClientAssertionProvider;
}): Promise<Record<string, string>> {
	const assertion = await clientAssertionProvider();
	return {
		client_assertion: assertion,
		client_assertion_type: CLIENT_ASSERTION_TYPE,
	};
}
