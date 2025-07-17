import { APIError } from "../../api";
import type { GenericEndpointContext, Session, User, Verification } from "../../types";
import type { SchemaClient, OIDCOptions, VerificationValue } from "./types";
import { createHash } from "@better-auth/utils/hash";
import { base64 } from "@better-auth/utils/base64";
import { generateRandomString } from "../../crypto";
import { signJwt } from "../jwt"
import { getJwtPlugin } from "..";
import { GrantType } from "../mcp/types";
import { JWTPayload } from "jose";

/**
 * Handles the /oauth2/token endpoint by delegating
 * the grant types
 */
export async function tokenEndpoint(
  ctx: GenericEndpointContext,
  opts: OIDCOptions,
) {
  let { body } = ctx;
  if (!body) {
    throw new APIError("BAD_REQUEST", {
      error_description: "request body not found",
      error: "invalid_request",
    });
  }
  if (body instanceof FormData) {
    body = Object.fromEntries(body.entries());
  }

  const grantType: GrantType | undefined = body?.grant_type
  switch (grantType) {
    case 'authorization_code':
      return handleAuthorizationCodeGrant(ctx, opts, body)
    case 'client_credentials':
      return handleClientCredentialsGrant(ctx, opts, body)
    case 'refresh_token':
      return handleRefreshTokenGrant(ctx, opts, body)
    case undefined:
      throw new APIError("BAD_REQUEST", {
        error_description: 'missing required grant_type',
        error: "invalid_request",
      });
    default:
      throw new APIError("BAD_REQUEST", {
        error_description: `unsupported grant_type ${grantType}`,
        error: "invalid_request",
      });
  }
}

// User Jwt SHALL follow oAuth2
async function signUserJwt(
  ctx: GenericEndpointContext,
  opts: OIDCOptions,
  user: User,
  clientId: string,
  audience: string | string[],
  scopes: string[],
  sessionId: string,
  overrides?: {
    iat?: number
    exp?: number
  },
) {
  const now = Date.now();
  const iat = overrides?.iat ?? Math.floor(now / 1000);
  const expiresIn = opts.accessTokenExpiresIn ?? 600 // 10 min recommended by OIDC spec
  const exp = overrides?.exp ?? (iat + expiresIn)
  const customClaims = opts.customJwtClaims
    ? await opts.customJwtClaims(user, scopes)
    : {};

  // Add userinfo endpoint to tokens with openid scope
  const jwtPluginOptions = getJwtPlugin(ctx.context).options

  // Sign token
  return signJwt(
    ctx, {
      ...customClaims,
      sub: user.id.toString(),
      aud: typeof audience === 'string'
        ? audience
        : audience?.length === 1 ? audience.at(0) : audience,
      azp: clientId,
      scope: scopes.join(" "),
      sid: sessionId,
      iss:
        jwtPluginOptions?.jwt?.issuer ??
        ctx.context.baseURL,
      iat,
      exp,
    },
    jwtPluginOptions, 
  )
}

// Note this function is used for both /userinfo and IdToken Creation
// To separate functionality, see createIdToken function and /userinfo endpoint
// https://openid.net/specs/openid-connect-core-1_0.html#NormalClaims
export function userNormalClaims(user: User, scopes: string[]) {
  const name = user.name.split(" ").filter((v) => v !== " ")
  const profile = {
    name: user.name ?? undefined,
    picture: user.image ?? undefined,
    given_name: name.length > 1 ? name.slice(0,-1).join(" ") : undefined,
    family_name: name.length > 1 ? name.at(-1) : undefined
  };
  const email = {
    email: user.email ?? undefined,
    email_verified: user.emailVerified ?? false,
  };

  return {
    sub: user.id ?? undefined,
    ...(scopes.includes("profile") ? profile : {}),
    ...(scopes.includes("email") ? email : {}),
  }
}

/**
 * Creates a user id token in code_authorization with scope of 'openid'
 * and hybrid/implicit (not yet implemented) flows
 */
async function createIdToken(
  ctx: GenericEndpointContext,
  opts: OIDCOptions,
  user: User,
  clientId: string,
  scopes: string[],
  nonce?: string,
) {
  const now = Date.now()
  const iat = Math.floor(now / 1000)
  const expiresIn = 60 * 60 * 10 // 10 hour id token lifetime
  const exp = iat + expiresIn
  const userClaims = userNormalClaims(user, scopes)
  const authTime =  Math.floor((ctx.context.session?.session.createdAt.getTime() ?? now) / 1000)
  // TODO: this should be validated against the login process
  // - bronze : password only
  // - silver : mfa
  const acr = "urn:mace:incommon:iap:bronze"

  const customClaims = opts.customIdTokenClaims
    ? await opts.customIdTokenClaims(user, scopes)
    : {};

  const jwtPluginOptions = getJwtPlugin(ctx.context).options
  return await signJwt(
    ctx, {
      ...customClaims,
      ...userClaims,
      auth_time: authTime,
      acr,
      iss:
        jwtPluginOptions?.jwt?.issuer ??
        ctx.context.baseURL,
      sub: user.id,
      aud: clientId,
      nonce,
      iat,
      exp,
    },
    jwtPluginOptions,
  )
}

/**
 * Encodes a refresh token for a client
 */
async function encodeRefreshToken(
  opts: OIDCOptions,
  token: string,
  session?: (Omit<Session, 'token'> & { token?: string } | null),
) {
  if (opts.encodeRefreshToken && !opts.decodeRefreshToken) {
    throw new APIError("INTERNAL_SERVER_ERROR", {
      message: 'decodeRefreshToken should be defined'
    })
  }

  return opts.encodeRefreshToken
    ? opts.encodeRefreshToken(token, session ?? undefined)
    : token
}

/**
 * Decodes a refresh token for a client
 */
async function decodeRefreshToken(
  opts: OIDCOptions,
  token: string,
) {
  if (opts.decodeRefreshToken && !opts.encodeRefreshToken) {
    throw new APIError("INTERNAL_SERVER_ERROR", {
      message: 'encodeRefreshToken should be defined'
    })
  }

  return opts.decodeRefreshToken
    ? opts.decodeRefreshToken(token)
    : { token }
}

async function createOpaqueAccessToken(
  ctx: GenericEndpointContext,
  opts: OIDCOptions,
  clientId: string,
  scopes: string[],
  payload: JWTPayload,
) {
  const now = Date.now()
  const iat = payload.iat ?? Math.floor(now / 1000)
  const exp = payload.iat ?? (iat + (opts.accessTokenExpiresIn ?? 600))
  const token = generateRandomString(32, "A-Z", "a-z")
  await ctx.context.adapter.create({
    model: opts.schema?.oauthAccessToken?.modelName ?? "oauthAccessToken",
    data: {
      token,
      clientId,
      sessionId: payload.sid,
      scope: scopes.join(" "),
      createdAt: new Date(now),
      expiresAt: new Date(exp * 1000),
    },
  })
  return token
}

async function createUserTokens(
  ctx: GenericEndpointContext,
  opts: OIDCOptions,
  client: SchemaClient,
  scopes: string[],
  user: User,
  /* if provided update session, if not create session */
  _session?: {
    sessionId?: string,
    sessionToken?: string,
  },
  nonce?: string,
) {
  const refreshToken = scopes.includes("offline_access")
    ? generateRandomString(32, "A-Z", "a-z")
    : undefined;
  const now = Date.now()
  const iat = Math.floor(now / 1000)
  const exp = iat + (opts.accessTokenExpiresIn ?? 600)
  const accessTokenExpiresAt = new Date(exp * 1000)
  const refreshTokenExpiresAt = refreshToken
    ? new Date((iat + (opts.refreshTokenExpiresIn ?? 2592000)) * 1000)
    : undefined;
  const session: (Omit<Session, 'token'> & { token?: string}) | null = _session?.sessionId
    ? await ctx.context.internalAdapter.updateSessionById(
        _session.sessionId, {
          token: refreshToken, // New refresh token after each use
          updatedAt: new Date(now),
          expiresAt: refreshTokenExpiresAt ?? accessTokenExpiresAt,
        },
        ctx,
      )
    : _session?.sessionToken
      ? await ctx.context.internalAdapter.updateSession(
            _session.sessionToken, {
              token: refreshToken, // New refresh token after each use
              updatedAt: new Date(now),
              expiresAt: refreshTokenExpiresAt ?? accessTokenExpiresAt,
            },
            ctx,
          )
      : await ctx.context.internalAdapter.createSession(
          user.id,
          ctx,
          undefined, {
            clientId: client.clientId,
            scopes: scopes.join(","),
            token: refreshToken,
            createdAt: new Date(now),
            updatedAt: new Date(now),
            expiresAt: refreshTokenExpiresAt ?? accessTokenExpiresAt,
          },
          true
        )

  if (!session) {
    throw new APIError("INTERNAL_SERVER_ERROR", {
      error: "invalid_session",
      error_description: "unable to update/create user session"
    })
  }
    
  // Ensure no refresh data is used
  if (session?.token) {
    delete session.token
  }

  const jwtPluginOptions = getJwtPlugin(ctx.context).options
  // Check requested audience if sent as the resource parameter
  let _aud: string | string[] | undefined = ctx.body.resource
  const audience = typeof _aud === 'string' ? [_aud] : _aud
  if (scopes.includes('openid')) {
    audience?.push(`${ctx.context.baseURL}/oauth2/userinfo`)
  }
  if (audience) {
    const validAudiences = [
      jwtPluginOptions?.jwt?.audience,
      scopes?.includes('openid') ? `${ctx.context.baseURL}/oauth2/userinfo` : undefined,
    ].filter((v) => v?.length)
    for (const aud of audience) {
      if (!validAudiences.includes(aud)) {
        throw new APIError("BAD_REQUEST", {
          error_description: "requested resource invalid",
          error: "invalid_request",
        });
      }
    }
  }

  // Sign jwt and refresh tokens in parallel
  const [accessToken, sessionRefresh, idToken] = await Promise.allSettled([
    audience ?
      signUserJwt(
        ctx,
        opts,
        user,
        client.clientId,
        audience,
        scopes,
        session.id, {
          iat,
          exp,
        },
      )
      : createOpaqueAccessToken(
        ctx,
        opts,
        client.clientId,
        scopes, {
          iat,
          exp,
          sid: session.id,
        }
      ),
    refreshToken
      ? encodeRefreshToken(
          opts,
          refreshToken,
          session,
        )
      : undefined,
    scopes.includes("openid")
      ? createIdToken(
          ctx,
          opts,
          user,
          client.clientId,
          scopes,
          nonce,
        )
      : undefined,
  ]).then((val) => val.map((v) => v.status === 'fulfilled' ? v.value : undefined))

  return ctx.json(
    {
      access_token: accessToken,
      expires_in: opts.accessTokenExpiresIn,
      expires_at: accessTokenExpiresAt,
      token_type: "Bearer",
      refresh_token: sessionRefresh,
      scope: scopes.join(" "),
      id_token: idToken,
    },
    {
      headers: {
        "Cache-Control": "no-store",
        Pragma: "no-cache",
      },
    },
  );
}

function basicToClientCredentials(authorization: string) {
  if (authorization.startsWith('Basic ')) {
    const encoded = authorization.replace("Basic ", "");
    const decoded = new TextDecoder().decode(base64.decode(encoded));
    if (!decoded.includes(":")) {
      throw new APIError("BAD_REQUEST", {
        error_description: "invalid authorization header format",
        error: "invalid_client",
      });
    }
    const [id, secret] = decoded.split(":");
    if (!id || !secret) {
      throw new APIError("BAD_REQUEST", {
        error_description: "invalid authorization header format",
        error: "invalid_client",
      });
    }
    return {
      client_id: id,
      client_secret: secret,
    }
  }
}

async function validateClientCredentials(
  ctx: GenericEndpointContext,
  options: OIDCOptions,
  clientId: string,
  clientSecret?: string, // optional because required if client is confidential or this value is defined
  scopes?: string[] // checks requested scopes against allowed scopes
) {
  const client: SchemaClient | null = await ctx.context.adapter
  .findOne({
    model: options.schema?.oauthClient?.modelName ?? "oauthClient",
    where: [{ field: "clientId", value: clientId.toString() }],
  })
  if (!client) {
    throw new APIError("BAD_REQUEST", {
      error_description: "missing client",
      error: "invalid_client",
    });
  }
  if (client.disabled) {
    throw new APIError("BAD_REQUEST", {
      error_description: "client is disabled",
      error: "invalid_client",
    });
  }

  // Require secret for confidential clients
  if (!client.public && !clientSecret?.toString()) {
    throw new APIError("BAD_REQUEST", {
      error_description: "client secret must be provided",
      error: "invalid_client",
    });
  }

  // Compare Secrets when secret is provided
  if (
    clientSecret?.toString() &&
    client.clientSecret !== clientSecret?.toString()
  ) {
    throw new APIError("UNAUTHORIZED", {
      error_description: "invalid client_secret",
      error: "invalid_client",
    });
  }

  // If allowed scopes if set, must check against scopes
  if (client.allowedScopes) {
    if (!scopes) {
      throw new APIError("NOT_ACCEPTABLE", {
        message: "must request a scope"
      });
    }
    for (const sc of scopes) {
      if (!client.allowedScopes.includes(sc)) {
        throw new APIError("NOT_ACCEPTABLE", {
          message: `client does not allow scope ${sc}`
        });
      }
    }
  }

  return client
}

/** Checks verification value */
async function checkVerificationValue(
  ctx: GenericEndpointContext,
  code: string,
  client_id: string,
) {
  const verification =
    await ctx.context.internalAdapter.findVerificationValue(
      code,
    ).then((val) => {
      if (!val) return null
      return {
        ...val,
        value: val?.value  ? JSON.parse(val?.value) : undefined
      } as Omit<Verification, 'value'> & { value?: VerificationValue }
    });
  const verificationValue = verification?.value

  if (!verification) {
    throw new APIError("UNAUTHORIZED", {
      error_description: "Invalid code",
      error: "invalid_request",
    });
  }

  // Delete used code
  if (verification?.id) {
    await ctx.context.internalAdapter.deleteVerificationValue(
      verification.id,
    );
  }

  // Check verification
  if (
    !verification.expiresAt ||
    verification.expiresAt < new Date()
  ) {
    throw new APIError("BAD_REQUEST", {
      error_description: "code expired",
      error: "invalid_grant",
    });
  }

  // Check verification value
  if (!verificationValue) {
    throw new APIError("UNAUTHORIZED", {
      error_description: "missing verification value content",
      error: "invalid_verification",
    });
  }
  if (verificationValue.clientId !== client_id) {
    throw new APIError("UNAUTHORIZED", {
      error_description: "invalid client_id",
      error: "invalid_client",
    });
  }
  if (!verificationValue.userId) {
    throw new APIError("BAD_REQUEST", {
      error_description: "missing user_id on challenge",
      error: "invalid_user",
    });
  }

  return verificationValue
}

/**
 * Obtains new Session Jwt and Refresh Tokens using a code
 */
async function handleAuthorizationCodeGrant(
  ctx: GenericEndpointContext,
  opts: OIDCOptions,
  body: any,
) {
  let {
    client_id,
    client_secret,
    code,
    code_verifier,
  }: {
    client_id?: string,
    client_secret?: string,
    code?: string,
    code_verifier?: string,
  } = body;
  const authorization =
    ctx.request?.headers.get("authorization") || null;

  // Convert basic authorization
  if (authorization?.startsWith('Basic ')) {
    const res = basicToClientCredentials(authorization)
    client_id = res?.client_id
    client_secret = res?.client_secret
  }

  if (!client_id) {
    throw new APIError("BAD_REQUEST", {
      error_description: "client_id is required",
      error: "invalid_request",
    });
  }
  if (!code) {
    throw new APIError("BAD_REQUEST", {
      error_description: "code is required",
      error: "invalid_request",
    });
  }

  const isAuthCodeWithSecret = client_id && client_secret
  const isAuthCodeWithPkce = client_id && code && code_verifier

  if (!(isAuthCodeWithPkce || isAuthCodeWithSecret)) {
    throw new APIError("BAD_REQUEST", {
      error_description: "Missing a required credential value for authorization_code grant",
      error: "invalid_request",
    });
  }

  /** Get and check Verification Value */
  const verificationValue = await checkVerificationValue(ctx, code, client_id)
  const scopes = verificationValue.scopes?.split(" ")

  /** Verify Client */
  const client = await validateClientCredentials(
    ctx,
    opts,
    client_id,
    client_secret,
    scopes,
  )

  /** Check challenge */
  const challenge = code_verifier && verificationValue.codeChallengeMethod?.toLowerCase() === "s256"
    ? await createHash("SHA-256", "base64urlnopad").digest(
        code_verifier,
      )
    : undefined
  if (
    // AuthCodeWithSecret - Required if sent
    isAuthCodeWithSecret && 
    (challenge || verificationValue?.codeChallenge) &&
    challenge !== verificationValue.codeChallenge
  ) {
    throw new APIError("UNAUTHORIZED", {
      error_description: "code verification failed",
      error: "invalid_request",
    });
  }
  if (
    // AuthCodeWithPkce - Always required
    isAuthCodeWithPkce &&
    challenge !== verificationValue.codeChallenge
  ) {
    throw new APIError("UNAUTHORIZED", {
      error_description: "code verification failed",
      error: "invalid_request",
    });
  }

  /** Get user */
  if (!verificationValue.userId) {
    throw new APIError("BAD_REQUEST", {
      error_description: "missing user, user may have been deleted",
      error: "invalid_user",
    });
  }
  const user = await ctx.context.internalAdapter.findUserById(verificationValue.userId)
  if (!user) {
    throw new APIError("BAD_REQUEST", {
      error_description: "missing user, user may have been deleted",
      error: "invalid_user",
    });
  }

  return createUserTokens(
    ctx,
    opts,
    client,
    verificationValue.scopes?.split(" ") ?? [],
    user,
    undefined,
    verificationValue.nonce,
  )
}

/**
 * Grant that allows direct access to an API using the application's credentials
 * This grant is for M2M so the concept of a user id does not exist on the token.
 * 
 * MUST follow https://datatracker.ietf.org/doc/html/rfc6749#section-4.4
 */
async function handleClientCredentialsGrant(
  ctx: GenericEndpointContext,
  opts: OIDCOptions,
  body: any,
) {
  let {
    client_id,
    client_secret,
    scope,
    resource,
  }: {
    client_id?: string
    client_secret?: string
    scope?: string
    resource?: string
  } = body;
  const authorization =
    ctx.request?.headers.get("authorization") || null;

  // Convert basic authorization
  if (authorization?.startsWith('Basic ')) {
    const res = basicToClientCredentials(authorization)
    client_id = res?.client_id
    client_secret = res?.client_secret
  }

  if (!client_id) {
    throw new APIError("BAD_REQUEST", {
      error_description: "Missing required client_id",
      error: "invalid_grant",
    });
  }
  if (!client_secret) {
    throw new APIError("BAD_REQUEST", {
      error_description: "Missing a required client_secret",
      error: "invalid_grant",
    });
  }
  if (!scope) scope = opts.clientCredentialGrantDefaultScopes?.join(" ")
  if (!scope) {
    throw new APIError("BAD_REQUEST", {
      error_description: "Missing required scope",
      error: "invalid_scope",
    });
  }

  // Check if requested resource (aka audience is the same)
  const jwtPluginOptions = getJwtPlugin(ctx.context).options
  if (resource && 
    !(resource === jwtPluginOptions?.jwt?.audience ||
      resource === ctx.context.options.baseURL)
  ) {
    throw new APIError("BAD_REQUEST", {
      error_description: "requested resource invalid",
      error: "invalid_request",
    });
  }

  // OIDC scopes should not be requestable (code authorization grant should be used)
  const requestedScopes = scope.split(" ")
  const invalidScopes = ["openid", "profile", "email", "offline_access"]
  for (const sc of requestedScopes) {
    if (invalidScopes.includes(sc)) {
      throw new APIError("NOT_ACCEPTABLE", {
        message: `unable to satisfy scope ${sc}`
      })
    }
    if (opts.scopes && !opts.scopes.includes(sc)) {
      throw new APIError("NOT_ACCEPTABLE", {
        message: `invalid scope ${sc}`
      })
    }
  }

  await validateClientCredentials(
    ctx,
    opts,
    client_id,
    client_secret,
    requestedScopes,
  )

  const now = Date.now();
  const iat = Math.floor(now / 1000);
  const expiresIn = opts.m2mAccessTokenExpiresIn ?? 3600 // 1 hour
  const exp = iat + expiresIn

  const accessToken = resource
    ? await signJwt(
        ctx, {
          aud: resource,
          azp: client_id,
          scope: requestedScopes.join(" "),
          iss:
            jwtPluginOptions?.jwt?.issuer ??
            ctx.context.baseURL,
          iat,
          exp,
        },
        jwtPluginOptions,
      )
    : await createOpaqueAccessToken(
        ctx,
        opts,
        client_id,
        requestedScopes, {
          iat,
          exp,
        }
      )

  return ctx.json(
    {
      access_token: accessToken,
      expires_in: expiresIn,
      expires_at: new Date(exp * 1000),
      token_type: "Bearer",
      scope: requestedScopes.join(" "),
    },
    {
      headers: {
        "Cache-Control": "no-store",
        Pragma: "no-cache",
      },
    },
  );
}

/**
 * Obtains new Session Jwt and Refresh Tokens using a refresh token
 * 
 * Refresh tokens will only allow the same or lesser scopes as the initial authorize request.
 * To add scopes, you must restart the authorize process again.
 */
async function handleRefreshTokenGrant(
  ctx: GenericEndpointContext,
  opts: OIDCOptions,
  body: any,
) {
  let {
    client_id,
    client_secret,
    refresh_token,
    scope,
  }: {
    client_id?: string
    client_secret?: string
    refresh_token?: string
    scope?: string
  } = body;

  const authorization =
    ctx.request?.headers.get("authorization") || null;

  // Convert basic authorization
  if (authorization?.startsWith('Basic ')) {
    const res = basicToClientCredentials(authorization)
    client_id = res?.client_id
    client_secret = res?.client_secret
  }

  if (!client_id) {
    throw new APIError("BAD_REQUEST", {
      error_description: "Missing required client_id",
      error: "invalid_grant",
    });
  }

  if (!refresh_token) {
    throw new APIError("BAD_REQUEST", {
      error_description: "Missing a required refresh_token for refresh_token grant",
      error: "invalid_grant",
    });
  }
  const decodedRefresh = await decodeRefreshToken(
    opts,
    refresh_token,
  )

  const session = decodedRefresh.sessionId
    ? await ctx.context.internalAdapter.findSessionById(decodedRefresh.sessionId)
    : await ctx.context.internalAdapter.findSession(decodedRefresh.token)
  const scopes = (session?.session.scopes as string)?.split(",")
  const requestedScopes = scope?.split(" ")
  if (requestedScopes) {
    for (const requestedScope of requestedScopes) {
      if (!scopes.includes(requestedScope)) {
        throw new APIError("NOT_ACCEPTABLE", {
          message: `unable to issue scope ${requestedScope}`
        });
      }
    }
  }

  const client = await validateClientCredentials(
    ctx,
    opts,
    client_id,
    client_secret, // Optional for refresh_grant but required on confidential clients
    requestedScopes ?? scopes,
  )

  // Check token
  if (!session) {
    throw new APIError("BAD_REQUEST", {
      error_description: "invalid refresh token",
      error: "invalid_grant",
    });
  }
  if (session.session.clientId !== client_id?.toString()) {
    throw new APIError("BAD_REQUEST", {
      error_description: "invalid client_id",
      error: "invalid_client",
    });
  }
  if (session.session.expiresAt < new Date()) {
    throw new APIError("BAD_REQUEST", {
      error_description: "refresh token expired",
      error: "invalid_grant",
    });
  }

  // Generate new tokens
  return createUserTokens(
    ctx,
    opts,
    client,
    requestedScopes ?? scopes,
    session.user, {
      sessionId: decodedRefresh.sessionId,
      sessionToken: decodedRefresh.token,
    },
  )
}

