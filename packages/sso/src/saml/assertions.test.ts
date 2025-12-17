import { describe, expect, it } from "vitest";
import { countAssertions, validateSingleAssertion } from "./assertions";

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

