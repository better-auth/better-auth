import { PRIVATE_KEY_JWT_SIGNING_ALGORITHMS } from "@better-auth/core/oauth2";
import type { JSONWebKeySet } from "jose";

const EC_PRIVATE_KEY_JWT_ALGORITHM_BY_CURVE = {
	"P-256": "ES256",
	"P-384": "ES384",
	"P-521": "ES512",
} as const satisfies Record<
	string,
	(typeof PRIVATE_KEY_JWT_SIGNING_ALGORITHMS)[number]
>;
const OKP_PRIVATE_KEY_JWT_SIGNING_CURVES = ["Ed25519"] as const;
const PRIVATE_JWK_MEMBER_NAMES = [
	"d",
	"p",
	"q",
	"dp",
	"dq",
	"qi",
	"oth",
] as const;

export type PublicClientJwksValidationResult =
	| {
			valid: true;
			jwks: JSONWebKeySet;
	  }
	| {
			valid: false;
			error:
				| "jwks must be an RFC 7517 JWK Set object with a non-empty keys array"
				| "jwks must contain only public asymmetric keys"
				| "jwks keys must be supported public JWKs with required key parameters"
				| "jwks key alg must be supported for private_key_jwt and compatible with its key type and signing curve";
	  };

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasStringMember(
	key: Record<string, unknown>,
	memberName: string,
): boolean {
	return typeof key[memberName] === "string" && key[memberName].length > 0;
}

function isSupportedEcSigningCurve(
	curve: unknown,
): curve is keyof typeof EC_PRIVATE_KEY_JWT_ALGORITHM_BY_CURVE {
	return (
		typeof curve === "string" &&
		Object.prototype.hasOwnProperty.call(
			EC_PRIVATE_KEY_JWT_ALGORITHM_BY_CURVE,
			curve,
		)
	);
}

function isSupportedOkpSigningCurve(
	curve: unknown,
): curve is (typeof OKP_PRIVATE_KEY_JWT_SIGNING_CURVES)[number] {
	return OKP_PRIVATE_KEY_JWT_SIGNING_CURVES.some(
		(signingCurve) => signingCurve === curve,
	);
}

function isSupportedPublicJwk(key: Record<string, unknown>): boolean {
	switch (key.kty) {
		case "RSA":
			return hasStringMember(key, "n") && hasStringMember(key, "e");
		case "EC":
			return (
				isSupportedEcSigningCurve(key.crv) &&
				hasStringMember(key, "x") &&
				hasStringMember(key, "y")
			);
		case "OKP":
			return isSupportedOkpSigningCurve(key.crv) && hasStringMember(key, "x");
		default:
			return false;
	}
}

function hasSupportedPrivateKeyJwtAlgorithm(
	key: Record<string, unknown>,
): boolean {
	if (key.alg === undefined) return true;
	if (
		typeof key.alg !== "string" ||
		!PRIVATE_KEY_JWT_SIGNING_ALGORITHMS.some(
			(algorithm) => algorithm === key.alg,
		)
	) {
		return false;
	}

	switch (key.kty) {
		case "RSA":
			return key.alg.startsWith("RS") || key.alg.startsWith("PS");
		case "EC":
			return (
				isSupportedEcSigningCurve(key.crv) &&
				EC_PRIVATE_KEY_JWT_ALGORITHM_BY_CURVE[key.crv] === key.alg
			);
		case "OKP":
			return isSupportedOkpSigningCurve(key.crv) && key.alg === "EdDSA";
		default:
			return false;
	}
}

/**
 * Validates an OAuth client's public asymmetric JWK set.
 *
 * This boundary accepts only the RFC 7517 `{ keys: [...] }` representation.
 * It performs no I/O and returns the validated set for downstream JOSE
 * verification.
 *
 * @internal
 */
export function validatePublicClientJwks(
	input: unknown,
): PublicClientJwksValidationResult {
	const keys =
		isRecord(input) && Array.isArray(input.keys) ? input.keys : undefined;
	if (!keys?.length) {
		return {
			valid: false,
			error:
				"jwks must be an RFC 7517 JWK Set object with a non-empty keys array",
		};
	}

	for (const key of keys) {
		if (!isRecord(key)) {
			return {
				valid: false,
				error:
					"jwks keys must be supported public JWKs with required key parameters",
			};
		}
		if (
			key.kty === "oct" ||
			"k" in key ||
			PRIVATE_JWK_MEMBER_NAMES.some((name) => name in key)
		) {
			return {
				valid: false,
				error: "jwks must contain only public asymmetric keys",
			};
		}
		if (!isSupportedPublicJwk(key)) {
			return {
				valid: false,
				error:
					"jwks keys must be supported public JWKs with required key parameters",
			};
		}
		if (!hasSupportedPrivateKeyJwtAlgorithm(key)) {
			return {
				valid: false,
				error:
					"jwks key alg must be supported for private_key_jwt and compatible with its key type and signing curve",
			};
		}
	}

	return {
		valid: true,
		jwks: { keys } as JSONWebKeySet,
	};
}
