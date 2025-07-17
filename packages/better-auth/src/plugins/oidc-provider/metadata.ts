import { GenericEndpointContext } from "../../types";
import { getJwtPlugin } from "../jwt";
import { authServerMetadata } from "../mcp/metadata";
import { OIDCMetadata, OIDCOptions } from "./types";

export function oidcMetadata(
  ctx: GenericEndpointContext,
  opts: OIDCOptions & { claims?: string[] },
) {
  const baseURL = ctx.context.baseURL;
  const jwtPluginOptions = getJwtPlugin(ctx.context).options;
  const authMetadata = authServerMetadata(
    ctx,
    jwtPluginOptions,
    opts.advertisedMetadata?.scopes_supported
      ?? opts.scopes,
  )
  const metadata: OIDCMetadata = {
    ...authMetadata,
    claims_supported: 
      opts?.advertisedMetadata?.claims_supported ??
      opts?.claims ?? [],
    userinfo_endpoint: `${baseURL}/oauth2/userinfo`,
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported:
      jwtPluginOptions?.jwks?.keyPairConfig?.alg
        ? [jwtPluginOptions?.jwks?.keyPairConfig?.alg]
        : ['EdDSA'],
    acr_values_supported: [
      "urn:mace:incommon:iap:bronze",
    ],
  };
  return metadata
}