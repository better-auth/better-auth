import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { describe, test } from "node:test";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";

const { sso } = createRequire(import.meta.url)("@better-auth/sso");

const TEST_CERT = `MIIDXTCCAkWgAwIBAgIJAOxEm08dOr3PMA0GCSqGSIb3DqEBCwUAMEUxCzAJBgNV
BAYTAkFVMRMwEQYDVQQIDApTb21lLVN0YXRlMSEwHwYDVQQKDBhJbnRlcm5ldCBX
aWRnaXRzIFB0eSBMdGQwHhcNMjMwMTAxMDAwMDAwWhcNMjQwMTAxMDAwMDAwWjBF
MQswCQYDVQQGEwJBVTETMBEGA1UECAwKU29tZS1TdGF0ZTEhMB8GA1UECgwYSW50
ZXJuZXQgV2lkZ2l0cyBQdHkgTHRkMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIB
CgKCAQEA0Z3VS5JJcds3xfn/ygWyF06PmGCaHH2nSMm5KGEqFOcEzMJJJdkasJR
YVL0Jr+5N3x3m2SO1HBG3sLMvKHGRERgC7aSFkmP7Xl1kHSJMJKMN4JVVvSJaGkn
gNNCfwLqukBHFMJONJUElylXKxmYMWG7M/ZSWbKJiKYSTNAGR8BEEYH1EmFxfJAs
m5SixVlOm5JlFT1nFsj4Z6SQB5lDflMWWOJoj9/aUKFG0FTEwEQLeaVfjhBHPsRM
ThNanmUeq1HVOG82g0FiE5VVpGSo+nKhGMJp/soNLB7cMPAP/N4VJszlSa7EZn3J
wIDAQABo1AwTjAdBgNVHQ4EFgQUbFtbxjr34KYMvFMrOC28riQRkPYwHwYDVR0j
BBgwFoAUbFtbxjr34KYMvFMrOC28riQRkPYwDAYDVR0TBAUwAwEB/zANBgkqhkiG
9w0BAQsFAAOCAQEAJIFhx+c7KCnKaqHCOLfLIpHJiRnTa0XJpJaQyPFnBLLKFXQP
t/2fLHGfFAmf/jBmDKb0/Q4rQ4LhRiADj1MKVeL3S0qYK1Bh/PoG8nG8pRiMMzO
YdNuLSXM1KCgp3SfIVFLLiD3x5YC8j0BXJlqF9lF4Q3YJwLaPEV4Kn5hDT3LgAk
Yt/8OxMnS0T7IMxBHIMqGH8w/DLN2c3j3DHfFJo1THmN/J6F8N9ZZQIH0bBx+BLm
/4BsnMVGJEZXIf/I6YIMMBxz8m3BVWpUT1VHFqWk7dnkbmGGv0jcfpOHTj/X91+N
r1PAFY+X3xF+5qDTbPpcHFPTIEWLpJFJPkSS+Q==`;

const IDP_ENTRY_POINT = "https://idp.example.com/saml2/sso";

describe("SAML SSO", () => {
	test("should generate SAML login request URL via defaultSSO", async () => {
		const database = new DatabaseSync(":memory:");
		const auth = betterAuth({
			baseURL: "http://localhost:3000",
			database,
			emailAndPassword: { enabled: true },
			plugins: [
				sso({
					defaultSSO: [
						{
							providerId: "test-saml",
							domain: "example.com",
							samlConfig: {
								issuer: "https://idp.example.com",
								entryPoint: IDP_ENTRY_POINT,
								cert: TEST_CERT,
								callbackUrl:
									"http://localhost:3000/api/auth/sso/saml2/callback/test-saml",
								spMetadata: {},
							},
						},
					],
				}),
			],
		});

		const { runMigrations } = await getMigrations(auth.options);
		await runMigrations();

		const result = await auth.api.signInSSO({
			body: {
				providerId: "test-saml",
				callbackURL: "/dashboard",
			},
		});

		assert.ok(result.url, "should return a redirect URL");
		assert.ok(
			result.url.includes(IDP_ENTRY_POINT),
			`URL should point to the IdP entry point, got: ${result.url}`,
		);
		assert.ok(
			result.url.includes("SAMLRequest"),
			"URL should contain a SAMLRequest parameter",
		);
		assert.equal(result.redirect, true);
	});

	test("should generate SAML login request URL via email domain lookup", async () => {
		const database = new DatabaseSync(":memory:");
		const auth = betterAuth({
			baseURL: "http://localhost:3000",
			database,
			emailAndPassword: { enabled: true },
			plugins: [
				sso({
					defaultSSO: [
						{
							providerId: "domain-saml",
							domain: "corp.example.com",
							samlConfig: {
								issuer: "https://idp.corp.example.com",
								entryPoint: IDP_ENTRY_POINT,
								cert: TEST_CERT,
								callbackUrl:
									"http://localhost:3000/api/auth/sso/saml2/callback/domain-saml",
								spMetadata: {},
							},
						},
					],
				}),
			],
		});

		const { runMigrations } = await getMigrations(auth.options);
		await runMigrations();

		const result = await auth.api.signInSSO({
			body: {
				email: "user@corp.example.com",
				callbackURL: "/dashboard",
			},
		});

		assert.ok(result.url);
		assert.ok(result.url.includes(IDP_ENTRY_POINT));
		assert.ok(result.url.includes("SAMLRequest"));
		assert.equal(result.redirect, true);
	});
});
