import { createHash } from "node:crypto";
import { oauthProvider } from "@better-auth/oauth-provider";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { betterFetch } from "@better-fetch/fetch";
import {
	addOAuthServerContext,
	createAuthMiddleware,
	getOAuthState,
} from "better-auth/api";
import { jwt } from "better-auth/plugins";
import { getTestInstance } from "better-auth/test";
import { OAuth2Server } from "oauth2-mock-server";
import saml from "samlify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sso } from ".";
import { ssoClient } from "./client";

const idp = new OAuth2Server();

/**
 * @see https://github.com/better-auth/better-auth/issues/11349
 */
describe("SSO sign-in during an oauth-provider authorization", async () => {
	const baseURL = "http://localhost:3000";
	const redirectURI = "http://localhost:5000/callback";
	await idp.issuer.keys.generate("RS256");
	await idp.start(undefined, "127.0.0.1");
	const issuer = idp.issuer.url!;
	const { auth, client, signInWithTestUser, customFetchImpl, cookieSetter } =
		await getTestInstance(
			{
				baseURL,
				trustedOrigins: [issuer],
				plugins: [
					jwt(),
					oauthProvider({ loginPage: "/login", consentPage: "/consent" }),
					sso(),
				],
			},
			{ clientOptions: { plugins: [oauthProviderClient(), ssoClient()] } },
		);

	let clientId = "";
	let consentClientId = "";

	const profile = {
		sub: "sso-resume",
		email: "resume@sso-resume.com",
		email_verified: true,
		name: "Resume User",
	};
	idp.service.on("beforeTokenSigning", (token) => {
		Object.assign(token.payload, profile);
	});
	idp.service.on("beforeUserinfo", (userInfoResponse) => {
		userInfoResponse.body = profile;
		userInfoResponse.statusCode = 200;
	});

	beforeAll(async () => {
		const { headers } = await signInWithTestUser();
		await auth.api.registerSSOProvider({
			body: {
				issuer,
				domain: "sso-resume.com",
				providerId: "resume",
				oidcConfig: {
					clientId: "resume",
					clientSecret: "resume",
					authorizationEndpoint: `${issuer}/authorize`,
					tokenEndpoint: `${issuer}/token`,
					jwksEndpoint: `${issuer}/jwks`,
					discoveryEndpoint: `${issuer}/.well-known/openid-configuration`,
					mapping: {
						email: "email",
						emailVerified: "email_verified",
						name: "name",
					},
				},
			},
			headers,
		});
		const oauthClient = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectURI],
				application_type: "native",
				token_endpoint_auth_method: "client_secret_post",
				skip_consent: true,
			},
		});
		clientId = oauthClient.client_id;
		const consentClient = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectURI],
				application_type: "native",
				token_endpoint_auth_method: "client_secret_post",
			},
		});
		consentClientId = consentClient.client_id;
	});

	afterAll(async () => {
		vi.unstubAllGlobals();
		await idp.stop().catch(() => {});
	});

	async function signInThroughSSO(authorizeClientId: string) {
		const authorize = new URL(`${baseURL}/api/auth/oauth2/authorize`);
		authorize.search = new URLSearchParams({
			client_id: authorizeClientId,
			response_type: "code",
			redirect_uri: redirectURI,
			scope: "openid",
			state: "client-state",
			code_challenge: createHash("sha256")
				.update("resume-code-verifier-0123456789abcdefghijklmnop")
				.digest("base64url"),
			code_challenge_method: "S256",
		}).toString();
		const loginRedirect = await auth.handler(new Request(authorize));
		const loginURL = new URL(loginRedirect.headers.get("location")!, baseURL);
		expect(loginURL.pathname).toBe("/login");

		vi.stubGlobal("window", { location: { search: loginURL.search } });
		const headers = new Headers();
		const res = await client.signIn.sso({
			email: "resume@sso-resume.com",
			callbackURL: "/dashboard",
			fetchOptions: { throw: true, onSuccess: cookieSetter(headers) },
		});

		let idpRedirect = "";
		await betterFetch(res.url, {
			method: "GET",
			redirect: "manual",
			onError(context) {
				idpRedirect = context.response.headers.get("location") || "";
			},
		});
		let callbackLocation = "";
		headers.set("sec-fetch-mode", "navigate");
		await betterFetch(idpRedirect, {
			method: "GET",
			customFetchImpl,
			headers,
			onError(context) {
				callbackLocation = context.response.headers.get("location") || "";
			},
		});

		return new URL(callbackLocation, baseURL);
	}

	it("resumes the authorization after a signed-out OIDC SSO login", async () => {
		const resumed = await signInThroughSSO(clientId);
		expect(`${resumed.origin}${resumed.pathname}`).toBe(redirectURI);
		expect(resumed.searchParams.get("code")).toBeTruthy();
		expect(resumed.searchParams.get("state")).toBe("client-state");
	});

	it("resumes the authorization at the consent page for a client that needs consent", async () => {
		const resumed = await signInThroughSSO(consentClientId);
		expect(resumed.pathname).toBe("/consent");
		expect(resumed.searchParams.get("client_id")).toBe(consentClientId);
		expect(resumed.searchParams.get("sig")).toBeTruthy();
	});
});

const samlIdpMetadata = `
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="http://localhost:8081/api/sso/saml2/idp/metadata">
<md:IDPSSODescriptor WantAuthnRequestsSigned="false" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
<md:KeyDescriptor use="signing">
<ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
<ds:X509Data>
<ds:X509Certificate>MIIFOjCCAyICCQCqP5DN+xQZDjANBgkqhkiG9w0BAQsFADBfMQswCQYDVQQGEwJVUzEQMA4GA1UECAwHRmxvcmlkYTEQMA4GA1UEBwwHT3JsYW5kbzENMAsGA1UECgwEVGVzdDEdMBsGCSqGSIb3DQEJARYOdGVzdEBnbWFpbC5jb20wHhcNMjMxMTE5MTIzNzE3WhcNMzMxMTE2MTIzNzE3WjBfMQswCQYDVQQGEwJVUzEQMA4GA1UECAwHRmxvcmlkYTEQMA4GA1UEBwwHT3JsYW5kbzENMAsGA1UECgwEVGVzdDEdMBsGCSqGSIb3DQEJARYOdGVzdEBnbWFpbC5jb20wggIiMA0GCSqGSIb3DQEBAQUAA4ICDwAwggIKAoICAQD5giLoLyED41IHt0RxB/k6x4K0vzAKiGecPyedRNR1oyiv3OYkuG5jgTE2wcPZc7kD1Eg5d6th0BWHy/ovaNS5mkgnOV6jKkMaWW4sCMSnLnaWy0seftPK3O4mNeZpM5e9amj2gXnZvKrK8cqnJ/bsUUQvXxttXNVVmOHWg/t3c2vJ4XuUfph6wIKbrj297ILzuAFRNvAVxeS0tElwepvZ5Wbf7Hc1MORAqTpw/mp8cRjHRzYCA9y6OM4hgVs1gvTJS8WGoMmsdAZHaOnv9vLJvW3jDLQQecOheYIJncWgcESzJFIkmXadorYCEfWhwwBdVphknmeLr4BMpJBclAYaFjYDLIKpMcXYO5k/2r3BgSPlw4oqbxbR5geD05myKYtZ/wNUtku118NjhIfJFulU/kfDcp1rYYkvzgBfqr80wgNps4oQzVr1mnpgHsSTAhXMuZbaTByJRmPqecyvyQqRQcRIN0oTLJNGyzoUf0RkH6DKJ4+7qDhlq4Zhlfso9OFMv9xeONfIrJo5HtTfFZfidkXZqir2ZqwqNlNOMfK5DsYq37x2Gkgqig4nqLpITXyxfnQpL2HsaoFrlctt/OL+Zqba7NT4heYk9GX8qlAS+Ipsv6T2HSANbah55oSS3uvcrDOug2Zq7+GYMLKS1IKUKhwX+wLMxmMwSJQ9ZgFwfQIDAQABMA0GCSqGSIb3DQEBCwUAA4ICAQCkGPZdflocTSXIe5bbehsBn/IPdyb38eH2HaAvWqO2XNcDcq+6/uLc8BVK4JMa3AFS9xtBza7MOXN/lw/Ccb8uJGVNUE31+rTvsJaDtMCQkp+9aG04I1BonEHfSB0ANcTy/Gp+4hKyFCd6x35uyPO7CWX5Z8I87q9LF6Dte3/v1j7VZgDjAi9yHpBJv9Xje33AK1vF+WmEfDUOi8y2B8htVeoyS3owln3ZUbnmJdCmMp2BMRq63ymINwklEaYaNrp1L201bSqNdKZF2sNwROWyDX+WFYgufrnzPYb6HS8gYb4oEZmaG5cBM7Hs730/3BlbHKhxNTy1Io2TVCYcMQD+ieiVg5e5eGTwaPYGuVvY3NVhO8FaYBG7K2NT2hqutdCMaQpGyHEzbbbTY1afhbeMmWWqivRnVJNDv4kgBc2SE8JO82qHikIW9Om0cghC5xwTT+1JTtxxD1KeC1M1IwLzzuuMmwJSKAsv4duDqN+YRIP78J2SlrssqlsmoF8+48e7Vzr7JRT/Ya274P8RpUPNtxTR7WDmZ4tunqXjiBpz6l0uTtVXnj5UBo4HCyRjWJOGf15OCuQX03qz8tKn1IbZUf723qrmSF+cxBwHqpAywqhTSsaLjIXKnQ0UlMov7QWb0a5N07JZMdMSerbHvbXd/z9S1Ssea2+EGuTYuQur3A==</ds:X509Certificate>
</ds:X509Data>
</ds:KeyInfo>
</md:KeyDescriptor>
<md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</md:NameIDFormat>
<md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="http://localhost:8081/api/sso/saml2/idp/redirect"/>
<md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="http://localhost:8081/api/sso/saml2/idp/post"/>
</md:IDPSSODescriptor>
</md:EntityDescriptor>
`;

const samlCertificate = `
-----BEGIN CERTIFICATE-----
MIIDlzCCAn+gAwIBAgIJAO1ymQc33+bWMA0GCSqGSIb3DQEBCwUAMGIxCzAJBgNV
BAYTAkhLMRMwEQYDVQQIDApTb21lLVN0YXRlMRowGAYDVQQKDBFJZGVudGl0eSBQ
cm92aWRlcjEUMBIGA1UECwwLRGV2ZWxvcG1lbnQxDDAKBgNVBAMMA0lEUDAeFw0x
NTA3MDUxODAyMjdaFw0xODA3MDQxODAyMjdaMGIxCzAJBgNVBAYTAkhLMRMwEQYD
VQQIDApTb21lLVN0YXRlMRowGAYDVQQKDBFJZGVudGl0eSBQcm92aWRlcjEUMBIG
A1UECwwLRGV2ZWxvcG1lbnQxDDAKBgNVBAMMA0lEUDCCASIwDQYJKoZIhvcNAQEB
BQADggEPADCCAQoCggEBAODZsWhCe+yG0PalQPTUoD7yko5MTWMCRxJ8hSm2k7mG
3Eg/Y2v0EBdCmTw7iDCevRqUmbmFnq7MROyV4eriJzh0KabAdZf7/k6koghst3ZU
tWOwzshyxkBtWDwGmBpQGTGsKxJ8M1js3aSqNRXBT4OBWM9w2Glt1+8ty30RhYv3
pSF+/HHLH7Ac+vLSIAlokaFW34RWTcJ/8rADuRWlXih4GfnIu0W/ncm5nTSaJiRA
vr3dGDRO/khiXoJdbbOj7dHPULxVGbH9IbPK76TCwLbF7ikIMsPovVbTrpyL6vsb
VUKeEl/5GKppTwp9DLAOeoSYpCYkkDkYKu9TRQjF02MCAwEAAaNQME4wHQYDVR0O
BBBYEFP2ut2AQdy6D1dwdwK740IHmbh38MB8GA1UdIwQYMBaAFP2ut2AQdy6D1dwd
wK740IHmbh38MAwGA1UdEwQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBANMZUoPN
mHzgja2PYkbvBYMHmpvUkVoiuvQ9cJPlqGTB2CRfG68BNNs/Clz8P7cIrAdkhCUw
i1rSBhDuslGFNrSaIpv6B10FpBuKwef3G7YrPWFNEN6khY7aHNWSTHqKgs1DrGef
2B9hvkrnHWbQVSVXrBFKe1wTCqcgGcOpYoSK7L8C6iX6uIA/uZYnVQ4NgBrizJ0a
zkjdegz3hwO/gt4malEURy8D85/AAVt6PAzhpb9VJUGxSXr/EfntVUEz3L2gUFWW
k1CnZFyz0rIOEt/zPmeAY8BLyd/Tjxm4Y+gwNazKq5y9AJS+m858b/nM4QdCnUE4
yyoWAJDUHiAmvFA=
-----END CERTIFICATE-----
`;

const samlIdpPrivateKey = `
-----BEGIN RSA PRIVATE KEY-----
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
-----END RSA PRIVATE KEY-----
`;

function createMockSamlResponseBuilder(baseURL: string, acsUrl: string) {
	const spMetadata = `
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${baseURL}/api/auth/sso/saml2/sp/metadata">
<md:SPSSODescriptor AuthnRequestsSigned="false" WantAssertionsSigned="false" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
<md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</md:NameIDFormat>
<md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="${acsUrl}" index="1"/>
</md:SPSSODescriptor>
</md:EntityDescriptor>
`;
	const mockIdp = saml.IdentityProvider({
		metadata: samlIdpMetadata,
		privateKey: samlIdpPrivateKey,
		loginResponseTemplate: {
			context:
				'<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="{ID}" Version="2.0" IssueInstant="{IssueInstant}" Destination="{Destination}" InResponseTo="{InResponseTo}"><saml:Issuer>{Issuer}</saml:Issuer><samlp:Status><samlp:StatusCode Value="{StatusCode}"/></samlp:Status><saml:Assertion ID="{AssertionID}" Version="2.0" IssueInstant="{IssueInstant}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"><saml:Issuer>{Issuer}</saml:Issuer><saml:Subject><saml:NameID Format="{NameIDFormat}">{NameID}</saml:NameID><saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer"><saml:SubjectConfirmationData NotOnOrAfter="{SubjectConfirmationDataNotOnOrAfter}" Recipient="{SubjectRecipient}" InResponseTo="{InResponseTo}"/></saml:SubjectConfirmation></saml:Subject><saml:Conditions NotBefore="{ConditionsNotBefore}" NotOnOrAfter="{ConditionsNotOnOrAfter}"><saml:AudienceRestriction><saml:Audience>{Audience}</saml:Audience></saml:AudienceRestriction></saml:Conditions><saml:AttributeStatement><saml:Attribute Name="email" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic"><saml:AttributeValue xsi:type="xs:string">{NameID}</saml:AttributeValue></saml:Attribute></saml:AttributeStatement></saml:Assertion></samlp:Response>',
			attributes: [],
		},
	});
	const mockSp = saml.ServiceProvider({ metadata: spMetadata });

	return {
		spMetadata,
		async buildResponse(email: string) {
			const now = new Date();
			const later = new Date(now.getTime() + 5 * 60 * 1000);
			const { context } = await mockIdp.createLoginResponse(
				mockSp,
				{ extract: { request: { id: "null" } } },
				"post",
				{ emailAddress: email },
				(template) => ({
					id: "_resp_" + Math.random().toString(36).slice(2),
					context: saml.SamlLib.replaceTagsByValue(template, {
						ID: "_resp_" + Math.random().toString(36).slice(2),
						AssertionID: "_assert_" + Math.random().toString(36).slice(2),
						IssueInstant: now.toISOString(),
						Destination: acsUrl,
						Issuer: "http://localhost:8081/api/sso/saml2/idp/metadata",
						StatusCode: "urn:oasis:names:tc:SAML:2.0:status:Success",
						ConditionsNotBefore: now.toISOString(),
						ConditionsNotOnOrAfter: later.toISOString(),
						Audience: `${baseURL}/api/auth/sso/saml2/sp/metadata`,
						SubjectRecipient: acsUrl,
						SubjectConfirmationDataNotOnOrAfter: later.toISOString(),
						NameIDFormat:
							"urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
						NameID: email,
						InResponseTo: "null",
					}),
				}),
			);
			return context;
		},
	};
}

/**
 * @see https://github.com/better-auth/better-auth/issues/12967
 */
describe("SAML SSO sign-in preserves OAuth server context", async () => {
	const baseURL = "http://localhost:3000";
	const redirectURI = "http://localhost:5000/callback";
	const providerId = "saml-resume";
	const acsUrl = `${baseURL}/api/auth/sso/saml2/sp/acs/${providerId}`;
	const { spMetadata, buildResponse } = createMockSamlResponseBuilder(
		baseURL,
		acsUrl,
	);

	it("preserves addOAuthServerContext and populates getOAuthState on SAML ACS", async () => {
		const probe = {
			id: "probe",
			hooks: {
				before: [
					{
						matcher: (ctx: { path?: string }) => ctx.path === "/sign-in/sso",
						handler: createAuthMiddleware(async () => {
							await addOAuthServerContext({ query: "client_id=x" });
						}),
					},
				],
				after: [
					{
						matcher: (ctx: { path?: string }) =>
							ctx.path === "/sso/saml2/sp/acs/:providerId",
						handler: createAuthMiddleware(async (ctx) => {
							ctx.setHeader(
								"x-oauth-state",
								JSON.stringify(await getOAuthState()),
							);
						}),
					},
				],
			},
		};

		const { auth, signInWithTestUser } = await getTestInstance({
			baseURL,
			plugins: [sso({ saml: { enableInResponseToValidation: false } }), probe],
		});
		const { headers } = await signInWithTestUser();

		await auth.api.registerSSOProvider({
			body: {
				providerId,
				issuer: "http://localhost:8081",
				domain: "saml-probe.com",
				samlConfig: {
					entryPoint: "http://localhost:8081/api/sso/saml2/idp/redirect",
					cert: samlCertificate,
					wantAssertionsSigned: false,
					idpMetadata: { metadata: samlIdpMetadata },
					spMetadata: { metadata: spMetadata },
				},
			},
			headers,
		});

		const signInRes = await auth.api.signInSSO({
			body: { providerId, callbackURL: "/done" },
			returnHeaders: true,
		});
		const relayState = new URL(signInRes.response.url).searchParams.get(
			"RelayState",
		)!;
		expect(relayState).toBeTruthy();

		const samlResponse = await buildResponse("alice@saml-probe.com");
		const acsResponse = await auth.handler(
			new Request(acsUrl, {
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({
					SAMLResponse: samlResponse,
					RelayState: relayState,
				}),
			}),
		);

		expect(acsResponse.status).toBe(302);
		expect(acsResponse.headers.get("location")).toBe("/done");

		const oauthStateHeader = acsResponse.headers.get("x-oauth-state");
		expect(oauthStateHeader).toBeTruthy();
		const parsedOAuthState = JSON.parse(oauthStateHeader!);
		expect(parsedOAuthState.serverContext).toMatchObject({
			query: "client_id=x",
		});
		expect(parsedOAuthState.serverContext.ssoProviderReference).toBeTruthy();
	});

	it("resumes oauth-provider authorization after a cross-site SAML SSO login", async () => {
		const { auth, signInWithTestUser } = await getTestInstance({
			baseURL,
			plugins: [
				jwt(),
				oauthProvider({ loginPage: "/login", consentPage: "/consent" }),
				sso({ saml: { enableInResponseToValidation: false } }),
			],
		});
		const { headers } = await signInWithTestUser();

		await auth.api.registerSSOProvider({
			body: {
				providerId,
				issuer: "http://localhost:8081",
				domain: "saml-resume.com",
				samlConfig: {
					entryPoint: "http://localhost:8081/api/sso/saml2/idp/redirect",
					cert: samlCertificate,
					wantAssertionsSigned: false,
					idpMetadata: { metadata: samlIdpMetadata },
					spMetadata: { metadata: spMetadata },
				},
			},
			headers,
		});

		const oauthClient = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectURI],
				application_type: "native",
				token_endpoint_auth_method: "client_secret_post",
				skip_consent: true,
			},
		});

		const authorize = new URL(`${baseURL}/api/auth/oauth2/authorize`);
		authorize.search = new URLSearchParams({
			client_id: oauthClient.client_id,
			response_type: "code",
			redirect_uri: redirectURI,
			scope: "openid",
			state: "client-state",
			code_challenge: createHash("sha256")
				.update("resume-code-verifier-0123456789abcdefghijklmnop")
				.digest("base64url"),
			code_challenge_method: "S256",
		}).toString();

		const loginRedirect = await auth.handler(new Request(authorize));
		const loginURL = new URL(loginRedirect.headers.get("location")!, baseURL);
		expect(loginURL.pathname).toBe("/login");

		const oauthQuery = loginURL.search.startsWith("?")
			? loginURL.search.slice(1)
			: loginURL.search;
		const signInRes = await auth.handler(
			new Request(`${baseURL}/api/auth/sign-in/sso`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					providerId,
					callbackURL: "/done",
					oauth_query: oauthQuery,
				}),
			}),
		);
		const signInJson = (await signInRes.json()) as { url: string };
		const relayState = new URL(signInJson.url).searchParams.get("RelayState")!;
		expect(relayState).toBeTruthy();

		// Cross-site IdP POSTs to ACS without cookies (SameSite=Lax blocks them).
		const samlResponse = await buildResponse("resume@saml-resume.com");
		const acsResponse = await auth.handler(
			new Request(acsUrl, {
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
					"sec-fetch-mode": "navigate",
				},
				body: new URLSearchParams({
					SAMLResponse: samlResponse,
					RelayState: relayState,
				}),
			}),
		);

		expect(acsResponse.status).toBe(302);
		const resumed = new URL(acsResponse.headers.get("location")!, baseURL);
		expect(`${resumed.origin}${resumed.pathname}`).toBe(redirectURI);
		expect(resumed.searchParams.get("code")).toBeTruthy();
		expect(resumed.searchParams.get("state")).toBe("client-state");
	});
});
