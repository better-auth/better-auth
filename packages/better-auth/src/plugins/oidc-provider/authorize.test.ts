import { beforeAll, describe, it, expect } from "vitest";
import { oidcProvider, type OauthClient } from ".";
import { createAuthClient } from "../../client";
import { getTestInstance } from "../../test-utils/test-instance";
import { jwt } from "../jwt";
import { oidcClient } from "./client";
import { createAuthorizationURL } from "../../oauth2";
import { generateRandomString } from "../../crypto";

describe("oidc authorize - unauthenticated", async () => {
	const authServerBaseUrl = "http://localhost:3000"
	const rpBaseUrl = "http://localhost:5000"
  const {
    signInWithTestUser,
    customFetchImpl,
  } = await getTestInstance({
    baseURL: authServerBaseUrl,
    plugins: [
      jwt({
        usesOidcProviderPlugin: true,
      }),
      oidcProvider({
        loginPage: "/login",
        consentPage: "/consent",
        allowDynamicClientRegistration: true,
      }),
    ],
  });
  const { headers } = await signInWithTestUser();
  const serverClient = createAuthClient({
    plugins: [oidcClient()],
    baseURL: authServerBaseUrl,
    fetchOptions: {
      customFetchImpl,
      headers,
    },
  });
	const unauthenticatedClient = createAuthClient({
		plugins: [oidcClient()],
		baseURL: authServerBaseUrl,
		fetchOptions: {
			customFetchImpl,
		},
	});

	let oauthClient: OauthClient | null
	const providerId = "test"
  const redirectUri = `${rpBaseUrl}/api/auth/oauth2/callback/${providerId}`
	// Registers a confidential client application to work with
	beforeAll(async () => {
		// This test is performed in register.test.ts
		const application: Partial<OauthClient>= {
			redirect_uris: [ redirectUri ],
		}
		const response = await serverClient.$fetch<OauthClient>(
			"/oauth2/register", {
			method: "POST",
			body: application,
		})
		expect(response.data?.client_id).toBeDefined();
		expect(response.data?.user_id).toBeDefined();
		expect(response.data?.client_secret).toBeDefined();
		expect(response.data?.redirect_uris).toEqual(application.redirect_uris)

		oauthClient = response.data
	})

  it("should always redirect to login - prompt undefined, response code, state set, no codeVerifier", async () => {
    if (!oauthClient?.client_id || !oauthClient?.client_secret) {
			throw Error("beforeAll not run properly")
		}
    const authUrl = await createAuthorizationURL({
      id: providerId,
      options: {
        clientId: oauthClient.client_id,
        clientSecret: oauthClient.client_secret,
      },
      redirectURI: redirectUri,
      state: "123",
      scopes: ["openid"],
      responseType: "code",
      authorizationEndpoint:
        `${authServerBaseUrl}/api/auth/oauth2/authorize`,
    })

    let loginRedirectUrl = ""
    await unauthenticatedClient.$fetch(authUrl.toString(), {
      onError(context) {
        loginRedirectUrl = context.response.headers.get("Location") || "";
      },
    })
    expect(loginRedirectUrl).toContain("/login");
    expect(loginRedirectUrl).toContain("response_type=code");
    expect(loginRedirectUrl).toContain(`client_id=${oauthClient.client_id}`);
    expect(loginRedirectUrl).toContain("scope=openid");
    expect(loginRedirectUrl).toContain(`redirect_uri=${encodeURIComponent(redirectUri)}`)
  })
})

describe("oidc authorize - authenticated", async () => {
	const authServerBaseUrl = "http://localhost:3000"
	const rpBaseUrl = "http://localhost:5000"
  const {
    signInWithTestUser,
    customFetchImpl,
  } = await getTestInstance({
    baseURL: authServerBaseUrl,
    plugins: [
      jwt({
        usesOidcProviderPlugin: true,
      }),
      oidcProvider({
        loginPage: "/login",
        consentPage: "/consent",
        allowDynamicClientRegistration: true,
      }),
    ],
  });
  const { headers } = await signInWithTestUser();
  const client = createAuthClient({
    plugins: [oidcClient()],
    baseURL: authServerBaseUrl,
    fetchOptions: {
      customFetchImpl,
      headers,
    },
  });

	let oauthClient: OauthClient | null
	const providerId = "test"
  const redirectUri = `${rpBaseUrl}/api/auth/oauth2/callback/${providerId}`
	// Registers a confidential client application to work with
	beforeAll(async () => {
		// This test is performed in register.test.ts
		const application: Partial<OauthClient>= {
			redirect_uris: [ redirectUri ],
		}
		const response = await client.$fetch<OauthClient>(
			"/oauth2/register", {
			method: "POST",
			body: application,
		})
		expect(response.data?.client_id).toBeDefined();
		expect(response.data?.user_id).toBeDefined();
		expect(response.data?.client_secret).toBeDefined();
		expect(response.data?.redirect_uris).toEqual(application.redirect_uris)

		oauthClient = response.data
	})

  it("should authorize - prompt undefined, response code, state set, no codeVerifier", async () => {
    if (!oauthClient?.client_id || !oauthClient?.client_secret) {
			throw Error("beforeAll not run properly");
		}
    const codeVerifier = generateRandomString(32);
    const authUrl = await createAuthorizationURL({
      id: providerId,
      options: {
        clientId: oauthClient.client_id,
        clientSecret: oauthClient.client_secret,
      },
      redirectURI: redirectUri,
      state: "123",
      scopes: ["openid"],
      responseType: "code",
      authorizationEndpoint:
        `${authServerBaseUrl}/api/auth/oauth2/authorize`,
      codeVerifier,
    });

    let callbackRedirectUrl = ""
    await client.$fetch(authUrl.toString(), {
      onError(context) {
        callbackRedirectUrl = context.response.headers.get("Location") || "";
      },
    })
    expect(callbackRedirectUrl).toContain(redirectUri);
    expect(callbackRedirectUrl).toContain(`code=`);
    expect(callbackRedirectUrl).toContain(`state=123`);
  })
})
