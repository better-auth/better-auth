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
