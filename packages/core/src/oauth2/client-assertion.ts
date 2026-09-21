import type { JWTHeaderParameters } from "jose";
import { importJWK, importPKCS8, SignJWT } from "jose";
import type { Awaitable } from "../types";

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

function assertSupportedPrivateKeyJwtAlgorithm(
	candidate: string,
): asserts candidate is PrivateKeyJwtSigningAlgorithm {
	if (
		!(PRIVATE_KEY_JWT_SIGNING_ALGORITHMS as readonly string[]).includes(
			candidate,
		)
	) {
		throw new Error(
			`Unsupported private_key_jwt signing algorithm: ${candidate}. Use one of ${PRIVATE_KEY_JWT_SIGNING_ALGORITHMS.join(", ")}.`,
		);
	}
}

/**
 * Validates `private_key_jwt` options eagerly and returns the algorithm to
 * use for signing.
 *
 * Asserts that key material is configured, that any explicit `algorithm` is
 * supported, that any JWK-embedded `alg` is supported, and that the two
 * agree when both are set.
 */
function resolveValidPrivateKeyJwtOptions(options: {
	privateKeyJwk?: JsonWebKey;
	privateKeyPem?: string;
	algorithm?: PrivateKeyJwtSigningAlgorithm;
}): PrivateKeyJwtSigningAlgorithm {
	if (!options.privateKeyJwk && !options.privateKeyPem) {
		throw new Error(
			"private_key_jwt requires either privateKeyJwk or privateKeyPem",
		);
	}
	if (options.algorithm) {
		assertSupportedPrivateKeyJwtAlgorithm(options.algorithm);
	}
	const jwkAlg = options.privateKeyJwk?.alg;
	if (typeof jwkAlg === "string") {
		assertSupportedPrivateKeyJwtAlgorithm(jwkAlg);
	}
	if (
		options.algorithm &&
		typeof jwkAlg === "string" &&
		options.algorithm !== jwkAlg
	) {
		throw new Error(
			`JWK alg "${jwkAlg}" does not match configured algorithm "${options.algorithm}". Remove the JWK alg field, or pass an algorithm that matches the JWK.`,
		);
	}
	return options.algorithm ?? (typeof jwkAlg === "string" ? jwkAlg : "RS256");
}

export const CLIENT_ASSERTION_TYPE =
	"urn:ietf:params:oauth:client-assertion-type:jwt-bearer";

export type ClientAssertionGrantType =
	| "authorization_code"
	| "refresh_token"
	| "client_credentials";

export interface ClientAssertionContext {
	clientId: string;
	tokenEndpoint: string;
	grantType: ClientAssertionGrantType;
}

export type ClientAssertionGetter = (
	context: ClientAssertionContext,
) => Awaitable<string>;

export interface PrivateKeyJwtClientAssertionGetterOptions {
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
export async function signPrivateKeyJwtClientAssertion({
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
	const resolvedAlg = resolveValidPrivateKeyJwtOptions({
		privateKeyJwk,
		privateKeyPem,
		algorithm,
	});
	// Fall back to the JWK-embedded kid when not explicitly provided (RFC 7517).
	// JsonWebKey types include alg but not kid; access kid via index.
	const jwk = privateKeyJwk as Record<string, unknown> | undefined;
	const resolvedKid = kid ?? (jwk?.kid as string | undefined);

	const key: Awaited<ReturnType<typeof importJWK>> = privateKeyJwk
		? await importJWK(privateKeyJwk, resolvedAlg)
		: await importPKCS8(privateKeyPem as string, resolvedAlg);

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
 * Creates a client assertion getter for `private_key_jwt` authentication.
 *
 * Validates options eagerly (key material, supported algorithm, JWK alg
 * agreement) so misconfiguration surfaces at construction rather than on the
 * first token request. The returned function signs a fresh RFC 7523 JWT
 * assertion for every token endpoint request.
 */
export function createPrivateKeyJwtClientAssertionGetter(
	options: PrivateKeyJwtClientAssertionGetterOptions,
): ClientAssertionGetter {
	resolveValidPrivateKeyJwtOptions({
		privateKeyJwk: options.privateKeyJwk,
		privateKeyPem: options.privateKeyPem,
		algorithm: options.algorithm,
	});
	return ({ clientId, tokenEndpoint }) =>
		signPrivateKeyJwtClientAssertion({
			clientId,
			tokenEndpoint,
			privateKeyJwk: options.privateKeyJwk,
			privateKeyPem: options.privateKeyPem,
			kid: options.kid,
			algorithm: options.algorithm,
			expiresIn: options.expiresIn,
		});
}

/**
 * Resolves a client assertion getter into `client_assertion` + `client_assertion_type` params for injection into a token request body.
 */
export async function resolveClientAssertionParams({
	getClientAssertion,
	context,
}: {
	getClientAssertion: ClientAssertionGetter;
	context: ClientAssertionContext;
}): Promise<Record<string, string>> {
	const assertion = await getClientAssertion(context);
	return {
		client_assertion: assertion,
		client_assertion_type: CLIENT_ASSERTION_TYPE,
	};
}
