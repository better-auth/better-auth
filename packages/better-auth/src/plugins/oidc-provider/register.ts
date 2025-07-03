import { GenericEndpointContext } from "../../types"
import {
  OauthClient,
  OIDCOptions,
  SchemaClient,
} from "./types"
import {
  APIError,
  getSessionFromCtx,
} from "../../api"
import { generateRandomString } from "../../crypto"

export async function registerEndpoint(
  ctx: GenericEndpointContext,
  opts: OIDCOptions,
) {
  // Check if registration endpoint is enabled
  if (!opts.allowDynamicClientRegistration) {
    throw new APIError("FORBIDDEN", {
      error: "access_denied",
      error_description:
        "Client registration is disabled",
    });
  }

  const body = ctx.body;
  const session = await getSessionFromCtx(ctx);

  // Check authorization
  if (!(session || opts.allowUnauthenticatedClientRegistration)) {
    throw new APIError("UNAUTHORIZED", {
      error: "invalid_token",
      error_description:
        "Authentication required for client registration",
    });
  }
  // Determine whether registration request for public client
  // https://datatracker.ietf.org/doc/html/rfc7591#section-2
  const isPublic = body.token_endpoint_auth_method === 'none'

  // Check unauthenticated user is requesting a confidential client
  if (!session && !isPublic) {
    throw new APIError("UNAUTHORIZED", {
      error: "invalid_request",
      error_description:
        "Authentication required for confidential client registration",
    });
  }

  // Check value of type, if sent, matches isPublic
  if (body.type) {
    if (isPublic && !(body.type === 'native' || body.type === 'user-agent-based')) {
      throw new APIError("BAD_REQUEST", {
        error: "invalid_client_metadata",
        error_description:
          `Type be 'native' or 'user-agent-based' for public applications`,
      });
    }
    else if (!isPublic && !(body.type === 'web')) {
      throw new APIError("BAD_REQUEST", {
        error: "invalid_client_metadata",
        error_description:
          `Type be 'web' for confidential applications`,
      });
    }
  }

  // Validate redirect URIs for redirect-based flows
  if (
    (!body.grant_types ||
      body.grant_types.includes("authorization_code") ||
      body.grant_types.includes("implicit")) &&
    (!body.redirect_uris || body.redirect_uris.length === 0)
  ) {
    throw new APIError("BAD_REQUEST", {
      error: "invalid_redirect_uri",
      error_description:
        "Redirect URIs are required for authorization_code and implicit grant types",
    });
  }

  // Validate correlation between grant_types and response_types
  const grantTypes = body.grant_types ?? ["authorization_code"]
  const responseTypes = body.response_types ?? ["code"]
  if (
    grantTypes.includes("authorization_code") &&
    !responseTypes.includes("code")
  ) {
    throw new APIError("BAD_REQUEST", {
      error: "invalid_client_metadata",
      error_description:
        "When 'authorization_code' grant type is used, 'code' response type must be included",
    });
  }
  if (
    grantTypes.includes("implicit") &&
    !responseTypes.includes("token")
  ) {
    throw new APIError("BAD_REQUEST", {
      error: "invalid_client_metadata",
      error_description:
        "When 'implicit' grant type is used, 'token' response type must be included",
    });
  }

  // Generate clientId and clientSecret based on its type
  const clientId =
    opts.generateClientId?.() ||
    generateRandomString(32, "a-z", "A-Z");
  const clientSecret = isPublic
    ? undefined
    : (
      opts.generateClientSecret?.() ||
      generateRandomString(32, "a-z", "A-Z")
    );

  // Check requested application scopes
  const requestedScopes = (body?.scope as string | undefined)?.split(" ").filter((v) => v.length)
  let scope: string | undefined
  if (!requestedScopes?.length) {
    scope = opts.newlyRegisteredClientScopes?.join(" ")
  } else {
    const allowedScopes = opts.newlyRegisteredClientScopes
    if (allowedScopes) {
      for (const requestedScope of requestedScopes) {
        if (!allowedScopes.includes(requestedScope)) {
          throw new APIError("BAD_REQUEST", {
            error: "invalid_scope",
            error_description: `cannot request scope ${requestedScope}`,
          })
        }
      }
    }
    scope = requestedScopes.join(" ")
  }
  console.log(scope)

  // Create the client with the existing schema
  const schema = oauthToSchema({
    ...(body ?? {}) as Partial<OauthClient>,
    // Dynamic registration should not have disabled defined
    disabled: undefined,
    // Jwks unsupported
    jwks: undefined,
    jwks_uri: undefined,
    // Required if client secret is issued
    client_secret_expires_at: clientSecret
      ? (body?.client_secret_expires_at ?? 0)
      : undefined,
    // Override
    client_id: clientId,
    client_secret: clientSecret,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    scope,
    public: isPublic,
    user_id: session?.session.userId,
  }, true)
  const client = await ctx.context.adapter.create({
    model: opts.schema?.oauthClient?.modelName ?? 'oauthApplication',
    data: {
      ...schema,
      contacts: schema.contacts?.join(","),
      grantTypes: schema.grantTypes?.join(","),
      responseTypes: schema.responseTypes?.join(","),
      redirectUris: schema.redirectUris?.join(","),
    }
  }).then((res: Record<string, string | null>) => {
    return {
      ...res,
      contacts: res.contacts?.split(",") ?? undefined,
      grantTypes: res.grantTypes?.split(",") ?? undefined,
      responseTypes: res.responseTypes?.split(",") ?? undefined,
      redirectUris: res?.redirectUris?.split(",") ?? undefined,
    } as SchemaClient
  });
  // Format the response according to RFC7591
  return ctx.json(
    schemaToOauth(client, true),
    {
      status: 201,
      headers: {
        "Cache-Control": "no-store",
        Pragma: "no-cache",
      },
    },
  );
}

/**
 * Converts an OAuth 2.0 Dynamic Client Schema to a Database Schema
 * 
 * @param input 
 * @param cleaned - determines if the `rest` is converted into metadata
 * @returns 
 */
export function oauthToSchema(input: OauthClient, cleaned = true): SchemaClient {
  const {
    // Important Fields
    client_id: clientId,
    client_secret: clientSecret,
    client_secret_expires_at: _expiresAt,
    scope: _scope,
    // Recommended client data
    user_id: userId,
    client_id_issued_at: _createdAt,
    // UI Metadata
    client_name: name,
    client_uri: uri,
    logo_uri: icon,
    contacts,
    tos_uri: tos,
    policy_uri: policy,
    // Jwks (only one can be used)
    jwks,
    jwks_uri: jwksUri,
    // User Software Identifiers
    software_id: softwareId,
    software_version: softwareVersion,
    software_statement: softwareStatement,
    // Authentication Metadata
    redirect_uris: redirectUris,
    token_endpoint_auth_method: tokenEndpointAuthMethod,
    grant_types: grantTypes,
    response_types: responseTypes,
    // RFC6749 Spec
    public: _public,
    type,
    // Not Part of RFC7591 Spec
    disabled,
    // All other metadata
    ...rest
  } = input

  // Type conversions
  const expiresAt = _expiresAt ? new Date(_expiresAt * 1000) : undefined
  const createdAt = _createdAt ? new Date(_createdAt * 1000) : undefined
  const allowedScopes = _scope?.split(" ")

  return {
    // Important Fields
    clientId,
    clientSecret,
    disabled,
    allowedScopes,
    // Recommended client data
    userId,
    createdAt,
    expiresAt,
    // UI Metadata
    name,
    uri,
    icon,
    contacts,
    tos,
    policy,
    // User Software Identifiers
    softwareId,
    softwareVersion,
    softwareStatement,
    // Authentication Metadata
    redirectUris,
    tokenEndpointAuthMethod,
    grantTypes,
    responseTypes,
    // RFC6749 Spec
    public: _public,
    type,
    // All other metadata
    metadata: cleaned ? undefined : JSON.stringify(rest)
  }
}

/**
 * Converts a Database Schema to an OAuth 2.0 Dynamic Client Schema
 * @param input 
 * @param cleaned - determines if the output has only Oauth 2.0 compatible data
 * @returns 
 */
export function schemaToOauth(input: SchemaClient, cleaned = true): OauthClient {
  const {
    // Important Fields
    clientId,
    clientSecret,
    disabled,
    allowedScopes,
    // Recommended client data
    userId,
    createdAt,
    updatedAt,
    expiresAt,
    // UI Metadata
    name,
    uri,
    icon,
    contacts,
    tos,
    policy,
    // User Software Identifiers
    softwareId,
    softwareVersion,
    softwareStatement,
    // Authentication Metadata
    redirectUris,
    tokenEndpointAuthMethod,
    grantTypes,
    responseTypes,
    // RFC6749 Spec
    public: _public,
    type,
    // All other metadata
    metadata, // in JSON format
  } = input

  // Type conversions
  const _expiresAt = expiresAt ? Math.round(expiresAt.getTime() / 1000) : undefined
  const _createdAt = createdAt ? Math.round(createdAt.getTime() / 1000) : undefined
  const _allowedScopes = allowedScopes?.join(" ")
  const rest = metadata ? JSON.parse(metadata) : undefined

  return {
    // Important Fields
    client_id: clientId,
    client_secret: clientSecret,
    client_secret_expires_at: _expiresAt ?? 0,
    scope: _allowedScopes,
    // Recommended client data
    user_id: userId,
    client_id_issued_at: _createdAt,
    // UI Metadata
    client_name: name,
    client_uri: uri,
    logo_uri: icon,
    contacts,
    tos_uri: tos,
    policy_uri: policy,
    // Jwks (only one can be used)
    // jwks, // Not Stored
    // jwks_uri: jwksUri, // Not Stored
    // User Software Identifiers
    software_id: softwareId,
    software_version: softwareVersion,
    software_statement: softwareStatement,
    // Authentication Metadata
    redirect_uris: redirectUris,
    token_endpoint_auth_method: tokenEndpointAuthMethod,
    grant_types: grantTypes,
    response_types: responseTypes,
    // RFC6749 Spec
    public: _public,
    type,
    // Not Part of RFC7591 Spec
    disabled,
    // All other metadata
    ...(cleaned ? undefined: rest)
  }
}
