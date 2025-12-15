import { afterEach, describe, expect, it, vi } from "vitest";
import * as alg from "./algorithms";

describe("validateSignatureAlgorithm", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("should accept secure signature algorithms", () => {
		expect(() =>
			alg.validateSignatureAlgorithm(alg.SignatureAlgorithm.RSA_SHA256),
		).not.toThrow();
		expect(() =>
			alg.validateSignatureAlgorithm(alg.SignatureAlgorithm.ECDSA_SHA256),
		).not.toThrow();
	});

	it("should warn by default for deprecated algorithms", () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		expect(() =>
			alg.validateSignatureAlgorithm(alg.SignatureAlgorithm.RSA_SHA1),
		).not.toThrow();

		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining("SAML Security Warning"),
		);
	});

	it("should reject deprecated algorithms with onDeprecated: reject", () => {
		expect(() =>
			alg.validateSignatureAlgorithm(alg.SignatureAlgorithm.RSA_SHA1, {
				onDeprecated: "reject",
			}),
		).toThrow(/deprecated/i);
	});

	it("should silently allow deprecated algorithms with onDeprecated: allow", () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		expect(() =>
			alg.validateSignatureAlgorithm(alg.SignatureAlgorithm.RSA_SHA1, {
				onDeprecated: "allow",
			}),
		).not.toThrow();

		expect(warnSpy).not.toHaveBeenCalled();
	});

	it("should enforce custom allow-list", () => {
		expect(() =>
			alg.validateSignatureAlgorithm(alg.SignatureAlgorithm.RSA_SHA256, {
				allowedSignatureAlgorithms: [alg.SignatureAlgorithm.RSA_SHA512],
			}),
		).toThrow(/not in allow-list/i);

		expect(() =>
			alg.validateSignatureAlgorithm(alg.SignatureAlgorithm.RSA_SHA512, {
				allowedSignatureAlgorithms: [alg.SignatureAlgorithm.RSA_SHA512],
			}),
		).not.toThrow();
	});

	it("should pass null/undefined without error", () => {
		expect(() => alg.validateSignatureAlgorithm(null)).not.toThrow();
		expect(() => alg.validateSignatureAlgorithm(undefined)).not.toThrow();
	});

	it("should reject unknown algorithms", () => {
		expect(() =>
			alg.validateSignatureAlgorithm("http://example.com/unknown-algo"),
		).toThrow(/not recognized/i);
	});
});

describe("validateEncryptionAlgorithms", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("should accept secure encryption algorithms", () => {
		expect(() =>
			alg.validateEncryptionAlgorithms({
				keyEncryption: alg.KeyEncryptionAlgorithm.RSA_OAEP,
				dataEncryption: alg.DataEncryptionAlgorithm.AES_256_GCM,
			}),
		).not.toThrow();
	});

	it("should reject RSA 1.5 with onDeprecated: reject", () => {
		expect(() =>
			alg.validateEncryptionAlgorithms(
				{
					keyEncryption: alg.KeyEncryptionAlgorithm.RSA_1_5,
					dataEncryption: alg.DataEncryptionAlgorithm.AES_256_GCM,
				},
				{ onDeprecated: "reject" },
			),
		).toThrow(/rsa-1_5/i);
	});

	it("should reject 3DES with onDeprecated: reject", () => {
		expect(() =>
			alg.validateEncryptionAlgorithms(
				{
					keyEncryption: alg.KeyEncryptionAlgorithm.RSA_OAEP,
					dataEncryption: alg.DataEncryptionAlgorithm.TRIPLEDES_CBC,
				},
				{ onDeprecated: "reject" },
			),
		).toThrow(/tripledes/i);
	});

	it("should warn by default for deprecated encryption algorithms", () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		expect(() =>
			alg.validateEncryptionAlgorithms({
				keyEncryption: alg.KeyEncryptionAlgorithm.RSA_1_5,
				dataEncryption: alg.DataEncryptionAlgorithm.TRIPLEDES_CBC,
			}),
		).not.toThrow();

		expect(warnSpy).toHaveBeenCalled();
	});

	it("should enforce custom allow-lists", () => {
		expect(() =>
			alg.validateEncryptionAlgorithms(
				{
					keyEncryption: alg.KeyEncryptionAlgorithm.RSA_OAEP,
					dataEncryption: null,
				},
				{
					allowedKeyEncryptionAlgorithms: [
						alg.KeyEncryptionAlgorithm.RSA_OAEP_SHA256,
					],
				},
			),
		).toThrow(/not in allow-list/i);
	});

	it("should handle null algorithms gracefully", () => {
		expect(() =>
			alg.validateEncryptionAlgorithms({
				keyEncryption: null,
				dataEncryption: null,
			}),
		).not.toThrow();
	});
});

describe("validateConfigAlgorithms", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("should accept secure config algorithms", () => {
		expect(() =>
			alg.validateConfigAlgorithms({
				signatureAlgorithm: "rsa-sha256",
				digestAlgorithm: "sha256",
			}),
		).not.toThrow();
	});

	it("should warn by default for deprecated config algorithms", () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		expect(() =>
			alg.validateConfigAlgorithms({
				signatureAlgorithm: "rsa-sha1",
				digestAlgorithm: "sha1",
			}),
		).not.toThrow();

		expect(warnSpy).toHaveBeenCalled();
	});

	it("should reject deprecated with onDeprecated: reject", () => {
		expect(() =>
			alg.validateConfigAlgorithms(
				{ signatureAlgorithm: "rsa-sha1" },
				{ onDeprecated: "reject" },
			),
		).toThrow(/deprecated/i);
	});

	it("should handle empty config", () => {
		expect(() => alg.validateConfigAlgorithms({})).not.toThrow();
	});
});

describe("extractEncryptionAlgorithms", () => {
	const encryptedAssertionXml = `
		<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol">
			<saml:EncryptedAssertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">
				<xenc:EncryptedData xmlns:xenc="http://www.w3.org/2001/04/xmlenc#">
					<xenc:EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes256-cbc"/>
					<ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
						<xenc:EncryptedKey>
							<xenc:EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#rsa-oaep-mgf1p"/>
							<xenc:CipherData>
								<xenc:CipherValue>encrypted-key-data</xenc:CipherValue>
							</xenc:CipherData>
						</xenc:EncryptedKey>
					</ds:KeyInfo>
					<xenc:CipherData>
						<xenc:CipherValue>encrypted-assertion-data</xenc:CipherValue>
					</xenc:CipherData>
				</xenc:EncryptedData>
			</saml:EncryptedAssertion>
		</samlp:Response>
	`;

	it("should extract encryption algorithms from XML", () => {
		const result = alg.extractEncryptionAlgorithms(encryptedAssertionXml);
		expect(result.keyEncryption).toBe(alg.KeyEncryptionAlgorithm.RSA_OAEP);
		expect(result.dataEncryption).toBe(alg.DataEncryptionAlgorithm.AES_256_CBC);
	});

	it("should return nulls for non-encrypted XML", () => {
		const plainXml = `
			<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol">
				<saml:Assertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">
					<saml:Subject>test</saml:Subject>
				</saml:Assertion>
			</samlp:Response>
		`;
		const result = alg.extractEncryptionAlgorithms(plainXml);
		expect(result.keyEncryption).toBeNull();
		expect(result.dataEncryption).toBeNull();
	});

	it("should handle malformed XML gracefully", () => {
		const result = alg.extractEncryptionAlgorithms("not valid xml <>");
		expect(result.keyEncryption).toBeNull();
		expect(result.dataEncryption).toBeNull();
	});
});

describe("hasEncryptedAssertion", () => {
	it("should return true for XML with EncryptedAssertion", () => {
		const xml = `
			<Response>
				<EncryptedAssertion>
					<EncryptedData>...</EncryptedData>
				</EncryptedAssertion>
			</Response>
		`;
		expect(alg.hasEncryptedAssertion(xml)).toBe(true);
	});

	it("should return false for plain assertions", () => {
		const xml = `
			<Response>
				<Assertion>
					<Subject>test</Subject>
				</Assertion>
			</Response>
		`;
		expect(alg.hasEncryptedAssertion(xml)).toBe(false);
	});

	it("should return false for malformed XML", () => {
		expect(alg.hasEncryptedAssertion("not xml")).toBe(false);
		expect(alg.hasEncryptedAssertion("")).toBe(false);
	});
});
