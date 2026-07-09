import { describe, expect, it, vi } from "vitest";
import type { SAMLConfig } from "../types";
import { createSAMLCryptoReport, enforceSAMLCryptoPolicy } from "./algorithms";
import type { SAMLExecutor } from "./executor";
import { createLocalSAMLExecutor, resolveSAMLExecutor } from "./executor";

const baseSamlConfig = (): SAMLConfig => ({
	issuer: "https://sp.example.com",
	entryPoint: "https://idp.example.com/sso",
	cert: "TESTCERT",
	callbackUrl: "https://sp.example.com/api/auth/sso/saml2/sp/acs/acme",
	spMetadata: {
		entityID: "https://sp.example.com",
	},
	idpMetadata: {
		entityID: "https://idp.example.com",
		cert: "TESTCERT",
		singleSignOnService: [
			{
				Binding: "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect",
				Location: "https://idp.example.com/sso",
			},
		],
	},
});

describe("SAML executor", () => {
	it("resolveSAMLExecutor falls back to the local samlify executor", () => {
		const executor = resolveSAMLExecutor(undefined);
		expect(executor).toBeDefined();
		expect(typeof executor.createLoginRequest).toBe("function");
		expect(typeof executor.parseLoginResponse).toBe("function");
	});

	it("resolveSAMLExecutor returns the provided remote executor", () => {
		const remote: SAMLExecutor = {
			createLoginRequest: vi.fn(),
			parseLoginResponse: vi.fn(),
		};
		expect(resolveSAMLExecutor(remote)).toBe(remote);
	});

	it("local executor builds an AuthnRequest redirect URL with a request id", async () => {
		const executor = createLocalSAMLExecutor();
		const result = await executor.createLoginRequest({
			providerId: "acme",
			samlConfig: baseSamlConfig(),
			baseURL: "https://sp.example.com/api/auth",
			relayState: "relay-state-test",
		});
		expect(result.id).toMatch(/^_/);
		expect(result.redirectUrl).toContain("https://idp.example.com/sso");
		expect(result.redirectUrl).toContain("SAMLRequest=");
	});

	it("remote executor is invoked for createLoginRequest when configured", async () => {
		const createLoginRequest = vi.fn(async () => ({
			redirectUrl: "https://idp.example.com/sso?SAMLRequest=abc",
			id: "_remote-req-1",
		}));
		const remote: SAMLExecutor = {
			createLoginRequest,
			parseLoginResponse: vi.fn(),
		};
		const result = await resolveSAMLExecutor(remote).createLoginRequest({
			providerId: "acme",
			samlConfig: baseSamlConfig(),
			baseURL: "https://sp.example.com/api/auth",
			relayState: "state",
		});
		expect(createLoginRequest).toHaveBeenCalledOnce();
		expect(result).toEqual({
			redirectUrl: "https://idp.example.com/sso?SAMLRequest=abc",
			id: "_remote-req-1",
		});
	});

	it("remote executor returns a first-class crypto report", async () => {
		const crypto = createSAMLCryptoReport({
			signatureVerified: true,
			signatureAlgorithm: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
			encryption: {
				keyTransportAlgorithm:
					"http://www.w3.org/2001/04/xmlenc#rsa-oaep-mgf1p",
				dataEncryptionAlgorithm: "http://www.w3.org/2009/xmlenc11#aes256-gcm",
			},
		});
		const parseLoginResponse = vi.fn(async () => ({
			extract: {
				nameID: "user@acme.com",
				attributes: { email: "user@acme.com" },
				inResponseTo: "_req-1",
			},
			samlContent: "<Assertion/>",
			entityId: "https://sp.example.com",
			idpEntityId: "https://idp.example.com",
			assertionConsumerServiceUrl:
				"https://sp.example.com/api/auth/sso/saml2/sp/acs/acme",
			crypto,
		}));
		const remote: SAMLExecutor = {
			createLoginRequest: vi.fn(),
			parseLoginResponse,
		};
		const algorithms = {
			allowedSignatureAlgorithms: [
				"http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
			],
			allowedKeyEncryptionAlgorithms: [
				"http://www.w3.org/2001/04/xmlenc#rsa-oaep-mgf1p",
			],
		};
		const result = await resolveSAMLExecutor(remote).parseLoginResponse({
			providerId: "acme",
			samlConfig: baseSamlConfig(),
			baseURL: "https://sp.example.com/api/auth",
			SAMLResponse: "YmFzZTY0",
			algorithms,
		});
		expect(parseLoginResponse).toHaveBeenCalledWith(
			expect.objectContaining({ algorithms }),
		);
		expect(result.crypto.signatureVerified).toBe(true);
		expect(result.crypto.encryption?.keyTransportAlgorithm).toContain(
			"rsa-oaep",
		);
		// Host policy accepts the report (same function the pipeline uses).
		expect(() =>
			enforceSAMLCryptoPolicy(result.crypto, algorithms),
		).not.toThrow();
	});

	it("createSAMLCryptoReport auto-detects encryption from source XML", () => {
		const encryptedXml = `
			<Response>
				<EncryptedAssertion>
					<EncryptedData>
						<EncryptionMethod Algorithm="http://www.w3.org/2009/xmlenc11#aes256-gcm"/>
					</EncryptedData>
					<EncryptedKey>
						<EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#rsa-oaep-mgf1p"/>
					</EncryptedKey>
				</EncryptedAssertion>
			</Response>
		`;
		const report = createSAMLCryptoReport({
			signatureVerified: true,
			signatureAlgorithm: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
			sourceXml: encryptedXml,
		});
		expect(report.encryption).not.toBeNull();
		expect(report.encryption?.dataEncryptionAlgorithm).toContain("aes256-gcm");
		expect(report.encryption?.keyTransportAlgorithm).toContain("rsa-oaep");
	});

	it("enforceSAMLCryptoPolicy rejects unverified signatures", () => {
		expect(() =>
			enforceSAMLCryptoPolicy({
				signatureVerified: false,
				encryption: null,
			}),
		).toThrow(/not verified/i);
	});
});
