// packages/sso/src/saml/algorithms.ts
import { XMLParser } from "fast-xml-parser";
import { APIError } from "better-auth/api";

// =============================================================================
// ALGORITHM CONSTANTS (W3C XML Signature & Encryption URIs)
// =============================================================================

export const SignatureAlgorithm = {
	// Deprecated
	RSA_SHA1: "http://www.w3.org/2000/09/xmldsig#rsa-sha1",
	// Secure
	RSA_SHA256: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
	RSA_SHA384: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha384",
	RSA_SHA512: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha512",
	ECDSA_SHA256: "http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256",
	ECDSA_SHA384: "http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha384",
	ECDSA_SHA512: "http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha512",
} as const;

export const DigestAlgorithm = {
	// Deprecated
	SHA1: "http://www.w3.org/2000/09/xmldsig#sha1",
	// Secure
	SHA256: "http://www.w3.org/2001/04/xmlenc#sha256",
	SHA384: "http://www.w3.org/2001/04/xmldsig-more#sha384",
	SHA512: "http://www.w3.org/2001/04/xmlenc#sha512",
} as const;

export const KeyEncryptionAlgorithm = {
	// Deprecated
	RSA_1_5: "http://www.w3.org/2001/04/xmlenc#rsa-1_5",
	// Secure
	RSA_OAEP: "http://www.w3.org/2001/04/xmlenc#rsa-oaep-mgf1p",
	RSA_OAEP_SHA256: "http://www.w3.org/2009/xmlenc11#rsa-oaep",
} as const;

export const DataEncryptionAlgorithm = {
	// Deprecated
	TRIPLEDES_CBC: "http://www.w3.org/2001/04/xmlenc#tripledes-cbc",
	// Secure (CBC)
	AES_128_CBC: "http://www.w3.org/2001/04/xmlenc#aes128-cbc",
	AES_192_CBC: "http://www.w3.org/2001/04/xmlenc#aes192-cbc",
	AES_256_CBC: "http://www.w3.org/2001/04/xmlenc#aes256-cbc",
	// Secure (GCM - preferred)
	AES_128_GCM: "http://www.w3.org/2009/xmlenc11#aes128-gcm",
	AES_192_GCM: "http://www.w3.org/2009/xmlenc11#aes192-gcm",
	AES_256_GCM: "http://www.w3.org/2009/xmlenc11#aes256-gcm",
} as const;

// =============================================================================
// DEPRECATED ALGORITHM LISTS
// =============================================================================

export const DEPRECATED_SIGNATURE_ALGORITHMS: readonly string[] = [
	SignatureAlgorithm.RSA_SHA1,
];

export const DEPRECATED_DIGEST_ALGORITHMS: readonly string[] = [
	DigestAlgorithm.SHA1,
];

export const DEPRECATED_KEY_ENCRYPTION_ALGORITHMS: readonly string[] = [
	KeyEncryptionAlgorithm.RSA_1_5,
];

export const DEPRECATED_DATA_ENCRYPTION_ALGORITHMS: readonly string[] = [
	DataEncryptionAlgorithm.TRIPLEDES_CBC,
];

// Combined for easy checking
export const ALL_DEPRECATED_ALGORITHMS: readonly string[] = [
	...DEPRECATED_SIGNATURE_ALGORITHMS,
	...DEPRECATED_DIGEST_ALGORITHMS,
	...DEPRECATED_KEY_ENCRYPTION_ALGORITHMS,
	...DEPRECATED_DATA_ENCRYPTION_ALGORITHMS,
];

// =============================================================================
// SECURE ALGORITHM LISTS (Default allow-lists)
// =============================================================================

export const SECURE_SIGNATURE_ALGORITHMS: readonly string[] = [
	SignatureAlgorithm.RSA_SHA256,
	SignatureAlgorithm.RSA_SHA384,
	SignatureAlgorithm.RSA_SHA512,
	SignatureAlgorithm.ECDSA_SHA256,
	SignatureAlgorithm.ECDSA_SHA384,
	SignatureAlgorithm.ECDSA_SHA512,
];

export const SECURE_DIGEST_ALGORITHMS: readonly string[] = [
	DigestAlgorithm.SHA256,
	DigestAlgorithm.SHA384,
	DigestAlgorithm.SHA512,
];

export const SECURE_KEY_ENCRYPTION_ALGORITHMS: readonly string[] = [
	KeyEncryptionAlgorithm.RSA_OAEP,
	KeyEncryptionAlgorithm.RSA_OAEP_SHA256,
];

export const SECURE_DATA_ENCRYPTION_ALGORITHMS: readonly string[] = [
	DataEncryptionAlgorithm.AES_128_CBC,
	DataEncryptionAlgorithm.AES_192_CBC,
	DataEncryptionAlgorithm.AES_256_CBC,
	DataEncryptionAlgorithm.AES_128_GCM,
	DataEncryptionAlgorithm.AES_192_GCM,
	DataEncryptionAlgorithm.AES_256_GCM,
];

// =============================================================================
// VALIDATION OPTIONS
// =============================================================================

export interface AlgorithmValidationOptions {
	/**
	 * Allow deprecated algorithms (SHA-1, RSA 1.5, 3DES).
	 * @default false
	 */
	allowLegacy?: boolean;

	/**
	 * Custom allow-list of signature algorithms.
	 * If provided, only these algorithms are accepted.
	 */
	allowedSignatureAlgorithms?: string[];

	/**
	 * Custom allow-list of digest algorithms.
	 * If provided, only these algorithms are accepted.
	 */
	allowedDigestAlgorithms?: string[];

	/**
	 * Custom allow-list of key encryption algorithms.
	 * If provided, only these algorithms are accepted.
	 */
	allowedKeyEncryptionAlgorithms?: string[];

	/**
	 * Custom allow-list of data encryption algorithms.
	 * If provided, only these algorithms are accepted.
	 */
	allowedDataEncryptionAlgorithms?: string[];

	/**
	 * Warn instead of reject when deprecated algorithms are used.
	 * Useful for migration periods.
	 * @default false
	 */
	warnOnly?: boolean;
}

// =============================================================================
// NORMALIZATION HELPERS
// =============================================================================

/**
 * Normalize algorithm identifier to full URI.
 * Handles both shorthand (e.g., "sha256") and full URIs.
 */
export function normalizeAlgorithm(algorithm: string): string {
	const normalized = algorithm.trim().toLowerCase();

	// Signature algorithm shorthands
	const signatureMap: Record<string, string> = {
		"rsa-sha1": SignatureAlgorithm.RSA_SHA1,
		"rsa-sha256": SignatureAlgorithm.RSA_SHA256,
		"rsa-sha384": SignatureAlgorithm.RSA_SHA384,
		"rsa-sha512": SignatureAlgorithm.RSA_SHA512,
		"ecdsa-sha256": SignatureAlgorithm.ECDSA_SHA256,
		"ecdsa-sha384": SignatureAlgorithm.ECDSA_SHA384,
		"ecdsa-sha512": SignatureAlgorithm.ECDSA_SHA512,
	};

	// Digest algorithm shorthands
	const digestMap: Record<string, string> = {
		sha1: DigestAlgorithm.SHA1,
		sha256: DigestAlgorithm.SHA256,
		sha384: DigestAlgorithm.SHA384,
		sha512: DigestAlgorithm.SHA512,
	};

	return signatureMap[normalized] || digestMap[normalized] || algorithm;
}

// =============================================================================
// CLASSIFICATION HELPERS
// =============================================================================

export function isDeprecatedAlgorithm(algorithm: string): boolean {
	return ALL_DEPRECATED_ALGORITHMS.includes(algorithm);
}

export function isDeprecatedSignatureAlgorithm(algorithm: string): boolean {
	return DEPRECATED_SIGNATURE_ALGORITHMS.includes(algorithm);
}

export function isDeprecatedDigestAlgorithm(algorithm: string): boolean {
	return DEPRECATED_DIGEST_ALGORITHMS.includes(algorithm);
}

export function isDeprecatedEncryptionAlgorithm(algorithm: string): boolean {
	return (
		DEPRECATED_KEY_ENCRYPTION_ALGORITHMS.includes(algorithm) ||
		DEPRECATED_DATA_ENCRYPTION_ALGORITHMS.includes(algorithm)
	);
}

export function isSecureSignatureAlgorithm(algorithm: string): boolean {
	return SECURE_SIGNATURE_ALGORITHMS.includes(algorithm);
}

export function isSecureDigestAlgorithm(algorithm: string): boolean {
	return SECURE_DIGEST_ALGORITHMS.includes(algorithm);
}

// =============================================================================
// XML EXTRACTION (Using fast-xml-parser)
// =============================================================================

const xmlParser = new XMLParser({
	ignoreAttributes: false,
	attributeNamePrefix: "@_",
	removeNSPrefix: true, // Remove namespace prefixes for easier access
});

/**
 * Recursively find a node by name in parsed XML object.
 */
function findNode(obj: unknown, nodeName: string): unknown {
	if (!obj || typeof obj !== "object") return null;

	const record = obj as Record<string, unknown>;

	if (nodeName in record) {
		return record[nodeName];
	}

	for (const value of Object.values(record)) {
		if (Array.isArray(value)) {
			for (const item of value) {
				const found = findNode(item, nodeName);
				if (found) return found;
			}
		} else if (typeof value === "object" && value !== null) {
			const found = findNode(value, nodeName);
			if (found) return found;
		}
	}

	return null;
}

/**
 * Extract encryption algorithms from SAML response XML.
 * Uses fast-xml-parser for parsing.
 */
export function extractEncryptionAlgorithms(xml: string): {
	keyEncryption: string | null;
	dataEncryption: string | null;
} {
	try {
		const parsed = xmlParser.parse(xml);

		// Find EncryptedKey and get its EncryptionMethod Algorithm
		const encryptedKey = findNode(parsed, "EncryptedKey") as Record<
			string,
			unknown
		> | null;
		const keyEncMethod = encryptedKey?.EncryptionMethod as Record<
			string,
			unknown
		> | null;
		const keyAlg = keyEncMethod?.["@_Algorithm"] as string | undefined;

		// Find EncryptedData and get its EncryptionMethod Algorithm
		const encryptedData = findNode(parsed, "EncryptedData") as Record<
			string,
			unknown
		> | null;
		const dataEncMethod = encryptedData?.EncryptionMethod as Record<
			string,
			unknown
		> | null;
		const dataAlg = dataEncMethod?.["@_Algorithm"] as string | undefined;

		return {
			keyEncryption: keyAlg || null,
			dataEncryption: dataAlg || null,
		};
	} catch {
		// If XML parsing fails, return nulls (validation will be skipped)
		return {
			keyEncryption: null,
			dataEncryption: null,
		};
	}
}

/**
 * Check if XML contains encrypted assertions.
 */
export function hasEncryptedAssertion(xml: string): boolean {
	try {
		const parsed = xmlParser.parse(xml);
		return findNode(parsed, "EncryptedAssertion") !== null;
	} catch {
		return false;
	}
}

// =============================================================================
// VALIDATION FUNCTIONS
// =============================================================================

/**
 * Validate signature algorithm from IdP response.
 */
export function validateSignatureAlgorithm(
	algorithm: string | null | undefined,
	options: AlgorithmValidationOptions = {}
): void {
	if (!algorithm) {
		return; // No algorithm to validate (unsigned response - handled elsewhere)
	}

	const {
		allowLegacy = false,
		allowedSignatureAlgorithms,
		warnOnly = false,
	} = options;

	// Check custom allow-list first
	if (allowedSignatureAlgorithms) {
		if (!allowedSignatureAlgorithms.includes(algorithm)) {
			const message = `SAML signature algorithm not in allow-list: ${algorithm}`;
			if (warnOnly) {
				console.warn(`[SAML Security Warning] ${message}`);
				return;
			}
			throw new APIError("BAD_REQUEST", {
				message,
				code: "SAML_ALGORITHM_NOT_ALLOWED",
			});
		}
		return;
	}

	// Check if deprecated
	if (isDeprecatedSignatureAlgorithm(algorithm)) {
		const message =
			`SAML response uses deprecated signature algorithm: ${algorithm}. ` +
			`Please configure your IdP to use SHA-256 or stronger.`;

		if (allowLegacy) {
			console.warn(`[SAML Security Warning] ${message}`);
			return;
		}

		if (warnOnly) {
			console.warn(`[SAML Security Warning] ${message}`);
			return;
		}

		throw new APIError("BAD_REQUEST", {
			message,
			code: "SAML_DEPRECATED_ALGORITHM",
		});
	}

	// Check if known secure algorithm
	if (!isSecureSignatureAlgorithm(algorithm)) {
		const message = `SAML signature algorithm not recognized: ${algorithm}`;
		if (warnOnly) {
			console.warn(`[SAML Security Warning] ${message}`);
			return;
		}
		throw new APIError("BAD_REQUEST", {
			message,
			code: "SAML_UNKNOWN_ALGORITHM",
		});
	}
}

/**
 * Validate encryption algorithms from IdP response.
 */
export function validateEncryptionAlgorithms(
	algorithms: { keyEncryption: string | null; dataEncryption: string | null },
	options: AlgorithmValidationOptions = {}
): void {
	const {
		allowLegacy = false,
		allowedKeyEncryptionAlgorithms,
		allowedDataEncryptionAlgorithms,
		warnOnly = false,
	} = options;

	const { keyEncryption, dataEncryption } = algorithms;

	// Validate key encryption algorithm
	if (keyEncryption) {
		// Check custom allow-list
		if (allowedKeyEncryptionAlgorithms) {
			if (!allowedKeyEncryptionAlgorithms.includes(keyEncryption)) {
				const message = `SAML key encryption algorithm not in allow-list: ${keyEncryption}`;
				if (warnOnly) {
					console.warn(`[SAML Security Warning] ${message}`);
				} else {
					throw new APIError("BAD_REQUEST", {
						message,
						code: "SAML_ALGORITHM_NOT_ALLOWED",
					});
				}
			}
		} else if (DEPRECATED_KEY_ENCRYPTION_ALGORITHMS.includes(keyEncryption)) {
			const message =
				`SAML response uses deprecated key encryption algorithm: ${keyEncryption}. ` +
				`Please configure your IdP to use RSA-OAEP.`;

			if (!allowLegacy && !warnOnly) {
				throw new APIError("BAD_REQUEST", {
					message,
					code: "SAML_DEPRECATED_ALGORITHM",
				});
			}
			console.warn(`[SAML Security Warning] ${message}`);
		}
	}

	// Validate data encryption algorithm
	if (dataEncryption) {
		// Check custom allow-list
		if (allowedDataEncryptionAlgorithms) {
			if (!allowedDataEncryptionAlgorithms.includes(dataEncryption)) {
				const message = `SAML data encryption algorithm not in allow-list: ${dataEncryption}`;
				if (warnOnly) {
					console.warn(`[SAML Security Warning] ${message}`);
				} else {
					throw new APIError("BAD_REQUEST", {
						message,
						code: "SAML_ALGORITHM_NOT_ALLOWED",
					});
				}
			}
		} else if (DEPRECATED_DATA_ENCRYPTION_ALGORITHMS.includes(dataEncryption)) {
			const message =
				`SAML response uses deprecated data encryption algorithm: ${dataEncryption}. ` +
				`Please configure your IdP to use AES-GCM.`;

			if (!allowLegacy && !warnOnly) {
				throw new APIError("BAD_REQUEST", {
					message,
					code: "SAML_DEPRECATED_ALGORITHM",
				});
			}
			console.warn(`[SAML Security Warning] ${message}`);
		}
	}
}

/**
 * Validate config-time algorithms (when registering SAML provider).
 */
export function validateConfigAlgorithms(
	config: {
		signatureAlgorithm?: string;
		digestAlgorithm?: string;
	},
	options: AlgorithmValidationOptions = {}
): void {
	const { signatureAlgorithm, digestAlgorithm } = config;
	const { allowLegacy = false, warnOnly = false } = options;

	if (signatureAlgorithm) {
		const normalized = normalizeAlgorithm(signatureAlgorithm);

		if (isDeprecatedSignatureAlgorithm(normalized)) {
			const message =
				`SAML config uses deprecated signature algorithm: ${signatureAlgorithm}. ` +
				`Consider using SHA-256 or stronger.`;

			if (!allowLegacy && !warnOnly) {
				throw new APIError("BAD_REQUEST", {
					message,
					code: "SAML_DEPRECATED_CONFIG_ALGORITHM",
				});
			}
			console.warn(`[SAML Security Warning] ${message}`);
		}
	}

	if (digestAlgorithm) {
		const normalized = normalizeAlgorithm(digestAlgorithm);

		if (isDeprecatedDigestAlgorithm(normalized)) {
			const message =
				`SAML config uses deprecated digest algorithm: ${digestAlgorithm}. ` +
				`Consider using SHA-256 or stronger.`;

			if (!allowLegacy && !warnOnly) {
				throw new APIError("BAD_REQUEST", {
					message,
					code: "SAML_DEPRECATED_CONFIG_ALGORITHM",
				});
			}
			console.warn(`[SAML Security Warning] ${message}`);
		}
	}
}
