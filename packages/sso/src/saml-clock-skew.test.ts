import { randomUUID } from "node:crypto";
import { getTestInstance } from "better-auth/test";
import { describe, expect, it } from "vitest";
import { sso } from ".";
import { SignatureAlgorithm } from "./saml";
import { saml } from "./samlify";

const IDP_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
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

const IDP_CERTIFICATE = `-----BEGIN CERTIFICATE-----
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

const IDP_ENTITY_ID = "https://idp.example.com/saml";
const SP_ENTITY_ID = "http://localhost:3000/api/auth/sso/saml2/sp/metadata";
const BASE_URL = "http://localhost:3000/api/auth";

const minutesFromNow = (minutes: number) =>
	new Date(Date.now() + minutes * 60_000).toISOString();

interface ResponseSpec {
	providerId: string;
	email: string;
	notBefore?: string;
	notOnOrAfter?: string;
}

/**
 * A signed Response whose assertion validity window is under the test's
 * control. The bearer confirmation keeps the same deadline as Conditions.
 */
function buildSAMLResponse(spec: ResponseSpec): string {
	const acsUrl = `${BASE_URL}/sso/saml2/sp/acs/${spec.providerId}`;
	const now = new Date().toISOString();
	const notBefore = spec.notBefore ?? minutesFromNow(-1);
	const notOnOrAfter = spec.notOnOrAfter ?? minutesFromNow(5);
	const xml = [
		`<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_${randomUUID()}" Version="2.0" IssueInstant="${now}" Destination="${acsUrl}">`,
		`<saml:Issuer>${IDP_ENTITY_ID}</saml:Issuer>`,
		`<samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>`,
		`<saml:Assertion ID="_${randomUUID()}" Version="2.0" IssueInstant="${now}">`,
		`<saml:Issuer>${IDP_ENTITY_ID}</saml:Issuer>`,
		`<saml:Subject>`,
		`<saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">${spec.email}</saml:NameID>`,
		`<saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer">`,
		`<saml:SubjectConfirmationData NotOnOrAfter="${notOnOrAfter}" Recipient="${acsUrl}"/>`,
		`</saml:SubjectConfirmation>`,
		`</saml:Subject>`,
		`<saml:Conditions NotBefore="${notBefore}" NotOnOrAfter="${notOnOrAfter}">`,
		`<saml:AudienceRestriction><saml:Audience>${SP_ENTITY_ID}</saml:Audience></saml:AudienceRestriction>`,
		`</saml:Conditions>`,
		`<saml:AuthnStatement AuthnInstant="${now}" SessionIndex="_${randomUUID()}">`,
		`<saml:AuthnContext><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef></saml:AuthnContext>`,
		`</saml:AuthnStatement>`,
		`<saml:AttributeStatement>`,
		`<saml:Attribute Name="email"><saml:AttributeValue>${spec.email}</saml:AttributeValue></saml:Attribute>`,
		`</saml:AttributeStatement>`,
		`</saml:Assertion>`,
		`</samlp:Response>`,
	].join("");
	const signed = saml.SamlLib.constructSAMLSignature({
		rawSamlMessage: xml,
		isMessageSigned: true,
		privateKey: IDP_PRIVATE_KEY,
		signatureAlgorithm: SignatureAlgorithm.RSA_SHA256,
		signingCert: saml.Utility.normalizeCerString(IDP_CERTIFICATE),
		isBase64Output: false,
		signatureConfig: {
			prefix: "ds",
			location: {
				reference: "/*[local-name(.)='Response']/*[local-name(.)='Issuer']",
				action: "after",
			},
		},
	});
	return Buffer.from(signed).toString("base64");
}

/**
 * @see https://docs.oasis-open.org/security/saml/v2.0/saml-profiles-2.0-os.pdf
 * SAML Profiles §4.1.4.3: validity times are checked "subject to allowable
 * clock skew between the providers". The documented default is 5 minutes and
 * must apply to every layer that checks the assertion window.
 */
describe("SAML assertion clock skew", () => {
	async function setup(clockSkew?: number) {
		const providerId = `clock-skew-${randomUUID()}`;
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [
				sso({
					saml: {
						allowIdpInitiated: true,
						...(clockSkew === undefined ? {} : { clockSkew }),
					},
				}),
			],
		});
		const { headers } = await signInWithTestUser();
		await auth.api.registerSSOProvider({
			body: {
				providerId,
				issuer: IDP_ENTITY_ID,
				domain: "example.com",
				samlConfig: {
					entryPoint: "https://idp.example.com/sso",
					cert: IDP_CERTIFICATE,
					callbackUrl: "http://localhost:3000/dashboard",
					wantAssertionsSigned: false,
					identifierFormat:
						"urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
					idpMetadata: { entityID: IDP_ENTITY_ID },
					spMetadata: { entityID: SP_ENTITY_ID },
				},
			},
			headers,
		});

		return async function postResponse(
			spec: Omit<ResponseSpec, "providerId" | "email">,
		) {
			const SAMLResponse = buildSAMLResponse({
				...spec,
				providerId,
				email: `saml-${randomUUID()}@example.com`,
			});
			const response = await auth.handler(
				new Request(`${BASE_URL}/sso/saml2/sp/acs/${providerId}`, {
					method: "POST",
					headers: { "Content-Type": "application/x-www-form-urlencoded" },
					body: new URLSearchParams({ SAMLResponse }),
				}),
			);
			const location = new URL(
				response.headers.get("location") ?? "",
				BASE_URL,
			);
			return {
				error: location.searchParams.get("error"),
				signedIn: (response.headers.get("set-cookie") ?? "").includes(
					"better-auth.session_token=",
				),
			};
		};
	}

	it("accepts an assertion that expired within the default clock skew", async () => {
		const postResponse = await setup();

		await expect(
			postResponse({ notOnOrAfter: minutesFromNow(-2) }),
		).resolves.toEqual({ error: null, signedIn: true });
	});

	it("accepts an assertion whose NotBefore is within the default clock skew", async () => {
		const postResponse = await setup();

		await expect(
			postResponse({ notBefore: minutesFromNow(2) }),
		).resolves.toEqual({ error: null, signedIn: true });
	});

	it("rejects an assertion that expired beyond the default clock skew", async () => {
		const postResponse = await setup();

		await expect(
			postResponse({ notOnOrAfter: minutesFromNow(-6) }),
		).resolves.toMatchObject({ signedIn: false });
	});

	it("applies a configured clock skew to the assertion window", async () => {
		const strict = await setup(60_000);
		const lenient = await setup(3 * 60_000);
		const notOnOrAfter = minutesFromNow(-2);

		await expect(strict({ notOnOrAfter })).resolves.toMatchObject({
			signedIn: false,
		});
		await expect(lenient({ notOnOrAfter })).resolves.toEqual({
			error: null,
			signedIn: true,
		});
	});
});
