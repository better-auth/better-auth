import { APIError } from "better-auth/api";
import { XMLParser } from "fast-xml-parser";

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

const SECURE_SIGNATURE_ALGORITHMS: readonly string[] = [
	SignatureAlgorithm.RSA_SHA256,
	SignatureAlgorithm.RSA_SHA384,
	SignatureAlgorithm.RSA_SHA512,
	SignatureAlgorithm.ECDSA_SHA256,
	SignatureAlgorithm.ECDSA_SHA384,
	SignatureAlgorithm.ECDSA_SHA512,
];

export type DeprecatedAlgorithmBehavior = "reject" | "warn" | "allow";

export interface AlgorithmValidationOptions {
	onDeprecated?: DeprecatedAlgorithmBehavior;
	allowedSignatureAlgorithms?: string[];
	allowedDigestAlgorithms?: string[];
	allowedKeyEncryptionAlgorithms?: string[];
	allowedDataEncryptionAlgorithms?: string[];
}

const xmlParser = new XMLParser({
	ignoreAttributes: false,
	attributeNamePrefix: "@_",
	removeNSPrefix: true,
});

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

export function validateSAMLAlgorithms(
	response: { sigAlg?: string | null; samlContent: string },
	options?: AlgorithmValidationOptions,
): void {
	validateSignatureAlgorithm(response.sigAlg, options);

	if (hasEncryptedAssertion(response.samlContent)) {
		const encAlgs = extractEncryptionAlgorithms(response.samlContent);
		validateEncryptionAlgorithms(encAlgs, options);
	}
}
