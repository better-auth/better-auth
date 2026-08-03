import { describe, expect, it } from "vitest";
import { saml } from "../samlify";
import {
	countAssertions,
	validateSingleAssertion,
	verifySAMLAssertionSignature,
} from "./assertions";

const TEST_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQC0VjkOqj0N7u9b
MTnhAOdWKG4858FzEZR4WHY7oECxYHozETHlrgX8tQz8b6zuEcWrGCHudyWUAyjT
PJ09pwlEuLtdU6KbOpFvmxGkbDMmFSvYicpNqw2oArpEzXaieSMGXKunGJy2sWJP
PC6q7JhgU39Xzsl7kgpPBnLKVrB6xGofQC13ktjOp6D/0N5C8i58seqqviQdfY0f
sgwh7o7OvGrPvSPEdBemCQyvR9IufJzcY+LGyXCeTSx2GGvCAyIglK37nUVjCpYN
ocET/7wZDwxj21Et+D3xrwIgFLcjm3o1fQniHSZ+Mh/82yKbnk0SYfurjuQpm4qP
fF6azBNvAgMBAAECggEAeyHUW5sJjRX0AMQfzO4dBsscWiG0CKmcQn/EWvoUsgg5
59x5wWWNWPsWHtbxsKwZ17TmljhsRB/UJEdi5dHDllS8OgD9KhhXbWjoJuhqFDqo
cXXD2DxPWsRiAtB3jIBB1fo4iiNX/bYodgmVo8dgU4UvkfjzwZf5yfORNW7zmR6U
34w/8B/QO45GaGYfU3wDtX9puASSAfWGhNPSDh2a9kQCsyTjz9jUsR8Y00GA5YyM
a3ZOgOcKWhSUFTRQU2tJtngEWwOy8N4HMIDayG2/xCItB9o9g5KvqV2MyXo7/sjK
yHcSfS1FwM6ZCjyJWBjrNmlcyHwt51Xg2hBmGHBNQQKBgQDrhk+Ck4xTysjHVp5b
LemzHzBY2hOH82b7EB5bmjt9CGi4ESx+CWSqEOiDFx/OFa15CaU4LhKlkXwQufV1
nBU3vqy1ZNj1uVi+P0nltXM+xA7nY0w3oP7Wj32kiSkrNicFsdc19DEZ/bl2qnn9
89R3DePDsSfrFaBP5iKKMQYS1wKBgQDEA6+oasn9eoIXYsf3kuuPvvkMxcK9oPjA
FuLlfqmRCB+cALli5/RUpqg/5TceTd5BOo10huD421kvc1F/ix+RFIbEjpL8UTKn
sKPP39azR/IcNAdSrlCMo1Ab5V78iE3u0glmnMz6mEqQJRtCPYygRH7XVGX5rQGF
ZmiuK3KJKQKBgExKxISqoOEfpewUXdVxSOtx5epSMdNu/+PBs+O+URjOWYWOYpgt
GMOSGI8mNXI/SWMUwcUx/25McyDD7AP93E2jYTSdBz6JnHp768cSANPLFHzViIHY
j9QWxP9AQuqxbvCETA85G5Kswp/y1vNxQViTUj04rJKU/coD5RpYiPwfAoGACYp8
ZGA+UL5D0suWHDDkkmyjRsHhhsVtFjyG8tDFhC+3Cirm2y+bLvuluOZ5VlpH9Tja
Zc+i57oVjz+3udOVx8QOA0dFVE7Hfm4UqyukEbnwyPqnWJjvhsj0P0dc5kHkOTm0
B3CecZw0FOwZdZH1ZF+xJN4Q0KRhLJMdiUzIGHECgYACDkjT8Aj8t5T/hVan1SBg
YAuJuD7CZ4S0Ejpzpq29p1ZGIkUObVutq1e6TNlqX09AZ4mc8j2rqxQGHsWpGXoC
GTiXjqmD0wVhDKVxAQk6ofSsKXIvWvwSIU1nVOW8xKOac+3A1fnCNwIcF+DreXX1
WtR5NoV4s3ccEpQ3ucds0Q==
-----END PRIVATE KEY-----`;

const TEST_CERTIFICATE = `-----BEGIN CERTIFICATE-----
MIICxDCCAawCCQCzwtqqB9Kw0DANBgkqhkiG9w0BAQsFADAkMSIwIAYDVQQDDBlC
ZXR0ZXIgQXV0aCBTQU1MIFRlc3QgSWRQMB4XDTI2MDczMTEwNTMxOVoXDTM2MDcy
ODEwNTMxOVowJDEiMCAGA1UEAwwZQmV0dGVyIEF1dGggU0FNTCBUZXN0IElkUDCC
ASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBALRWOQ6qPQ3u71sxOeEA51Yo
bjznwXMRlHhYdjugQLFgejMRMeWuBfy1DPxvrO4RxasYIe53JZQDKNM8nT2nCUS4
u11Tops6kW+bEaRsMyYVK9iJyk2rDagCukTNdqJ5IwZcq6cYnLaxYk88LqrsmGBT
f1fOyXuSCk8GcspWsHrEah9ALXeS2M6noP/Q3kLyLnyx6qq+JB19jR+yDCHujs68
as+9I8R0F6YJDK9H0i58nNxj4sbJcJ5NLHYYa8IDIiCUrfudRWMKlg2hwRP/vBkP
DGPbUS34PfGvAiAUtyObejV9CeIdJn4yH/zbIpueTRJh+6uO5Cmbio98XprME28C
AwEAATANBgkqhkiG9w0BAQsFAAOCAQEAUUPYWz+fzH34xWLhRpNXdk1OfNeVwYb7
pJGcPReh+0bl5WcyudwX3MaUYWtFkYU6XCX6zIfBrbQdm0J/KQdcdtITPQ/XESQo
BSu3NySpcqjyEwLleHI7k4urE03T0LwiaGywyVMYkxD8aQwIkoLOIFX6+5dnYnNv
DYuat3WCusVdr36EzsHdxkjLR9pjH/TOvb+a1V5EeUrvo/o0s3dmV53sYUu9o+uE
F/Aspp/I9A4sWaZ7gZuHLJWqu2JeVLqFSYDik8BINLgBT8WHsjlpxjOZbmF6TK2H
ygOFfRgdqY9FjlD0qkyBH2tqYhoOyIdIZi/4zTd3L3sLx18mib4KVA==
-----END CERTIFICATE-----`;

const TEST_SIGNATURE_ALGORITHM =
	"http://www.w3.org/2001/04/xmldsig-more#rsa-sha256";
const TEST_CERTIFICATE_BODY = saml.Utility.normalizeCerString(TEST_CERTIFICATE);

function createUnsignedResponse(assertionContent = "<saml:Subject />") {
	return `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_response">
		<saml:Issuer>https://idp.example.com</saml:Issuer>
		<saml:Assertion ID="_assertion">
			<saml:Issuer>https://idp.example.com</saml:Issuer>
			${assertionContent}
		</saml:Assertion>
	</samlp:Response>`;
}

function signResponse(xml: string, assertion: boolean) {
	return saml.SamlLib.constructSAMLSignature({
		rawSamlMessage: xml,
		referenceTagXPath: assertion
			? "/*[local-name(.)='Response']/*[local-name(.)='Assertion']"
			: undefined,
		privateKey: TEST_PRIVATE_KEY,
		signatureAlgorithm: TEST_SIGNATURE_ALGORITHM,
		signingCert: TEST_CERTIFICATE_BODY,
		isBase64Output: false,
		isMessageSigned: !assertion,
		signatureConfig: {
			prefix: "ds",
			location: {
				reference: assertion
					? "/*[local-name(.)='Response']/*[local-name(.)='Assertion']/*[local-name(.)='Issuer']"
					: "/*[local-name(.)='Response']/*[local-name(.)='Issuer']",
				action: "after",
			},
		},
	});
}

const assertionVerificationOptions = {
	metadata: saml.IdentityProvider({
		entityID: "https://idp.example.com",
		signingCert: TEST_CERTIFICATE,
		singleSignOnService: [
			{
				Binding: "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect",
				Location: "https://idp.example.com/sso",
			},
		],
	}).entityMeta,
	signatureAlgorithm: TEST_SIGNATURE_ALGORITHM,
};

describe("validateSingleAssertion", () => {
	const encode = (xml: string) => Buffer.from(xml).toString("base64");

	describe("valid responses (exactly 1 assertion)", () => {
		it("should accept response with single assertion", () => {
			const xml = `
				<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">
					<saml:Assertion ID="123">
						<saml:Subject><saml:NameID>user@example.com</saml:NameID></saml:Subject>
					</saml:Assertion>
				</samlp:Response>
			`;
			expect(() => validateSingleAssertion(encode(xml))).not.toThrow();
		});

		it("should accept response with single encrypted assertion", () => {
			const xml = `
				<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">
					<saml:EncryptedAssertion>
						<xenc:EncryptedData>...</xenc:EncryptedData>
					</saml:EncryptedAssertion>
				</samlp:Response>
			`;
			expect(() => validateSingleAssertion(encode(xml))).not.toThrow();
		});
	});

	describe("base64 whitespace handling", () => {
		/**
		 * @see https://github.com/better-auth/better-auth/issues/8921
		 */
		it("should accept base64 with embedded whitespace from line-wrapping IDPs", () => {
			const xml = `
				<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">
					<saml:Assertion ID="123">
						<saml:Subject><saml:NameID>user@example.com</saml:NameID></saml:Subject>
					</saml:Assertion>
				</samlp:Response>
			`;
			const b64 = encode(xml);

			const wrappedLf = b64.replace(/.{76}/g, "$&\n");
			const wrappedCrLf = b64.replace(/.{76}/g, "$&\r\n");
			const wrappedSpacesAndTabs = b64.replace(/.{20}/g, "$& \t ");

			expect(wrappedLf).toContain("\n");
			expect(wrappedCrLf).toContain("\r\n");
			expect(wrappedSpacesAndTabs).toContain(" \t ");

			expect(() => validateSingleAssertion(wrappedLf)).not.toThrow();
			expect(() => validateSingleAssertion(wrappedCrLf)).not.toThrow();
			expect(() => validateSingleAssertion(wrappedSpacesAndTabs)).not.toThrow();
		});
	});

	describe("no assertions", () => {
		it("should reject response with no assertions", () => {
			const xml = `
				<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol">
					<samlp:Status>
						<samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/>
					</samlp:Status>
				</samlp:Response>
			`;
			expect(() => validateSingleAssertion(encode(xml))).toThrow(
				"SAML response contains no assertions",
			);
		});
	});

	describe("multiple assertions", () => {
		it("should reject response with multiple unencrypted assertions", () => {
			const xml = `
				<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">
					<saml:Assertion ID="assertion1">
						<saml:Subject><saml:NameID>user@example.com</saml:NameID></saml:Subject>
					</saml:Assertion>
					<saml:Assertion ID="assertion2">
						<saml:Subject><saml:NameID>attacker@evil.com</saml:NameID></saml:Subject>
					</saml:Assertion>
				</samlp:Response>
			`;
			expect(() => validateSingleAssertion(encode(xml))).toThrow(
				"SAML response contains 2 assertions, expected exactly 1",
			);
		});

		it("should reject response with multiple encrypted assertions", () => {
			const xml = `
				<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">
					<saml:EncryptedAssertion>
						<xenc:EncryptedData>...</xenc:EncryptedData>
					</saml:EncryptedAssertion>
					<saml:EncryptedAssertion>
						<xenc:EncryptedData>...</xenc:EncryptedData>
					</saml:EncryptedAssertion>
				</samlp:Response>
			`;
			expect(() => validateSingleAssertion(encode(xml))).toThrow(
				"SAML response contains 2 assertions, expected exactly 1",
			);
		});

		it("should reject response with mixed assertion types", () => {
			const xml = `
				<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">
					<saml:Assertion ID="plain-assertion">
						<saml:Subject><saml:NameID>user@example.com</saml:NameID></saml:Subject>
					</saml:Assertion>
					<saml:EncryptedAssertion>
						<xenc:EncryptedData>...</xenc:EncryptedData>
					</saml:EncryptedAssertion>
				</samlp:Response>
			`;
			expect(() => validateSingleAssertion(encode(xml))).toThrow(
				"SAML response contains 2 assertions, expected exactly 1",
			);
		});
	});

	describe("XSW attack patterns", () => {
		it("should reject assertion injected in Extensions element", () => {
			const xml = `
				<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">
					<samlp:Extensions>
						<saml:Assertion ID="injected-assertion">
							<saml:Subject><saml:NameID>attacker@evil.com</saml:NameID></saml:Subject>
						</saml:Assertion>
					</samlp:Extensions>
					<saml:Assertion ID="legitimate-assertion">
						<saml:Subject><saml:NameID>user@example.com</saml:NameID></saml:Subject>
					</saml:Assertion>
				</samlp:Response>
			`;
			expect(() => validateSingleAssertion(encode(xml))).toThrow(
				"SAML response contains 2 assertions, expected exactly 1",
			);
		});

		it("should reject assertion wrapped in arbitrary element", () => {
			const xml = `
				<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">
					<Wrapper>
						<saml:Assertion ID="wrapped-assertion">
							<saml:Subject><saml:NameID>attacker@evil.com</saml:NameID></saml:Subject>
						</saml:Assertion>
					</Wrapper>
					<saml:Assertion ID="legitimate-assertion">
						<saml:Subject><saml:NameID>user@example.com</saml:NameID></saml:Subject>
					</saml:Assertion>
				</samlp:Response>
			`;
			expect(() => validateSingleAssertion(encode(xml))).toThrow(
				"SAML response contains 2 assertions, expected exactly 1",
			);
		});

		it("should reject deeply nested injected assertion", () => {
			const xml = `
				<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">
					<Level1>
						<Level2>
							<Level3>
								<saml:Assertion ID="deep-injected">
									<saml:Subject><saml:NameID>attacker@evil.com</saml:NameID></saml:Subject>
								</saml:Assertion>
							</Level3>
						</Level2>
					</Level1>
					<saml:Assertion ID="legitimate-assertion">
						<saml:Subject><saml:NameID>user@example.com</saml:NameID></saml:Subject>
					</saml:Assertion>
				</samlp:Response>
			`;
			expect(() => validateSingleAssertion(encode(xml))).toThrow(
				"SAML response contains 2 assertions, expected exactly 1",
			);
		});
	});

	describe("namespace handling", () => {
		it("should handle assertion without namespace prefix", () => {
			const xml = `
				<Response>
					<Assertion ID="123">
						<Subject><NameID>user@example.com</NameID></Subject>
					</Assertion>
				</Response>
			`;
			expect(() => validateSingleAssertion(encode(xml))).not.toThrow();
		});

		it("should handle assertion with saml2: prefix", () => {
			const xml = `
				<saml2p:Response xmlns:saml2p="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml2="urn:oasis:names:tc:SAML:2.0:assertion">
					<saml2:Assertion ID="123">
						<saml2:Subject><saml2:NameID>user@example.com</saml2:NameID></saml2:Subject>
					</saml2:Assertion>
				</saml2p:Response>
			`;
			expect(() => validateSingleAssertion(encode(xml))).not.toThrow();
		});

		it("should handle assertion with custom prefix", () => {
			const xml = `
				<custom:Response xmlns:custom="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:myprefix="urn:oasis:names:tc:SAML:2.0:assertion">
					<myprefix:Assertion ID="123">
						<myprefix:Subject><myprefix:NameID>user@example.com</myprefix:NameID></myprefix:Subject>
					</myprefix:Assertion>
				</custom:Response>
			`;
			expect(() => validateSingleAssertion(encode(xml))).not.toThrow();
		});
	});
});

describe("verifySAMLAssertionSignature", () => {
	it("accepts a cryptographically signed assertion", () => {
		const response = signResponse(createUnsignedResponse(), true);
		expect(() =>
			verifySAMLAssertionSignature(response, assertionVerificationOptions),
		).not.toThrow();
	});

	it("accepts a signed assertion when the response is also signed", () => {
		const assertionSigned = signResponse(createUnsignedResponse(), true);
		const bothSigned = signResponse(assertionSigned, false);
		expect(() =>
			verifySAMLAssertionSignature(bothSigned, assertionVerificationOptions),
		).not.toThrow();
	});

	it("rejects a response-only signature", () => {
		const response = signResponse(createUnsignedResponse(), false);
		expect(() =>
			verifySAMLAssertionSignature(response, assertionVerificationOptions),
		).toThrow("SAML assertion signature is required");
	});

	it("rejects a response signature plus a non-XMLDSig assertion decoy", () => {
		const response = signResponse(
			createUnsignedResponse(
				'<fake:Signature xmlns:fake="urn:example:fake" />',
			),
			false,
		);
		expect(() =>
			verifySAMLAssertionSignature(response, assertionVerificationOptions),
		).toThrow("SAML assertion signature is required");
	});

	it("accepts a validly signed assertion despite a foreign-namespace decoy at the response level", () => {
		const response = signResponse(createUnsignedResponse(), true);
		const withDecoy = response.replace(
			"</saml:Assertion>",
			'</saml:Assertion><fake:Signature xmlns:fake="urn:example:fake" />',
		);
		expect(() =>
			verifySAMLAssertionSignature(withDecoy, assertionVerificationOptions),
		).not.toThrow();
	});

	it("rejects a tampered signed assertion", () => {
		const response = signResponse(
			createUnsignedResponse("<saml:Subject>original</saml:Subject>"),
			true,
		).replace(">original<", ">tampered<");
		expect(() =>
			verifySAMLAssertionSignature(response, assertionVerificationOptions),
		).toThrow("SAML assertion signature is required");
	});

	it("accepts a signed assertion after encrypted transport is decrypted", async () => {
		const serviceProvider = saml.ServiceProvider({
			entityID: "https://service.example.com/saml",
			assertionConsumerService: [
				{
					Binding: "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST",
					Location: "https://service.example.com/saml/acs",
				},
			],
			encryptCert: TEST_CERTIFICATE,
			encPrivateKey: TEST_PRIVATE_KEY,
			isAssertionEncrypted: true,
		});
		const identityProvider = saml.IdentityProvider({
			entityID: "https://idp.example.com",
			signingCert: TEST_CERTIFICATE,
			isAssertionEncrypted: true,
			singleSignOnService: [
				{
					Binding: "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect",
					Location: "https://idp.example.com/sso",
				},
			],
		});
		const signed = signResponse(createUnsignedResponse(), true);
		const encrypted = await saml.SamlLib.encryptAssertion(
			identityProvider,
			serviceProvider,
			signed,
		);
		const [decrypted] = await saml.SamlLib.decryptAssertion(
			serviceProvider,
			new TextDecoder().decode(
				Uint8Array.from(Buffer.from(encrypted, "base64")),
			),
		);
		expect(() =>
			verifySAMLAssertionSignature(decrypted, assertionVerificationOptions),
		).not.toThrow();
		expect(() =>
			verifySAMLAssertionSignature(
				decrypted.replace(
					"<saml:Subject/>",
					"<saml:Subject>tampered</saml:Subject>",
				),
				assertionVerificationOptions,
			),
		).toThrow("SAML assertion signature is required");
	});
});

describe("countAssertions", () => {
	it("should return separate counts for assertions and encrypted assertions", () => {
		const xml = `
			<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">
				<saml:Assertion ID="plain">
					<saml:Subject><saml:NameID>user@example.com</saml:NameID></saml:Subject>
				</saml:Assertion>
				<saml:EncryptedAssertion>
					<xenc:EncryptedData>...</xenc:EncryptedData>
				</saml:EncryptedAssertion>
			</samlp:Response>
		`;
		const counts = countAssertions(xml);
		expect(counts.assertions).toBe(1);
		expect(counts.encryptedAssertions).toBe(1);
		expect(counts.total).toBe(2);
	});

	it("should not count AssertionConsumerService as assertion", () => {
		const xml = `
			<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata">
				<md:SPSSODescriptor>
					<md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="http://example.com/acs"/>
				</md:SPSSODescriptor>
			</md:EntityDescriptor>
		`;
		const counts = countAssertions(xml);
		expect(counts.assertions).toBe(0);
		expect(counts.total).toBe(0);
	});
});

describe("error handling", () => {
	const encode = (str: string) => Buffer.from(str).toString("base64");

	it("should reject invalid base64 input", () => {
		expect(() => validateSingleAssertion("not-valid-base64!!!")).toThrow(
			"Invalid base64-encoded SAML response",
		);
	});

	it("should reject non-XML content", () => {
		const notXml = encode("this is not xml at all");
		expect(() => validateSingleAssertion(notXml)).toThrow(
			"Invalid base64-encoded SAML response",
		);
	});
});
