import { describe, it, expect } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { checkMcp, handleMcpErrors, mcp, type AuthServerMetadata } from ".";
import { jwt, signJwt, type JwtPluginOptions } from "../jwt";
import { oidcProvider, type OIDCMetadata } from "../oidc-provider";
import { createAuthClient, type BetterAuthClientPlugin } from "../../client";
import { mcpClient } from "./client";
import { createAuthEndpoint, sessionMiddleware } from "../../api";
import type { BetterAuthPlugin } from "..";
import { generateKeyPair, SignJWT } from "jose";

/**
 * Tester plugin helps that converts session tokens to Jwt tokens
 * at '/token'. We do this, so we don't need the whole auth process.
 * 
 * Obtained from the '/token' function seen in the jwt plugin which is disabled
 * when usesOidcProviderPlugin = true
 */
const testJwtHelperPlugin = (options?: JwtPluginOptions, index?: number) => {
  return {
    id: `jwt-test-helper${index ?? ''}`,
    endpoints: {
      [`getToken${index ?? ''}`]: createAuthEndpoint(
        `/token${index ?? ''}`, {
          method: "GET",
          requireHeaders: true,
          use: [sessionMiddleware],
        },
        async (ctx) => {
          // Convert context into user payload
          let payload: Record<string, any>
          if (options?.jwt?.definePayload) {
            payload = await options?.jwt.definePayload(ctx.context.session!)
          } else {
            payload = {
              ...ctx.context.session?.user,
              id: undefined // id becomes sub in Sign Function
            }
          }

          // Convert into jwt token
          const jwt = await signJwt(
            ctx,
            payload,
            options,
          );
          return ctx.json({
            token: jwt,
          });
        }
      )
    }
  } satisfies BetterAuthPlugin
}
const testJwtHelperClient = (index?: number) => {
  return {
    id: `jwt-test-helper-client${index ?? ''}`,
    $InferServerPlugin: {} as ReturnType<typeof testJwtHelperPlugin>,
  } satisfies BetterAuthClientPlugin;
};


describe("mcp - init", async () => {
  it("should fail without the oidc and jwt plugins", async ({ expect }) => {
    await expect(getTestInstance({
      plugins: [
        mcp(),
      ],
    })).rejects.toThrow();
  })

  it("should pass with correct plugins", async ({ expect }) => {
    await expect(getTestInstance({
      plugins: [
        jwt({
          usesOidcProviderPlugin: true,
        }),
        oidcProvider({
          loginPage: "/login",
          consentPage: "/consent",
        }),
        mcp(),
      ],
    })).resolves.not.toThrow()
  })
})

describe("mcp - no scopes", async () => {
  const authServerBaseUrl = "http://localhost:3000"
  const {
    auth,
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
      }),
      mcp(),
    ],
  });

  const unauthenticatedClient = createAuthClient({
    plugins: [
      mcpClient(),
    ],
    baseURL: authServerBaseUrl,
    fetchOptions: {
      customFetchImpl,
    },
  });

  it("should obtain auth server metadata", async () => {
		const response = await unauthenticatedClient.$fetch<AuthServerMetadata>('/.well-known/oauth-authorization-server', {
      method: "GET",
    })
    expect(response.data).toBeDefined()
    expect(response.data?.scopes_supported).toBeUndefined()
    expect(response.data?.issuer).toBe(`${auth.options.baseURL}/api/auth`)
    expect(response.data?.authorization_endpoint).toBe(`${auth.options.baseURL}/api/auth/oauth2/authorize`)
    expect(response.data?.token_endpoint).toBe(`${auth.options.baseURL}/api/auth/oauth2/token`)
    expect(response.data?.jwks_uri).toBe(`${auth.options.baseURL}/api/auth/jwks`)
    expect(response.data?.registration_endpoint).toBe(`${auth.options.baseURL}/api/auth/oauth2/register`)
    expect(response.data?.response_types_supported).toMatchObject([ 'code' ])
    expect(response.data?.response_modes_supported).toMatchObject([ 'query' ])
    expect(response.data?.grant_types_supported).toMatchObject([ 'authorization_code', 'refresh_token', 'client_credentials' ])
    expect(response.data?.token_endpoint_auth_signing_alg_values_supported).toMatchObject([ 'EdDSA' ])
    expect(response.data?.token_endpoint_auth_methods_supported).toMatchObject([ 'client_secret_basic', 'client_secret_post' ])
    expect(response.data?.code_challenge_methods_supported).toMatchObject([ 's256' ])
  })
});

describe("mcp - oidc", async () => {
  const authServerBaseUrl = "http://localhost:3000"
  const {
    auth,
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
      }),
      mcp({
        resourceServer: {
          resource: "https://api.example.com",
          scopes_supported: ["openid"],
        }
      }),
    ],
  });

  const unauthenticatedClient = createAuthClient({
    plugins: [
      mcpClient(),
    ],
    baseURL: authServerBaseUrl,
    fetchOptions: {
      customFetchImpl,
    },
  });

  it("should obtain oidc-like metadata", async () => {
		const response = await unauthenticatedClient.$fetch<OIDCMetadata>('/.well-known/oauth-authorization-server', {
      method: "GET",
    })
    expect(response.data).toBeDefined()
    expect(response.data?.scopes_supported).toMatchObject(["openid"])
    expect(response.data?.claims_supported).toBeDefined()
    expect(response.data?.userinfo_endpoint).toBe(`${auth.options.baseURL}/api/auth/oauth2/userinfo`)
    expect(response.data?.subject_types_supported).toBeDefined()
    expect(response.data?.id_token_signing_alg_values_supported).toMatchObject([ 'EdDSA' ])
    expect(response.data?.acr_values_supported).toBeDefined()
  })
});

describe("mcp - checkMcp", async () => {
  const authServerBaseUrl = "http://localhost:3000"
  const apiServerBaseUrl = "http://localhost:5000"
  const {
    auth,
    signInWithTestUser,
    testUser,
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
      }),
      testJwtHelperPlugin(),
      testJwtHelperPlugin({
        jwt: {
          audience: 'https://api-1.example.com',
        }
      },
        1
      ),
      mcp({
        resourceServer: {
          resource: "https://api.example.com",
          scopes_supported: ["openid"],
        }
      }),
    ],
  });

  const { headers } = await signInWithTestUser();
  const client = createAuthClient({
    plugins: [
      testJwtHelperClient(),
      mcpClient(),
    ],
    baseURL: authServerBaseUrl,
    fetchOptions: {
      customFetchImpl,
      headers,
    },
  });

  it("should fail without access token", async () => {
    expect(checkMcp({
      // @ts-ignore
      auth,
      undefined,
      baseUrl: apiServerBaseUrl,
    })).rejects.toThrow()
  })

  it("should fail without access token and convert error to www-authenticate", async () => {
    try {
      await checkMcp({
        // @ts-ignore
        auth,
        undefined,
        baseUrl: apiServerBaseUrl,
      })
      expect(true).toBe(false) // Should never reach test
    } catch (error) {
      expect(() => handleMcpErrors(error)).not.toThrow()
      const res = handleMcpErrors(error)
      expect(res.headers.get('www-authenticate')).toBe(`Bearer resource_metadata="${apiServerBaseUrl}/.well-known/oauth-authorization-server"`)
    }
  })

  let jwtSub: string | undefined
  it("should pass verification with valid access token", async () => {
    const response = await client.$fetch<{
      token: string,
    }>('/token', {
      headers,
    })
    const accessToken = response.data?.token
    expect(accessToken).toBeDefined();

    const tokens = await checkMcp({
      // @ts-ignore
      auth,
      accessToken,
      baseUrl: apiServerBaseUrl,
    })

    expect(tokens.jwt_raw).toBeDefined();
    expect(tokens.jwt.sub).toBeDefined();
    expect(tokens.jwt.name).toBe(testUser.name);
    expect(tokens.jwt.email).toBe(testUser.email);

    jwtSub = tokens.jwt.sub
  })


  it("should fail verification with token from different audience", async () => {
    const response = await client.$fetch<{
      token: string,
    }>('/token1', {
      headers,
    })
    const accessToken = response.data?.token
    expect(accessToken).toBeDefined();

    try {
      await checkMcp({
        // @ts-ignore
        auth,
        accessToken,
        baseUrl: apiServerBaseUrl,
      })
      expect(true).toBe(false) // Should never reach test
    } catch (error) {
      expect(() => handleMcpErrors(error)).not.toThrow()
      const res = handleMcpErrors(error)
      expect(res.headers.get('www-authenticate')).toBe(`Bearer resource_metadata="${apiServerBaseUrl}/.well-known/oauth-authorization-server"`)
      return
    }
  })

  it("should fail verification with invalid/mocked access with different signature", async () => {
    const { privateKey } = await generateKeyPair(
      "EdDSA", {
        crv: "Ed25519",
        extractable: true,
      },
    );
    const accessToken = await new SignJWT({
        sub: jwtSub,
        name: testUser.name,
        email: testUser.email,
      })
      .setProtectedHeader({
        alg: "EdDSA",
        kid: '1234',
        typ: 'JWT',
      })
      .setIssuedAt(new Date())
      .setIssuer(authServerBaseUrl)
      .setAudience(authServerBaseUrl)
      .setExpirationTime("15m")
      .sign(privateKey)
    expect(accessToken).toBeDefined();

    try {
      await checkMcp({
        // @ts-ignore
        auth,
        accessToken,
        baseUrl: apiServerBaseUrl,
      })
      expect(true).toBe(false) // Should never reach test
    } catch (error) {
      expect(() => handleMcpErrors(error)).not.toThrow()
      const res = handleMcpErrors(error)
      expect(res.headers.get('www-authenticate')).toBe(`Bearer resource_metadata="${apiServerBaseUrl}/.well-known/oauth-authorization-server"`)
      return
    }
  })
});
