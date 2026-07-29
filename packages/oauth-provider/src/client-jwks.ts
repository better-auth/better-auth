import type { JSONWebKeySet } from "jose";

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
				| "jwks keys must be supported public JWKs with required key parameters";
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

function isSupportedPublicJwk(key: Record<string, unknown>): boolean {
	switch (key.kty) {
		case "RSA":
			return hasStringMember(key, "n") && hasStringMember(key, "e");
		case "EC":
			return (
				hasStringMember(key, "crv") &&
				hasStringMember(key, "x") &&
				hasStringMember(key, "y")
			);
		case "OKP":
			return hasStringMember(key, "crv") && hasStringMember(key, "x");
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
	}

	return {
		valid: true,
		jwks: { keys } as JSONWebKeySet,
	};
}
