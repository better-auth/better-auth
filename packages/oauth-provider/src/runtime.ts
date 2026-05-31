import type { GenericEndpointContext } from "@better-auth/core";
import type {
	ClientAuthStrategy,
	GrantHandler,
	OAuthContributions,
	TokenClaimInfo,
} from "./types/contributions";

/**
 * Plugin contributions aggregated once at the host's `init` and read back at
 * request time by the token endpoint, discovery, and introspection.
 *
 * Collected from every plugin's `contributes["oauth-provider"]` declaration and
 * stored under a single context key so producers and consumers share one typed
 * contract instead of parallel magic-string casts.
 */
export interface OAuthProviderRuntime {
	/** Custom grant-type handlers keyed by extension grant URI. */
	grantHandlers: Record<string, GrantHandler>;
	/** Discovery-metadata contributors, applied add-only. */
	metadataContributors: NonNullable<OAuthContributions["metadata"]>[];
	/** Token-endpoint client-authentication methods to advertise. */
	extraAuthMethods: string[];
	/** Token-claim contributors merged into minted access and ID tokens. */
	claimContributors: NonNullable<OAuthContributions["tokenClaims"]>[];
	/** Client-authentication strategies keyed by `client_assertion_type`. */
	clientAuthStrategies: Record<string, ClientAuthStrategy>;
}

const RUNTIME_KEY = "oauthProviderRuntime";

/**
 * Wraps the aggregated runtime for the plugin `init` return so it lands on the
 * shared context under {@link RUNTIME_KEY}. Keeping the key in one place lets
 * every reader go through {@link getOAuthRuntime} instead of restating it.
 *
 * The return is widened to `Record<string, unknown>` so the internal
 * `OAuthProviderRuntime` name never leaks into the plugin's emitted declaration
 * (TS4023 "cannot be named" under the dist typecheck). The input stays typed, so
 * construction is fully checked; readers recover the type via {@link getOAuthRuntime}.
 */
export function withOAuthRuntime(
	runtime: OAuthProviderRuntime,
): Record<string, unknown> {
	return { [RUNTIME_KEY]: runtime };
}

/** Reads the runtime aggregated at init, or `undefined` when nothing contributed. */
export function getOAuthRuntime(
	ctx: GenericEndpointContext,
): OAuthProviderRuntime | undefined {
	return (ctx.context as Record<string, unknown>)[RUNTIME_KEY] as
		| OAuthProviderRuntime
		| undefined;
}

/**
 * Collects extra claims from plugin-contributed `tokenClaims` contributors for
 * the given token kind. The result is merged before the consumer's
 * `customAccessTokenClaims`/`customIdTokenClaims` and never over the pinned
 * security claims set by the caller.
 */
export async function collectExtensionClaims(
	ctx: GenericEndpointContext,
	kind: "access" | "id",
	info: TokenClaimInfo,
): Promise<Record<string, unknown>> {
	const contributors = getOAuthRuntime(ctx)?.claimContributors;
	if (!contributors?.length) return {};
	const claims: Record<string, unknown> = {};
	for (const contributor of contributors) {
		const fn = contributor[kind];
		if (fn) Object.assign(claims, await fn(info));
	}
	return claims;
}
