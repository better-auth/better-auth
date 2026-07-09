import { describe, expect, it, vi } from "vitest";
import type { SAMLConfig } from "../types";
import type { SAMLExecutor } from "./executor";
import { createLocalSAMLExecutor, resolveSAMLExecutor } from "./executor";

const baseSamlConfig = (): SAMLConfig => ({
	issuer: "https://sp.example.com",
	entryPoint: "https://idp.example.com/sso",
	// Placeholder cert material for AuthnRequest construction tests only.
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

	it("remote executor is invoked for parseLoginResponse when configured", async () => {
		const parseLoginResponse = vi.fn(async () => ({
			extract: {
				nameID: "user@acme.com",
				attributes: { email: "user@acme.com" },
				inResponseTo: "_req-1",
			},
			samlContent: "<Response/>",
			entityId: "https://sp.example.com",
			idpEntityId: "https://idp.example.com",
			assertionConsumerServiceUrl:
				"https://sp.example.com/api/auth/sso/saml2/sp/acs/acme",
			signatureValidated: true,
		}));
		const remote: SAMLExecutor = {
			createLoginRequest: vi.fn(),
			parseLoginResponse,
		};
		const result = await resolveSAMLExecutor(remote).parseLoginResponse({
			providerId: "acme",
			samlConfig: baseSamlConfig(),
			baseURL: "https://sp.example.com/api/auth",
			SAMLResponse: "YmFzZTY0",
		});
		expect(parseLoginResponse).toHaveBeenCalledOnce();
		expect(result.extract.nameID).toBe("user@acme.com");
		expect(result.signatureValidated).toBe(true);
	});
});
