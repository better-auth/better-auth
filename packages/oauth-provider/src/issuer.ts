import type { AuthContext, GenericEndpointContext } from "@better-auth/core";
import type { OAuthOptions, Scope } from "./types";
import { getJwtPlugin, getOAuthProviderPlugin } from "./utils";

/**
 * Normalizes the issuer URL by removing query and fragment components, which
 * RFC 8414 §2 forbids. Parsing also lowercases the scheme and host, drops a
 * default port, and resolves dot segments in the path. The result must match
 * the ID token `iss` (OpenID Connect Discovery §4.3) and the authorization
 * response `iss` (RFC 9207 §2.4) exactly.
 *
 * @returns The issuer URL without query, fragment, or trailing slash
 */
export function validateIssuerUrl(issuer: string): string {
	try {
		const url = new URL(issuer);
		url.search = "";
		url.hash = "";

		return url.toString().replace(/\/$/, "");
	} catch {
		// If URL parsing fails, return as-is
		return issuer;
	}
}

/** `jwt.issuer` when the JWT plugin sets it, otherwise the resolved base URL. */
function getConfiguredIssuer(
	context: AuthContext,
	opts: Pick<OAuthOptions<Scope[]>, "disableJwtPlugin"> | undefined,
): string {
	if (opts?.disableJwtPlugin) return context.baseURL;
	try {
		return getJwtPlugin(context).options?.jwt?.issuer ?? context.baseURL;
	} catch {
		return context.baseURL;
	}
}

/**
 * Gets the issuer identifier. Discovery, the authorization response `iss`
 * parameter, and every token and introspection response carry this value.
 */
export function getIssuer(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
): string {
	return validateIssuerUrl(getConfiguredIssuer(ctx.context, opts));
}

/**
 * The issuer identifier the provider stamps on its tokens and publishes in
 * discovery, read from the auth context. Use it as the single expected `iss`
 * of a verifier that fetches keys from a remote authorization server, where
 * RFC 9068 §4 requires an exact match. In-process checks use
 * {@link getAcceptedIssuers} instead.
 *
 * @internal
 */
export function getDiscoveryIssuer(
	context: AuthContext,
	opts:
		| Pick<OAuthOptions<Scope[]>, "disableJwtPlugin">
		| undefined = getOAuthProviderPlugin(context)?.options,
): string {
	return validateIssuerUrl(getConfiguredIssuer(context, opts));
}

/**
 * The `iss` values to accept in tokens from an issuer configured as
 * `configuredIssuer`: the normalized issuer, and the configured value when it
 * differs. Tokens issued by earlier versions carry the configured value, and
 * both strings come from the server's own configuration. Use it only for
 * checks that run in the process holding that configuration: a verifier that
 * trusts a remote `jwksUrl` must expect the normalized issuer alone.
 */
export function getIssuerForms(configuredIssuer: string): string[] {
	const issuer = validateIssuerUrl(configuredIssuer);
	return issuer === configuredIssuer ? [issuer] : [issuer, configuredIssuer];
}

/**
 * The `iss` values a verifier in this process accepts in this server's tokens,
 * as {@link getIssuerForms} describes. Reads the OAuth provider's options from
 * the context when `opts` is omitted.
 *
 * @internal
 */
export function getAcceptedIssuers(
	context: AuthContext,
	opts:
		| Pick<OAuthOptions<Scope[]>, "disableJwtPlugin">
		| undefined = getOAuthProviderPlugin(context)?.options,
): string[] {
	return getIssuerForms(getConfiguredIssuer(context, opts));
}
