/* cspell:ignore xenc */
import { afterEach, describe, expect, it, vi } from "vitest";
import * as alg from "./algorithms";

const encryptedAssertionXml = `
<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol">
	<saml:EncryptedAssertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">
		<xenc:EncryptedData xmlns:xenc="http://www.w3.org/2001/04/xmlenc#">
			<xenc:EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes256-cbc"/>
			<ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
				<xenc:EncryptedKey>
					<xenc:EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#rsa-oaep-mgf1p"/>
				</xenc:EncryptedKey>
			</ds:KeyInfo>
		</xenc:EncryptedData>
	</saml:EncryptedAssertion>
</samlp:Response>
`;

const deprecatedEncryptionXml = `
<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol">
	<saml:EncryptedAssertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">
		<xenc:EncryptedData xmlns:xenc="http://www.w3.org/2001/04/xmlenc#">
			<xenc:EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#tripledes-cbc"/>
			<ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
				<xenc:EncryptedKey>
					<xenc:EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#rsa-1_5"/>
				</xenc:EncryptedKey>
			</ds:KeyInfo>
		</xenc:EncryptedData>
	</saml:EncryptedAssertion>
</samlp:Response>
`;

const plainAssertionXml = `
<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol">
	<saml:Assertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">
		<saml:Subject>test</saml:Subject>
	</saml:Assertion>
</samlp:Response>
`;

describe("validateSAMLAlgorithms", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("signature validation", () => {
		it("should accept secure signature algorithms", () => {
			expect(() =>
				alg.validateSAMLAlgorithms({
					sigAlg: alg.SignatureAlgorithm.RSA_SHA256,
					samlContent: plainAssertionXml,
				}),
			).not.toThrow();
		});

		it("should warn by default for deprecated signature algorithms", () => {
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

			expect(() =>
				alg.validateSAMLAlgorithms({
					sigAlg: alg.SignatureAlgorithm.RSA_SHA1,
					samlContent: plainAssertionXml,
				}),
			).not.toThrow();

			expect(warnSpy).toHaveBeenCalledWith(
				expect.stringContaining("SAML Security Warning"),
			);
		});

		it("should reject deprecated signature with onDeprecated: reject", () => {
			expect(() =>
				alg.validateSAMLAlgorithms(
					{
						sigAlg: alg.SignatureAlgorithm.RSA_SHA1,
						samlContent: plainAssertionXml,
					},
					{ onDeprecated: "reject" },
				),
			).toThrow(/deprecated/i);
		});

		it("should silently allow deprecated with onDeprecated: allow", () => {
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

			expect(() =>
				alg.validateSAMLAlgorithms(
					{
						sigAlg: alg.SignatureAlgorithm.RSA_SHA1,
						samlContent: plainAssertionXml,
					},
					{ onDeprecated: "allow" },
				),
			).not.toThrow();

			expect(warnSpy).not.toHaveBeenCalled();
		});

		it("should enforce custom signature allow-list", () => {
			expect(() =>
				alg.validateSAMLAlgorithms(
					{
						sigAlg: alg.SignatureAlgorithm.RSA_SHA256,
						samlContent: plainAssertionXml,
					},
					{ allowedSignatureAlgorithms: [alg.SignatureAlgorithm.RSA_SHA512] },
				),
			).toThrow(/not in allow-list/i);
		});

		it("should pass null/undefined sigAlg without error", () => {
			expect(() =>
				alg.validateSAMLAlgorithms({
					sigAlg: null,
					samlContent: plainAssertionXml,
				}),
			).not.toThrow();
		});

		it("should reject unknown signature algorithms", () => {
			expect(() =>
				alg.validateSAMLAlgorithms({
					sigAlg: "http://example.com/unknown-algo",
					samlContent: plainAssertionXml,
				}),
			).toThrow(/not recognized/i);
		});
	});

	describe("encryption validation", () => {
		it("should accept secure encryption algorithms", () => {
			expect(() =>
				alg.validateSAMLAlgorithms({
					sigAlg: alg.SignatureAlgorithm.RSA_SHA256,
					samlContent: encryptedAssertionXml,
				}),
			).not.toThrow();
		});

		it("should warn by default for deprecated encryption algorithms", () => {
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

			expect(() =>
				alg.validateSAMLAlgorithms({
					sigAlg: alg.SignatureAlgorithm.RSA_SHA256,
					samlContent: deprecatedEncryptionXml,
				}),
			).not.toThrow();

			expect(warnSpy).toHaveBeenCalled();
		});

		it("should reject deprecated encryption with onDeprecated: reject", () => {
			expect(() =>
				alg.validateSAMLAlgorithms(
					{
						sigAlg: alg.SignatureAlgorithm.RSA_SHA256,
						samlContent: deprecatedEncryptionXml,
					},
					{ onDeprecated: "reject" },
				),
			).toThrow(/deprecated/i);
		});

		it("should skip encryption validation for plain assertions", () => {
			expect(() =>
				alg.validateSAMLAlgorithms({
					sigAlg: alg.SignatureAlgorithm.RSA_SHA256,
					samlContent: plainAssertionXml,
				}),
			).not.toThrow();
		});

		it("should handle malformed XML gracefully", () => {
			expect(() =>
				alg.validateSAMLAlgorithms({
					sigAlg: alg.SignatureAlgorithm.RSA_SHA256,
					samlContent: "not valid xml",
				}),
			).not.toThrow();
		});
	});
});

describe("algorithm constants", () => {
	it("should export signature algorithm constants", () => {
		expect(alg.SignatureAlgorithm.RSA_SHA256).toBe(
			"http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
		);
		expect(alg.SignatureAlgorithm.RSA_SHA1).toBe(
			"http://www.w3.org/2000/09/xmldsig#rsa-sha1",
		);
	});

	it("should export encryption algorithm constants", () => {
		expect(alg.KeyEncryptionAlgorithm.RSA_OAEP).toBe(
			"http://www.w3.org/2001/04/xmlenc#rsa-oaep-mgf1p",
		);
		expect(alg.DataEncryptionAlgorithm.AES_256_GCM).toBe(
			"http://www.w3.org/2009/xmlenc11#aes256-gcm",
		);
	});
});

describe("validateConfigAlgorithms", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("signature algorithm validation", () => {
		it("should accept secure signature algorithms", () => {
			expect(() =>
				alg.validateConfigAlgorithms({
					signatureAlgorithm: alg.SignatureAlgorithm.RSA_SHA256,
				}),
			).not.toThrow();
		});

		it("should warn by default for deprecated signature algorithms", () => {
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

			expect(() =>
				alg.validateConfigAlgorithms({
					signatureAlgorithm: alg.SignatureAlgorithm.RSA_SHA1,
				}),
			).not.toThrow();

			expect(warnSpy).toHaveBeenCalledWith(
				expect.stringContaining("SAML Security Warning"),
			);
		});

		it("should reject deprecated signature with onDeprecated: reject", () => {
			expect(() =>
				alg.validateConfigAlgorithms(
					{ signatureAlgorithm: alg.SignatureAlgorithm.RSA_SHA1 },
					{ onDeprecated: "reject" },
				),
			).toThrow(/deprecated/i);
		});

		it("should silently allow deprecated with onDeprecated: allow", () => {
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

			expect(() =>
				alg.validateConfigAlgorithms(
					{ signatureAlgorithm: alg.SignatureAlgorithm.RSA_SHA1 },
					{ onDeprecated: "allow" },
				),
			).not.toThrow();

			expect(warnSpy).not.toHaveBeenCalled();
		});

		it("should enforce custom signature allow-list", () => {
			expect(() =>
				alg.validateConfigAlgorithms(
					{ signatureAlgorithm: alg.SignatureAlgorithm.RSA_SHA256 },
					{ allowedSignatureAlgorithms: [alg.SignatureAlgorithm.RSA_SHA512] },
				),
			).toThrow(/not in allow-list/i);
		});

		it("should reject unknown signature algorithms", () => {
			expect(() =>
				alg.validateConfigAlgorithms({
					signatureAlgorithm: "http://example.com/unknown-algo",
				}),
			).toThrow(/not recognized/i);
		});

		it("should pass undefined signatureAlgorithm without error", () => {
			expect(() => alg.validateConfigAlgorithms({})).not.toThrow();
		});

		it("should accept short-form signature algorithm names", () => {
			expect(() =>
				alg.validateConfigAlgorithms({
					signatureAlgorithm: "rsa-sha256",
				}),
			).not.toThrow();
		});

		it("should reject typos in short-form signature algorithm names", () => {
			expect(() =>
				alg.validateConfigAlgorithms({
					signatureAlgorithm: "rsa-sha257",
				}),
			).toThrow(/not recognized/i);
		});

		it("should warn for deprecated short-form signature algorithms", () => {
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

			expect(() =>
				alg.validateConfigAlgorithms({
					signatureAlgorithm: "rsa-sha1",
				}),
			).not.toThrow();

			expect(warnSpy).toHaveBeenCalledWith(
				expect.stringContaining("SAML Security Warning"),
			);
		});

		it("should support short-form names in signature allow-list", () => {
			expect(() =>
				alg.validateConfigAlgorithms(
					{ signatureAlgorithm: "rsa-sha256" },
					{ allowedSignatureAlgorithms: ["rsa-sha256", "rsa-sha512"] },
				),
			).not.toThrow();
		});
	});

	describe("digest algorithm validation", () => {
		it("should accept secure digest algorithms", () => {
			expect(() =>
				alg.validateConfigAlgorithms({
					digestAlgorithm: alg.DigestAlgorithm.SHA256,
				}),
			).not.toThrow();
		});

		it("should warn by default for deprecated digest algorithms", () => {
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

			expect(() =>
				alg.validateConfigAlgorithms({
					digestAlgorithm: alg.DigestAlgorithm.SHA1,
				}),
			).not.toThrow();

			expect(warnSpy).toHaveBeenCalledWith(
				expect.stringContaining("SAML Security Warning"),
			);
		});

		it("should reject deprecated digest with onDeprecated: reject", () => {
			expect(() =>
				alg.validateConfigAlgorithms(
					{ digestAlgorithm: alg.DigestAlgorithm.SHA1 },
					{ onDeprecated: "reject" },
				),
			).toThrow(/deprecated/i);
		});

		it("should enforce custom digest allow-list", () => {
			expect(() =>
				alg.validateConfigAlgorithms(
					{ digestAlgorithm: alg.DigestAlgorithm.SHA256 },
					{ allowedDigestAlgorithms: [alg.DigestAlgorithm.SHA512] },
				),
			).toThrow(/not in allow-list/i);
		});

		it("should reject unknown digest algorithms", () => {
			expect(() =>
				alg.validateConfigAlgorithms({
					digestAlgorithm: "http://example.com/unknown-digest",
				}),
			).toThrow(/not recognized/i);
		});

		it("should accept short-form digest algorithm names", () => {
			expect(() =>
				alg.validateConfigAlgorithms({
					digestAlgorithm: "sha256",
				}),
			).not.toThrow();
		});

		it("should reject typos in short-form digest algorithm names", () => {
			expect(() =>
				alg.validateConfigAlgorithms({
					digestAlgorithm: "sha257",
				}),
			).toThrow(/not recognized/i);
		});

		it("should warn for deprecated short-form digest algorithms", () => {
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

			expect(() =>
				alg.validateConfigAlgorithms({
					digestAlgorithm: "sha1",
				}),
			).not.toThrow();

			expect(warnSpy).toHaveBeenCalledWith(
				expect.stringContaining("SAML Security Warning"),
			);
		});

		it("should support short-form names in digest allow-list", () => {
			expect(() =>
				alg.validateConfigAlgorithms(
					{ digestAlgorithm: "sha256" },
					{ allowedDigestAlgorithms: ["sha256", "sha512"] },
				),
			).not.toThrow();
		});
	});

	describe("combined validation", () => {
		it("should validate both signature and digest algorithms", () => {
			expect(() =>
				alg.validateConfigAlgorithms({
					signatureAlgorithm: alg.SignatureAlgorithm.RSA_SHA256,
					digestAlgorithm: alg.DigestAlgorithm.SHA256,
				}),
			).not.toThrow();
		});

		it("should reject if signature is deprecated even if digest is secure", () => {
			expect(() =>
				alg.validateConfigAlgorithms(
					{
						signatureAlgorithm: alg.SignatureAlgorithm.RSA_SHA1,
						digestAlgorithm: alg.DigestAlgorithm.SHA256,
					},
					{ onDeprecated: "reject" },
				),
			).toThrow(/deprecated/i);
		});

		it("should reject if digest is deprecated even if signature is secure", () => {
			expect(() =>
				alg.validateConfigAlgorithms(
					{
						signatureAlgorithm: alg.SignatureAlgorithm.RSA_SHA256,
						digestAlgorithm: alg.DigestAlgorithm.SHA1,
					},
					{ onDeprecated: "reject" },
				),
			).toThrow(/deprecated/i);
		});
	});
});
