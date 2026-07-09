import { APIError } from "better-auth/api";
import { findNode, xmlParser } from "./parser";

export const SignatureAlgorithm = {
	RSA_SHA1: "http://www.w3.org/2000/09/xmldsig#rsa-sha1",
	RSA_SHA256: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
	RSA_SHA384: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha384",
	RSA_SHA512: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha512",
	ECDSA_SHA256: "http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256",
	ECDSA_SHA384: "http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha384",
	ECDSA_SHA512: "http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha512",
} as const;

export const DigestAlgorithm = {
	SHA1: "http://www.w3.org/2000/09/xmldsig#sha1",
	SHA256: "http://www.w3.org/2001/04/xmlenc#sha256",
	SHA384: "http://www.w3.org/2001/04/xmldsig-more#sha384",
	SHA512: "http://www.w3.org/2001/04/xmlenc#sha512",
} as const;

export const KeyEncryptionAlgorithm = {
	RSA_1_5: "http://www.w3.org/2001/04/xmlenc#rsa-1_5",
	RSA_OAEP: "http://www.w3.org/2001/04/xmlenc#rsa-oaep-mgf1p",
	RSA_OAEP_SHA256: "http://www.w3.org/2009/xmlenc11#rsa-oaep",
} as const;

export const DataEncryptionAlgorithm = {
	TRIPLEDES_CBC: "http://www.w3.org/2001/04/xmlenc#tripledes-cbc",
	AES_128_CBC: "http://www.w3.org/2001/04/xmlenc#aes128-cbc",
	AES_192_CBC: "http://www.w3.org/2001/04/xmlenc#aes192-cbc",
	AES_256_CBC: "http://www.w3.org/2001/04/xmlenc#aes256-cbc",
	AES_128_GCM: "http://www.w3.org/2009/xmlenc11#aes128-gcm",
	AES_192_GCM: "http://www.w3.org/2009/xmlenc11#aes192-gcm",
	AES_256_GCM: "http://www.w3.org/2009/xmlenc11#aes256-gcm",
} as const;

const DEPRECATED_SIGNATURE_ALGORITHMS: readonly string[] = [
	SignatureAlgorithm.RSA_SHA1,
];

const DEPRECATED_KEY_ENCRYPTION_ALGORITHMS: readonly string[] = [
	KeyEncryptionAlgorithm.RSA_1_5,
];

const DEPRECATED_DATA_ENCRYPTION_ALGORITHMS: readonly string[] = [
	DataEncryptionAlgorithm.TRIPLEDES_CBC,
];

const DEPRECATED_DIGEST_ALGORITHMS: readonly string[] = [DigestAlgorithm.SHA1];

const SECURE_SIGNATURE_ALGORITHMS: readonly string[] = [
	SignatureAlgorithm.RSA_SHA256,
	SignatureAlgorithm.RSA_SHA384,
	SignatureAlgorithm.RSA_SHA512,
	SignatureAlgorithm.ECDSA_SHA256,
	SignatureAlgorithm.ECDSA_SHA384,
	SignatureAlgorithm.ECDSA_SHA512,
];

const SECURE_DIGEST_ALGORITHMS: readonly string[] = [
	DigestAlgorithm.SHA256,
	DigestAlgorithm.SHA384,
	DigestAlgorithm.SHA512,
];

const SHORT_FORM_SIGNATURE_TO_URI: Record<string, string> = {
	sha1: SignatureAlgorithm.RSA_SHA1,
	sha256: SignatureAlgorithm.RSA_SHA256,
	sha384: SignatureAlgorithm.RSA_SHA384,
	sha512: SignatureAlgorithm.RSA_SHA512,
	"rsa-sha1": SignatureAlgorithm.RSA_SHA1,
	"rsa-sha256": SignatureAlgorithm.RSA_SHA256,
	"rsa-sha384": SignatureAlgorithm.RSA_SHA384,
	"rsa-sha512": SignatureAlgorithm.RSA_SHA512,
	"ecdsa-sha256": SignatureAlgorithm.ECDSA_SHA256,
	"ecdsa-sha384": SignatureAlgorithm.ECDSA_SHA384,
	"ecdsa-sha512": SignatureAlgorithm.ECDSA_SHA512,
};

const SHORT_FORM_DIGEST_TO_URI: Record<string, string> = {
	sha1: DigestAlgorithm.SHA1,
	sha256: DigestAlgorithm.SHA256,
	sha384: DigestAlgorithm.SHA384,
	sha512: DigestAlgorithm.SHA512,
};

function normalizeSignatureAlgorithm(alg: string): string {
	return SHORT_FORM_SIGNATURE_TO_URI[alg.toLowerCase()] ?? alg;
}

function normalizeDigestAlgorithm(alg: string): string {
	return SHORT_FORM_DIGEST_TO_URI[alg.toLowerCase()] ?? alg;
}

export type DeprecatedAlgorithmBehavior = "reject" | "warn" | "allow";

export interface AlgorithmValidationOptions {
	onDeprecated?: DeprecatedAlgorithmBehavior;
	allowedSignatureAlgorithms?: string[];
	allowedDigestAlgorithms?: string[];
	allowedKeyEncryptionAlgorithms?: string[];
	allowedDataEncryptionAlgorithms?: string[];
}

function extractEncryptionAlgorithms(xml: string): {
	keyEncryption: string | null;
	dataEncryption: string | null;
} {
	try {
		const parsed = xmlParser.parse(xml);

		const encryptedKey = findNode(parsed, "EncryptedKey") as Record<
			string,
			unknown
		> | null;
		const keyEncMethod = encryptedKey?.EncryptionMethod as Record<
			string,
			unknown
		> | null;
		const keyAlg = keyEncMethod?.["@_Algorithm"] as string | undefined;

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
		return {
			keyEncryption: null,
			dataEncryption: null,
		};
	}
}

/**
 * Read SignatureMethod/@Algorithm only from Signature → SignedInfo → SignatureMethod.
 * Ignores SignatureMethod nodes that appear outside a real XML-DSig structure
 * (e.g. untrusted extension elements).
 */
function signatureMethodFromSignatureNode(signature: unknown): string | null {
	if (!signature || typeof signature !== "object") return null;
	const sig = signature as Record<string, unknown>;
	const signedInfo = (sig.SignedInfo ?? sig["ds:SignedInfo"]) as
		| Record<string, unknown>
		| undefined;
	if (!signedInfo || typeof signedInfo !== "object") return null;
	const method = (signedInfo.SignatureMethod ??
		signedInfo["ds:SignatureMethod"]) as Record<string, unknown> | undefined;
	const algorithm = method?.["@_Algorithm"];
	return typeof algorithm === "string" && algorithm.length > 0
		? algorithm
		: null;
}

/**
 * Extract SignatureMethod/@Algorithm from Response or Assertion signatures only.
 * Prefers Response-level Signature, then Assertion-level. Does not take the first
 * SignatureMethod anywhere in the document (which could be an unsigned extension).
 */
export function extractSignatureAlgorithmFromXml(xml: string): string | null {
	try {
		const parsed = xmlParser.parse(xml) as Record<string, unknown>;
		const response = (parsed.Response ??
			parsed["samlp:Response"] ??
			parsed) as Record<string, unknown>;

		// Response-level Signature (direct child of Response)
		const responseSig = response.Signature ?? response["ds:Signature"];
		const fromResponse = Array.isArray(responseSig)
			? signatureMethodFromSignatureNode(responseSig[0])
			: signatureMethodFromSignatureNode(responseSig);
		if (fromResponse) return fromResponse;

		// Assertion-level Signature
		const rawAssertion =
			response.Assertion ??
			response["saml:Assertion"] ??
			parsed.Assertion ??
			parsed["saml:Assertion"];
		const assertion = (
			Array.isArray(rawAssertion) ? rawAssertion[0] : rawAssertion
		) as Record<string, unknown> | undefined;
		if (assertion && typeof assertion === "object") {
			const assertionSig = assertion.Signature ?? assertion["ds:Signature"];
			const fromAssertion = Array.isArray(assertionSig)
				? signatureMethodFromSignatureNode(assertionSig[0])
				: signatureMethodFromSignatureNode(assertionSig);
			if (fromAssertion) return fromAssertion;
		}

		return null;
	} catch {
		return null;
	}
}

function hasEncryptedAssertion(xml: string): boolean {
	try {
		const parsed = xmlParser.parse(xml);
		return findNode(parsed, "EncryptedAssertion") !== null;
	} catch {
		return false;
	}
}

function handleDeprecatedAlgorithm(
	message: string,
	behavior: DeprecatedAlgorithmBehavior,
	errorCode: string,
): void {
	switch (behavior) {
		case "reject":
			throw new APIError("BAD_REQUEST", {
				message,
				code: errorCode,
			});
		case "warn":
			console.warn(`[SAML Security Warning] ${message}`);
			break;
		case "allow":
			break;
	}
}

function validateSignatureAlgorithm(
	algorithm: string | null | undefined,
	options: AlgorithmValidationOptions = {},
): void {
	if (!algorithm) {
		return;
	}

	const { onDeprecated = "warn", allowedSignatureAlgorithms } = options;

	if (allowedSignatureAlgorithms) {
		if (!allowedSignatureAlgorithms.includes(algorithm)) {
			throw new APIError("BAD_REQUEST", {
				message: `SAML signature algorithm not in allow-list: ${algorithm}`,
				code: "SAML_ALGORITHM_NOT_ALLOWED",
			});
		}
		return;
	}

	if (DEPRECATED_SIGNATURE_ALGORITHMS.includes(algorithm)) {
		handleDeprecatedAlgorithm(
			`SAML response uses deprecated signature algorithm: ${algorithm}. Please configure your IdP to use SHA-256 or stronger.`,
			onDeprecated,
			"SAML_DEPRECATED_ALGORITHM",
		);
		return;
	}

	if (!SECURE_SIGNATURE_ALGORITHMS.includes(algorithm)) {
		throw new APIError("BAD_REQUEST", {
			message: `SAML signature algorithm not recognized: ${algorithm}`,
			code: "SAML_UNKNOWN_ALGORITHM",
		});
	}
}

function validateEncryptionAlgorithms(
	algorithms: { keyEncryption: string | null; dataEncryption: string | null },
	options: AlgorithmValidationOptions = {},
): void {
	const {
		onDeprecated = "warn",
		allowedKeyEncryptionAlgorithms,
		allowedDataEncryptionAlgorithms,
	} = options;

	const { keyEncryption, dataEncryption } = algorithms;

	if (keyEncryption) {
		if (allowedKeyEncryptionAlgorithms) {
			if (!allowedKeyEncryptionAlgorithms.includes(keyEncryption)) {
				throw new APIError("BAD_REQUEST", {
					message: `SAML key encryption algorithm not in allow-list: ${keyEncryption}`,
					code: "SAML_ALGORITHM_NOT_ALLOWED",
				});
			}
		} else if (DEPRECATED_KEY_ENCRYPTION_ALGORITHMS.includes(keyEncryption)) {
			handleDeprecatedAlgorithm(
				`SAML response uses deprecated key encryption algorithm: ${keyEncryption}. Please configure your IdP to use RSA-OAEP.`,
				onDeprecated,
				"SAML_DEPRECATED_ALGORITHM",
			);
		}
	}

	if (dataEncryption) {
		if (allowedDataEncryptionAlgorithms) {
			if (!allowedDataEncryptionAlgorithms.includes(dataEncryption)) {
				throw new APIError("BAD_REQUEST", {
					message: `SAML data encryption algorithm not in allow-list: ${dataEncryption}`,
					code: "SAML_ALGORITHM_NOT_ALLOWED",
				});
			}
		} else if (DEPRECATED_DATA_ENCRYPTION_ALGORITHMS.includes(dataEncryption)) {
			handleDeprecatedAlgorithm(
				`SAML response uses deprecated data encryption algorithm: ${dataEncryption}. Please configure your IdP to use AES-GCM.`,
				onDeprecated,
				"SAML_DEPRECATED_ALGORITHM",
			);
		}
	}
}

/**
 * First-class crypto verification report from a SAML executor.
 *
 * Better Auth uses this to apply operator algorithm policy without relying on
 * whether `samlContent` is still encrypted. Every executor (local or remote)
 * returns the same shape so the host path stays uniform.
 */
export interface SAMLCryptoReport {
	/** Executor cryptographically verified the Response signature. */
	signatureVerified: boolean;
	/** Signature method Algorithm URI from the Response (if present). */
	signatureAlgorithm?: string | null;
	/**
	 * Encryption metadata for the assertion before decryption.
	 * - `null` — assertion was not encrypted
	 * - object — was encrypted; both algorithm fields are required so typed
	 *   integrations cannot omit them and fail only at runtime
	 */
	encryption: null | {
		keyTransportAlgorithm: string;
		dataEncryptionAlgorithm: string;
	};
}

/**
 * Build a {@link SAMLCryptoReport} for an executor implementation.
 *
 * Pass `sourceXml` (original Response XML, possibly still encrypted) to auto-fill
 * encryption algorithms. Or set `encryption` explicitly.
 */
export function createSAMLCryptoReport(input: {
	signatureVerified: boolean;
	signatureAlgorithm?: string | null;
	/** Original Response XML before decryption (optional). */
	sourceXml?: string | null;
	/**
	 * Explicit encryption metadata; overrides auto-detect from sourceXml.
	 * Pass `null` when the assertion was unencrypted and sourceXml is unavailable.
	 * Omitting both `encryption` and `sourceXml` fails closed.
	 */
	encryption?: SAMLCryptoReport["encryption"];
}): SAMLCryptoReport {
	// Fail closed: defaulting omitted encryption to null would let custom
	// executors skip encryption allowlists. Require sourceXml or explicit value.
	let encryption: SAMLCryptoReport["encryption"];
	if (input.encryption !== undefined) {
		encryption = input.encryption;
	} else if (input.sourceXml) {
		if (hasEncryptedAssertion(input.sourceXml)) {
			const enc = extractEncryptionAlgorithms(input.sourceXml);
			// Incomplete extraction fails later in enforceSAMLCryptoPolicy.
			encryption = {
				keyTransportAlgorithm: enc.keyEncryption ?? "",
				dataEncryptionAlgorithm: enc.dataEncryption ?? "",
			};
		} else {
			encryption = null;
		}
	} else {
		throw new APIError("BAD_REQUEST", {
			message:
				"SAML crypto report is missing encryption metadata (use null when unencrypted)",
			code: "SAML_ENCRYPTION_METADATA_MISSING",
		});
	}

	let signatureAlgorithm = input.signatureAlgorithm ?? null;
	if (!signatureAlgorithm && input.sourceXml) {
		signatureAlgorithm = extractSignatureAlgorithmFromXml(input.sourceXml);
	}

	return {
		signatureVerified: input.signatureVerified,
		signatureAlgorithm,
		encryption,
	};
}

/**
 * Apply operator algorithm policy to an executor's crypto report.
 * Call this on the Better Auth host after every successful parse.
 *
 * Fail-closed rules:
 * - signatureVerified must be true
 * - signatureAlgorithm must be present (prevents allowlist bypass via omission)
 * - if encryption is non-null, both key and data algorithms must be present
 */
export function enforceSAMLCryptoPolicy(
	report: SAMLCryptoReport,
	options?: AlgorithmValidationOptions,
): void {
	// Require the literal boolean true (transport payloads may send "true"/1).
	if (report.signatureVerified !== true) {
		throw new APIError("BAD_REQUEST", {
			message: "SAML Response signature was not verified by the executor",
			code: "SAML_SIGNATURE_NOT_VERIFIED",
		});
	}

	// Require a non-empty string (reject falsy non-strings from transport JSON).
	if (
		typeof report.signatureAlgorithm !== "string" ||
		report.signatureAlgorithm.length === 0
	) {
		throw new APIError("BAD_REQUEST", {
			message: "SAML crypto report is missing signatureAlgorithm",
			code: "SAML_SIGNATURE_ALGORITHM_MISSING",
		});
	}

	validateSignatureAlgorithm(report.signatureAlgorithm, options);

	// Fail closed: encryption must be explicit null (unencrypted) or a complete object.
	// Omitting the field (undefined) must not bypass encryption algorithm policy.
	if (report.encryption === undefined) {
		throw new APIError("BAD_REQUEST", {
			message:
				"SAML crypto report is missing encryption metadata (use null when unencrypted)",
			code: "SAML_ENCRYPTION_METADATA_MISSING",
		});
	}

	if (report.encryption !== null) {
		if (typeof report.encryption !== "object") {
			throw new APIError("BAD_REQUEST", {
				message: "SAML crypto report encryption metadata is invalid",
				code: "SAML_ENCRYPTION_METADATA_INCOMPLETE",
			});
		}
		const key = report.encryption.keyTransportAlgorithm;
		const data = report.encryption.dataEncryptionAlgorithm;
		if (
			typeof key !== "string" ||
			key.length === 0 ||
			typeof data !== "string" ||
			data.length === 0
		) {
			throw new APIError("BAD_REQUEST", {
				message:
					"SAML crypto report encryption metadata is incomplete (key and data algorithms required)",
				code: "SAML_ENCRYPTION_METADATA_INCOMPLETE",
			});
		}
		validateEncryptionAlgorithms(
			{
				keyEncryption: key,
				dataEncryption: data,
			},
			options,
		);
	}
}

/**
 * Validate algorithms from raw Response XML (and optional sigAlg).
 * Used when the XML may still contain EncryptedAssertion (local samlify path).
 */
export function validateSAMLAlgorithms(
	response: {
		sigAlg?: string | null;
		samlContent: string;
	},
	options?: AlgorithmValidationOptions,
): void {
	const report = createSAMLCryptoReport({
		signatureVerified: true,
		signatureAlgorithm: response.sigAlg,
		sourceXml: response.samlContent,
	});
	// Signature presence is optional in XML-only checks (sigAlg may be null).
	validateSignatureAlgorithm(report.signatureAlgorithm, options);
	if (report.encryption) {
		validateEncryptionAlgorithms(
			{
				keyEncryption: report.encryption.keyTransportAlgorithm ?? null,
				dataEncryption: report.encryption.dataEncryptionAlgorithm ?? null,
			},
			options,
		);
	}
}

export interface ConfigAlgorithmValidationOptions {
	onDeprecated?: DeprecatedAlgorithmBehavior;
	allowedSignatureAlgorithms?: string[];
	allowedDigestAlgorithms?: string[];
}

export function validateConfigAlgorithms(
	config: {
		signatureAlgorithm?: string | undefined;
		digestAlgorithm?: string | undefined;
	},
	options: ConfigAlgorithmValidationOptions = {},
): void {
	const {
		onDeprecated = "warn",
		allowedSignatureAlgorithms,
		allowedDigestAlgorithms,
	} = options;

	if (config.signatureAlgorithm) {
		const normalized = normalizeSignatureAlgorithm(config.signatureAlgorithm);
		if (allowedSignatureAlgorithms) {
			const normalizedAllowList = allowedSignatureAlgorithms.map(
				normalizeSignatureAlgorithm,
			);
			if (!normalizedAllowList.includes(normalized)) {
				throw new APIError("BAD_REQUEST", {
					message: `SAML signature algorithm not in allow-list: ${config.signatureAlgorithm}`,
					code: "SAML_ALGORITHM_NOT_ALLOWED",
				});
			}
		} else if (DEPRECATED_SIGNATURE_ALGORITHMS.includes(normalized)) {
			handleDeprecatedAlgorithm(
				`SAML config uses deprecated signature algorithm: ${config.signatureAlgorithm}. Consider using SHA-256 or stronger.`,
				onDeprecated,
				"SAML_DEPRECATED_CONFIG_ALGORITHM",
			);
		} else if (!SECURE_SIGNATURE_ALGORITHMS.includes(normalized)) {
			throw new APIError("BAD_REQUEST", {
				message: `SAML signature algorithm not recognized: ${config.signatureAlgorithm}`,
				code: "SAML_UNKNOWN_ALGORITHM",
			});
		}
	}

	if (config.digestAlgorithm) {
		const normalized = normalizeDigestAlgorithm(config.digestAlgorithm);
		if (allowedDigestAlgorithms) {
			const normalizedAllowList = allowedDigestAlgorithms.map(
				normalizeDigestAlgorithm,
			);
			if (!normalizedAllowList.includes(normalized)) {
				throw new APIError("BAD_REQUEST", {
					message: `SAML digest algorithm not in allow-list: ${config.digestAlgorithm}`,
					code: "SAML_ALGORITHM_NOT_ALLOWED",
				});
			}
		} else if (DEPRECATED_DIGEST_ALGORITHMS.includes(normalized)) {
			handleDeprecatedAlgorithm(
				`SAML config uses deprecated digest algorithm: ${config.digestAlgorithm}. Consider using SHA-256 or stronger.`,
				onDeprecated,
				"SAML_DEPRECATED_CONFIG_ALGORITHM",
			);
		} else if (!SECURE_DIGEST_ALGORITHMS.includes(normalized)) {
			throw new APIError("BAD_REQUEST", {
				message: `SAML digest algorithm not recognized: ${config.digestAlgorithm}`,
				code: "SAML_UNKNOWN_ALGORITHM",
			});
		}
	}
}
