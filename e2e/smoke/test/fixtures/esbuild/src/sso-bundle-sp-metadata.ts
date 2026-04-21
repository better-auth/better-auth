/**
 * Bundled integration check: `@better-auth/sso` → SAML SP metadata route
 * (`saml.SPMetadata` when `spMetadata.metadata` is omitted).
 *
 * @see https://github.com/better-auth/better-auth/issues/7993
 */
import { DatabaseSync } from "node:sqlite";
import { sso } from "@better-auth/sso";
import { ssoClient } from "@better-auth/sso/client";
import { betterAuth } from "better-auth";
import { createAuthClient } from "better-auth/client";
import { parseSetCookieHeader } from "better-auth/cookies";
import { getMigrations } from "better-auth/db/migration";

/** Same PEM as `e2e/smoke/test/saml.spec.ts` (minimal valid cert for config). */
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

const baseURL = "http://localhost:7654";
const basePath = "/api/auth";
const providerId = "esbuild-sso-sp-metadata";

const database = new DatabaseSync(":memory:");

async function main() {
	const auth = betterAuth({
		baseURL,
		secret: "better-auth-secret-that-is-long-enough-for-validation-test",
		database,
		emailAndPassword: { enabled: true },
		rateLimit: { enabled: false },
		trustedOrigins: [baseURL],
		plugins: [sso()],
	});

	const customFetchImpl = async (
		url: string | URL | Request,
		init?: RequestInit,
	) => auth.handler(new Request(url, init));

	const client = createAuthClient({
		baseURL: `${baseURL}${basePath}`,
		plugins: [ssoClient()],
		fetchOptions: { customFetchImpl },
	});

	const { runMigrations } = await getMigrations(auth.options);
	await runMigrations();

	await auth.api.signUpEmail({
		body: {
			email: "sso-bundle@test.local",
			password: "test123456",
			name: "SSO bundle",
		},
	});

	const sessionHeaders = new Headers();
	await client.signIn.email({
		email: "sso-bundle@test.local",
		password: "test123456",
		fetchOptions: {
			onSuccess(context) {
				const raw = context.response.headers.get("set-cookie");
				const cookies = parseSetCookieHeader(raw || "");
				const token = cookies.get("better-auth.session_token")?.value;
				if (!token) {
					throw new Error("missing session cookie after sign-in");
				}
				sessionHeaders.set("cookie", `better-auth.session_token=${token}`);
			},
		},
	});

	await auth.api.registerSSOProvider({
		headers: sessionHeaders,
		body: {
			providerId,
			issuer: "https://idp.example.com",
			domain: "example.com",
			samlConfig: {
				entryPoint: "https://idp.example.com/saml2/sso",
				cert: TEST_CERT,
				callbackUrl: `${baseURL}${basePath}/sso/saml2/sp/acs/${providerId}`,
				wantAssertionsSigned: false,
				signatureAlgorithm: "sha256",
				digestAlgorithm: "sha256",
				// No `metadata` XML → handler uses `saml.SPMetadata(...)` (issue #7993).
				spMetadata: { binding: "post" },
			},
		},
	});

	const metadataRes = await auth.api.spMetadata({
		query: { providerId },
	});
	const xml = await metadataRes.text();
	if (metadataRes.status !== 200) {
		throw new Error(
			`spMetadata expected 200, got ${metadataRes.status}: ${xml.slice(0, 500)}`,
		);
	}
	if (!xml.includes("EntityDescriptor")) {
		throw new Error("SP metadata response should contain EntityDescriptor");
	}
}

main().catch((err: unknown) => {
	console.error(err);
	process.exit(1);
});
