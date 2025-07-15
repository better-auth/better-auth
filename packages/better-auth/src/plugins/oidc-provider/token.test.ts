import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { oidcProvider } from ".";
import type { OauthClient } from "./types";
import { createAuthClient } from "../../client";
import { oidcClient } from "./client";
import { jwt } from "../jwt";
import { createAuthorizationCodeRequest, createAuthorizationURL, createRefreshAccessTokenRequest, validateAuthorizationCode } from "../../oauth2";
import { generateRandomString } from "../../crypto";
import type { MakeRequired } from "../../types/helper";
import { createLocalJWKSet, jwtVerify, type JSONWebKeySet } from "jose";
import { createClientCredentialsTokenRequest } from "../../oauth2/client-credentials-token";

describe("oidc token - authorization_code", async () => {
  const authServerBaseUrl = "http://localhost:3000"
  const rpBaseUrl = "http://localhost:5000"
  const {
    auth: authorizationServer,
    signInWithTestUser,
    customFetchImpl,
    testUser,
  } = await getTestInstance({
    baseURL: authServerBaseUrl,
    plugins: [
      jwt({
        usesOidcProviderPlugin: true,
      }),
      oidcProvider({
        loginPage: "/login",
        consentPage: "/oauth2/authorize",
        allowDynamicClientRegistration: true,
      }),
    ],
  });

  const { headers } = await signInWithTestUser();
  const client = createAuthClient({
    plugins: [
      oidcClient(),
    ],
    baseURL: authServerBaseUrl,
    fetchOptions: {
      customFetchImpl,
      headers,
    },
  });

  let oauthClient: OauthClient | null

  const providerId = "test"
  const redirectUri = `${rpBaseUrl}/api/auth/oauth2/callback/${providerId}`;
  const state = "123"
  let jwks: ReturnType<typeof createLocalJWKSet>

  // Registers a confidential client application to work with
  beforeAll(async () => {
    // This test is performed in register.test.ts
    const application: Partial<OauthClient>= {
      redirect_uris: [
        redirectUri
      ],
    }
    const response = await client.$fetch<OauthClient>(
      '/oauth2/register', {
      method: 'POST',
      body: application,
    })
    expect(response.data?.client_id).toBeDefined();
    expect(response.data?.user_id).toBeDefined();
    expect(response.data?.client_secret).toBeDefined();
    expect(response.data?.redirect_uris).toEqual(application.redirect_uris)

    oauthClient = response.data

    // Get jwks
    const jwksResult = await client.$fetch<JSONWebKeySet>('/jwks', {
      method: "GET"
    })
    if (!jwksResult.data) {
      throw new Error("Unable to fetch jwks");
    }
    jwks = createLocalJWKSet(jwksResult.data)
  })

  async function createAuthUrl(overrides?: Partial<Parameters<typeof createAuthorizationURL>[0]>) {
    if (!oauthClient?.client_id || !oauthClient?.client_secret) {
      throw Error("beforeAll not run properly");
    }
    const codeVerifier = generateRandomString(32);
    const url = await createAuthorizationURL({
      id: providerId,
      options: {
        clientId: oauthClient?.client_id,
        clientSecret: oauthClient?.client_secret,
        redirectURI: redirectUri,
      },
      redirectURI: '',
      authorizationEndpoint:
        `${authServerBaseUrl}/api/auth/oauth2/authorize`,
      state,
      scopes: ["openid", "profile", "email", "offline_access"],
      codeVerifier,
      ...overrides,
    });
    return {
      url,
      codeVerifier,
    }
  }

  async function validateAuthCode(
    overrides: MakeRequired<Partial<Parameters<typeof createAuthorizationCodeRequest>[0]>, 'code'>
  ) {
    if (!oauthClient?.client_id || !oauthClient?.client_secret) {
      throw Error("beforeAll not run properly");
    }

    const {
      body,
      headers,
    } = createAuthorizationCodeRequest({
      ...overrides,
      redirectURI: redirectUri,
      options: {
        clientId: oauthClient.client_id,
        clientSecret: oauthClient.client_secret,
        redirectURI: redirectUri,
      },
    })

    const tokens = await client.$fetch<{
      access_token?: string
      id_token?: string
      refresh_token?: string
      expires_in?: number
      expires_at?: Date
      token_type?: string
      scope?: string
      [key: string]: unknown
    }>(
      '/oauth2/token', {
        method: "POST",
        body: body,
        headers: headers,
      }
    );

    return tokens;
  }

  it("scope openid should provide access_token and id_token", async ({ expect }) => {
    if (!oauthClient?.client_id || !oauthClient?.client_secret) {
      throw Error('beforeAll not run properly')
    }

    const {
      url: authUrl,
      codeVerifier,
    } = await createAuthUrl({
      scopes: ["openid"]
    })

    let callbackRedirectUrl = ""
    await client.$fetch(authUrl.toString(), {
      onError(context) {
        callbackRedirectUrl = context.response.headers.get("Location") || "";
      },
    })
    expect(callbackRedirectUrl).toContain(redirectUri);
    expect(callbackRedirectUrl).toContain(`code=`);
    expect(callbackRedirectUrl).toContain(`state=123`);
    const url = new URL(callbackRedirectUrl);
    
    const tokens = await validateAuthCode({
      code: url.searchParams.get('code')!,
      codeVerifier,
    })
    expect(tokens.data?.access_token).toBeDefined();
    expect(tokens.data?.id_token).toBeDefined();
    expect(tokens.data?.refresh_token).toBeUndefined();
    expect(tokens.data?.scope).toBe("openid");

    const idToken = await jwtVerify(tokens.data?.id_token!, jwks)
    expect(idToken.protectedHeader).toBeDefined();
    expect(idToken.payload).toBeDefined();
    expect(idToken.payload.sub).toBeDefined();
    expect(idToken.payload.name).toBeUndefined();
    expect(idToken.payload.email).toBeUndefined();
  })

  it("scope openid+profile should provide access_token and id_token", async ({ expect }) => {
    if (!oauthClient?.client_id || !oauthClient?.client_secret) {
      throw Error('beforeAll not run properly')
    }

    const {
      url: authUrl,
      codeVerifier,
    } = await createAuthUrl({
      scopes: ["openid", "profile"]
    })

    let callbackRedirectUrl = ""
    await client.$fetch(authUrl.toString(), {
      onError(context) {
        callbackRedirectUrl = context.response.headers.get("Location") || "";
      },
    })
    expect(callbackRedirectUrl).toContain(redirectUri);
    expect(callbackRedirectUrl).toContain(`code=`);
    expect(callbackRedirectUrl).toContain(`state=123`);
    const url = new URL(callbackRedirectUrl);
    
    const tokens = await validateAuthCode({
      code: url.searchParams.get('code')!,
      codeVerifier,
    })
    expect(tokens.data?.access_token).toBeDefined();
    expect(tokens.data?.id_token).toBeDefined();
    expect(tokens.data?.refresh_token).toBeUndefined();
    expect(tokens.data?.scope).toBe("openid profile");

    const idToken = await jwtVerify(tokens.data?.id_token!, jwks)
    expect(idToken.protectedHeader).toBeDefined();
    expect(idToken.payload).toBeDefined();
    expect(idToken.payload.sub).toBeDefined();
    expect(idToken.payload.name).toBe(testUser.name);
    expect(idToken.payload.email).toBeUndefined();
  })

  it("scope openid+email should provide access_token and id_token", async ({ expect }) => {
    if (!oauthClient?.client_id || !oauthClient?.client_secret) {
      throw Error('beforeAll not run properly')
    }

    const {
      url: authUrl,
      codeVerifier,
    } = await createAuthUrl({
      scopes: ["openid", "email"]
    })

    let callbackRedirectUrl = ""
    await client.$fetch(authUrl.toString(), {
      onError(context) {
        callbackRedirectUrl = context.response.headers.get("Location") || "";
      },
    })
    expect(callbackRedirectUrl).toContain(redirectUri);
    expect(callbackRedirectUrl).toContain(`code=`);
    expect(callbackRedirectUrl).toContain(`state=123`);
    const url = new URL(callbackRedirectUrl);
    
    const tokens = await validateAuthCode({
      code: url.searchParams.get('code')!,
      codeVerifier,
    })
    expect(tokens.data?.access_token).toBeDefined();
    expect(tokens.data?.id_token).toBeDefined();
    expect(tokens.data?.refresh_token).toBeUndefined();
    expect(tokens.data?.scope).toBe("openid email");

    const idToken = await jwtVerify(tokens.data?.id_token!, jwks)
    expect(idToken.protectedHeader).toBeDefined();
    expect(idToken.payload).toBeDefined();
    expect(idToken.payload.sub).toBeDefined();
    expect(idToken.payload.name).toBeUndefined();
    expect(idToken.payload.email).toBe(testUser.email);
  })

  it("scope openid+offline_access should provide access_token, id_token, and refresh_token", async ({ expect }) => {
    if (!oauthClient?.client_id || !oauthClient?.client_secret) {
      throw Error('beforeAll not run properly')
    }

    const {
      url: authUrl,
      codeVerifier,
    } = await createAuthUrl({
      scopes: ["openid", "offline_access"]
    })

    let callbackRedirectUrl = ""
    await client.$fetch(authUrl.toString(), {
      onError(context) {
        callbackRedirectUrl = context.response.headers.get("Location") || "";
      },
    })
    expect(callbackRedirectUrl).toContain(redirectUri);
    expect(callbackRedirectUrl).toContain(`code=`);
    expect(callbackRedirectUrl).toContain(`state=123`);
    const url = new URL(callbackRedirectUrl);
    
    const tokens = await validateAuthCode({
      code: url.searchParams.get('code')!,
      codeVerifier,
    })
    expect(tokens.data?.access_token).toBeDefined();
    expect(tokens.data?.id_token).toBeDefined();
    expect(tokens.data?.refresh_token).toBeDefined();
    expect(tokens.data?.scope).toBe("openid offline_access");

    const idToken = await jwtVerify(tokens.data?.id_token!, jwks)
    expect(idToken.protectedHeader).toBeDefined();
    expect(idToken.payload).toBeDefined();
    expect(idToken.payload.sub).toBeDefined();
    expect(idToken.payload.name).toBeUndefined();
    expect(idToken.payload.email).toBeUndefined();
  })
});

describe("oidc token - refresh_token", async () => {
  const authServerBaseUrl = "http://localhost:3000"
  const rpBaseUrl = "http://localhost:5000"
  const {
    auth: authorizationServer,
    signInWithTestUser,
    customFetchImpl,
    testUser,
  } = await getTestInstance({
    baseURL: authServerBaseUrl,
    plugins: [
      jwt({
        usesOidcProviderPlugin: true,
      }),
      oidcProvider({
        loginPage: "/login",
        consentPage: "/oauth2/authorize",
        allowDynamicClientRegistration: true,
      }),
    ],
  });

  const { headers } = await signInWithTestUser();
  const client = createAuthClient({
    plugins: [
      oidcClient(),
    ],
    baseURL: authServerBaseUrl,
    fetchOptions: {
      customFetchImpl,
      headers,
    },
  });

  let oauthClient: OauthClient | null

  const providerId = "test"
  const redirectUri = `${rpBaseUrl}/api/auth/oauth2/callback/${providerId}`;
  const state = "123"
  let jwks: ReturnType<typeof createLocalJWKSet>

  // Registers a confidential client application to work with
  beforeAll(async () => {
    // This test is performed in register.test.ts
    const application: Partial<OauthClient>= {
      redirect_uris: [
        redirectUri
      ],
    }
    const response = await client.$fetch<OauthClient>(
      '/oauth2/register', {
      method: 'POST',
      body: application,
    })
    expect(response.data?.client_id).toBeDefined();
    expect(response.data?.user_id).toBeDefined();
    expect(response.data?.client_secret).toBeDefined();
    expect(response.data?.redirect_uris).toEqual(application.redirect_uris)

    oauthClient = response.data

    // Get jwks
    const jwksResult = await client.$fetch<JSONWebKeySet>('/jwks', {
      method: "GET"
    })
    if (!jwksResult.data) {
      throw new Error("Unable to fetch jwks");
    }
    jwks = createLocalJWKSet(jwksResult.data)
  })

  async function createAuthUrl(overrides?: Partial<Parameters<typeof createAuthorizationURL>[0]>) {
    if (!oauthClient?.client_id || !oauthClient?.client_secret) {
      throw Error("beforeAll not run properly");
    }
    const codeVerifier = generateRandomString(32);
    const url = await createAuthorizationURL({
      id: providerId,
      options: {
        clientId: oauthClient?.client_id,
        clientSecret: oauthClient?.client_secret,
        redirectURI: redirectUri,
      },
      redirectURI: '',
      authorizationEndpoint:
        `${authServerBaseUrl}/api/auth/oauth2/authorize`,
      state,
      scopes: ["openid", "profile", "email", "offline_access"],
      codeVerifier,
      ...overrides,
    });
    return {
      url,
      codeVerifier,
    }
  }

  async function validateAuthCode(
    overrides: MakeRequired<Partial<Parameters<typeof createAuthorizationCodeRequest>[0]>, 'code'>
  ) {
    if (!oauthClient?.client_id || !oauthClient?.client_secret) {
      throw Error("beforeAll not run properly");
    }

    const {
      body,
      headers,
    } = createAuthorizationCodeRequest({
      ...overrides,
      redirectURI: redirectUri,
      options: {
        clientId: oauthClient.client_id,
        clientSecret: oauthClient.client_secret,
        redirectURI: redirectUri,
      },
    })

    const tokens = await client.$fetch<{
      access_token?: string
      id_token?: string
      refresh_token?: string
      expires_in?: number
      expires_at?: Date
      token_type?: string
      scope?: string
      [key: string]: unknown
    }>(
      '/oauth2/token', {
        method: "POST",
        body: body,
        headers: headers,
      }
    );

    return tokens;
  }

  async function authorizeForRefreshToken(scopes: string[]) {
    const {
      url: authUrl,
      codeVerifier,
    } = await createAuthUrl({
      scopes: ["openid", "profile", "offline_access"],
    })

    let callbackRedirectUrl = ""
    await client.$fetch(authUrl.toString(), {
      onError(context) {
        callbackRedirectUrl = context.response.headers.get("Location") || "";
      },
    })
    expect(callbackRedirectUrl).toContain(redirectUri);
    expect(callbackRedirectUrl).toContain(`code=`);
    expect(callbackRedirectUrl).toContain(`state=123`);
    const url = new URL(callbackRedirectUrl);
    
    const tokens = await validateAuthCode({
      code: url.searchParams.get('code')!,
      codeVerifier,
    })
    expect(tokens.data?.access_token).toBeDefined();
    expect(tokens.data?.id_token).toBeDefined();
    expect(tokens.data?.refresh_token).toBeDefined();
    expect(tokens.data?.scope).toBe(scopes.join(" "));

    const idToken = await jwtVerify(tokens.data?.id_token!, jwks)
    expect(idToken.protectedHeader).toBeDefined();
    expect(idToken.payload).toBeDefined();
    expect(idToken.payload.sub).toBeDefined();
    expect(idToken.payload.name).toBeDefined();
    expect(idToken.payload.email).toBeUndefined();

    return tokens.data
  }

  it("should refresh token with same scopes", async ({ expect }) => {
    if (!oauthClient?.client_id || !oauthClient?.client_secret) {
      throw Error('beforeAll not run properly')
    }

    const scopes = ["openid", "profile", "offline_access"]
    const tokens = await authorizeForRefreshToken(scopes)
    expect(tokens?.refresh_token).toBeDefined()

    // Refresh tokens
    const {
      body,
      headers,
    } = createRefreshAccessTokenRequest({
      refreshToken: tokens?.refresh_token!,
      options: {
        clientId: oauthClient.client_id,
        clientSecret: oauthClient.client_secret,
        redirectURI: redirectUri,
      },
      extraParams: {
        scope: scopes.join(" ")
      }
    })
    const newTokens = await client.$fetch<{
      access_token?: string
      id_token?: string
      refresh_token?: string
      expires_in?: number
      expires_at?: Date
      token_type?: string
      scope?: string
      [key: string]: unknown
    }>(
      '/oauth2/token', {
        method: "POST",
        body: body,
        headers: headers,
      }
    );
    expect(newTokens.data?.access_token).toBeDefined();
    expect(newTokens.data?.id_token).toBeDefined();
    expect(newTokens.data?.refresh_token).toBeDefined();
    expect(newTokens.data?.scope).toBe(scopes.join(" "));

    // Always expect a new refresh token
    expect(tokens?.refresh_token).not.toEqual(newTokens.data?.refresh_token)
  })

  it("should refresh token with lesser scopes", async ({ expect }) => {
    if (!oauthClient?.client_id || !oauthClient?.client_secret) {
      throw Error('beforeAll not run properly')
    }

    const scopes = ["openid", "profile", "offline_access"]
    const newScopes = ["openid", "offline_access"]
    const tokens = await authorizeForRefreshToken(scopes)
    expect(tokens?.refresh_token).toBeDefined()

    // Refresh tokens
    const {
      body,
      headers,
    } = createRefreshAccessTokenRequest({
      refreshToken: tokens?.refresh_token!,
      options: {
        clientId: oauthClient.client_id,
        clientSecret: oauthClient.client_secret,
        redirectURI: redirectUri,
      },
      extraParams: {
        scope: newScopes.join(" ")
      }
    })
    const newTokens = await client.$fetch<{
      access_token?: string
      id_token?: string
      refresh_token?: string
      expires_in?: number
      expires_at?: Date
      token_type?: string
      scope?: string
      [key: string]: unknown
    }>(
      '/oauth2/token', {
        method: "POST",
        body: body,
        headers: headers,
      }
    );
    expect(newTokens.data?.access_token).toBeDefined();
    expect(newTokens.data?.id_token).toBeDefined();
    expect(newTokens.data?.refresh_token).toBeDefined();
    expect(newTokens.data?.scope).toBe(newScopes.join(" "));

    // Always expect a new refresh token
    expect(tokens?.refresh_token).not.toEqual(newTokens.data?.refresh_token)
  })

  it("should not refresh token when removing offline_scope", async ({ expect }) => {
    if (!oauthClient?.client_id || !oauthClient?.client_secret) {
      throw Error('beforeAll not run properly')
    }

    const scopes = ["openid", "profile", "offline_access"]
    const newScopes = ["openid"]
    const tokens = await authorizeForRefreshToken(scopes)
    expect(tokens?.refresh_token).toBeDefined()

    // Refresh tokens
    const {
      body,
      headers,
    } = createRefreshAccessTokenRequest({
      refreshToken: tokens?.refresh_token!,
      options: {
        clientId: oauthClient.client_id,
        clientSecret: oauthClient.client_secret,
        redirectURI: redirectUri,
      },
      extraParams: {
        scope: newScopes.join(" ")
      }
    })
    const newTokens = await client.$fetch<{
      access_token?: string
      id_token?: string
      refresh_token?: string
      expires_in?: number
      expires_at?: Date
      token_type?: string
      scope?: string
      [key: string]: unknown
    }>(
      '/oauth2/token', {
        method: "POST",
        body: body,
        headers: headers,
      }
    );
    expect(newTokens.data?.access_token).toBeDefined();
    expect(newTokens.data?.id_token).toBeDefined();
    expect(newTokens.data?.refresh_token).toBeUndefined();
    expect(newTokens.data?.scope).toBe([newScopes].join(" "));

    // Should not refresh token
    expect(tokens?.refresh_token).not.toEqual(newTokens.data?.refresh_token)
  })

  it("should not refresh token with more scopes", async ({ expect }) => {
    if (!oauthClient?.client_id || !oauthClient?.client_secret) {
      throw Error('beforeAll not run properly')
    }

    const scopes = ["openid", "profile", "offline_access"]
    const newScopes = ["openid", "email", "offline_access"]
    const tokens = await authorizeForRefreshToken(scopes)
    expect(tokens?.refresh_token).toBeDefined()

    // Refresh tokens
    const {
      body,
      headers,
    } = createRefreshAccessTokenRequest({
      refreshToken: tokens?.refresh_token!,
      options: {
        clientId: oauthClient.client_id,
        clientSecret: oauthClient.client_secret,
        redirectURI: redirectUri,
      },
      extraParams: {
        scope: newScopes.join(" ")
      }
    })
    const newTokens = await client.$fetch<{
      access_token?: string
      id_token?: string
      refresh_token?: string
      expires_in?: number
      expires_at?: Date
      token_type?: string
      scope?: string
      [key: string]: unknown
    }>(
      '/oauth2/token', {
        method: "POST",
        body: body,
        headers: headers,
      }
    );
    expect(newTokens.error?.status).toBeDefined();
  })
});

describe("oidc token - client_credentials", async () => {
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
        jwt: {
          audience: "https://myapi.example.com",
        },
      }),
      oidcProvider({
        loginPage: "/login",
        consentPage: "/oauth2/authorize",
        allowDynamicClientRegistration: true,
        scopes: [
          "openid",
          "profile",
          "email",
          "read:posts",
        ]
      }),
    ],
  });

  const { headers } = await signInWithTestUser();
  const client = createAuthClient({
    plugins: [
      oidcClient(),
    ],
    baseURL: authServerBaseUrl,
    fetchOptions: {
      customFetchImpl,
      headers,
    },
  });

  let oauthClient: OauthClient | null

  const providerId = "test"
  const redirectUri = `${rpBaseUrl}/api/auth/oauth2/callback/${providerId}`;
  let jwks: ReturnType<typeof createLocalJWKSet>

  // Registers a confidential client application to work with
  beforeAll(async () => {
    // This test is performed in register.test.ts
    const application: Partial<OauthClient>= {
      redirect_uris: [
        redirectUri
      ],
    }
    const response = await client.$fetch<OauthClient>(
      '/oauth2/register', {
      method: 'POST',
      body: application,
    })
    expect(response.data?.client_id).toBeDefined();
    expect(response.data?.user_id).toBeDefined();
    expect(response.data?.client_secret).toBeDefined();
    expect(response.data?.redirect_uris).toEqual(application.redirect_uris)

    oauthClient = response.data

    // Get jwks
    const jwksResult = await client.$fetch<JSONWebKeySet>('/jwks', {
      method: "GET"
    })
    if (!jwksResult.data) {
      throw new Error("Unable to fetch jwks");
    }
    jwks = createLocalJWKSet(jwksResult.data)
  })

  it("should obtain a credential token", async ({ expect }) => {
    if (!oauthClient?.client_id || !oauthClient?.client_secret) {
      throw Error('beforeAll not run properly')
    }

    const scopes = ["read:posts"]
    const {
      body,
      headers,
    } = createClientCredentialsTokenRequest({
      scope: scopes.join(" "),
      options: {
        clientId: oauthClient.client_id,
        clientSecret: oauthClient.client_secret,
        redirectURI: redirectUri,
      },
    })
    const tokens = await client.$fetch<{
      access_token?: string
      id_token?: string
      refresh_token?: string
      expires_in?: number
      expires_at?: string
      token_type?: string
      scope?: string
      [key: string]: unknown
    }>(
      '/oauth2/token', {
        method: "POST",
        body: body,
        headers: headers,
      }
    );
    expect(tokens.data?.access_token).toBeDefined();
    expect(tokens.data?.id_token).toBeUndefined();
    expect(tokens.data?.refresh_token).toBeUndefined();
    expect(tokens.data?.scope).toBe(scopes.join(" "));
    expect(tokens.data?.expires_in).toBe(3600);
    expect(tokens.data?.expires_at).toBeDefined();

    const accessToken = await jwtVerify(tokens.data?.access_token!, jwks)
    expect(accessToken.payload.iss).toBeDefined()
    expect(accessToken.payload.sub).toBeUndefined() // unset since not a user!
    expect(accessToken.payload.iat).toBeDefined()
    expect(accessToken.payload.exp).toBe(Date.parse(tokens.data?.expires_at!) / 1000)
    expect(accessToken.payload.scope).toBe(scopes.join(" "))
  });

  it("should fail without requested scope and clientCredentialGrantDefaultScopes not set", async ({ expect }) => {
    if (!oauthClient?.client_id || !oauthClient?.client_secret) {
      throw Error('beforeAll not run properly')
    }

    const {
      body,
      headers,
    } = createClientCredentialsTokenRequest({
      options: {
        clientId: oauthClient.client_id,
        clientSecret: oauthClient.client_secret,
        redirectURI: redirectUri,
      },
    })
    const tokens = await client.$fetch<{
      access_token?: string
      id_token?: string
      refresh_token?: string
      expires_in?: number
      expires_at?: string
      token_type?: string
      scope?: string
      [key: string]: unknown
    }>(
      '/oauth2/token', {
        method: "POST",
        body: body,
        headers: headers,
      }
    );
    expect(tokens.error?.status).toBeDefined();
  })
});