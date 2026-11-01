import type { JWTVerifyOptions } from "jose";
import { jwtVerify } from "jose";
import type { GenericEndpointContext } from "../types";
import type {
	OAuthIdTokenConfig,
	OAuthProvider,
	ProviderOptions,
} from "./oauth-provider";

/**
 * Clock skew allowed on `exp`, `nbf`, and `iat`, matching openid-client and oauth4webapi.
 */
const ID_TOKEN_CLOCK_TOLERANCE_SECONDS = 30;

/**
 * Claims every ID token must contain.
 *
 * @see https://openid.net/specs/openid-connect-core-1_0.html#IDToken
 */
const ID_TOKEN_REQUIRED_CLAIMS = ["iss", "sub", "aud", "exp", "iat"];

/**
 * Builds the jose options shared by every ID token verifier, so the required
 * claims and clock tolerance stay the same across providers. Algorithms come
 * from the caller's trusted configuration, never from the token header.
 *
 * @internal
 */
export function getIdTokenVerifyOptions(options: {
	issuer?: (string | string[]) | undefined;
	audience: string | string[];
	algorithms?: string[] | undefined;
	maxTokenAge?: (string | number) | undefined;
}) {
	return {
		issuer: options.issuer,
		audience: options.audience,
		algorithms: options.algorithms,
		maxTokenAge: options.maxTokenAge,
		requiredClaims: ID_TOKEN_REQUIRED_CLAIMS,
		clockTolerance: ID_TOKEN_CLOCK_TOLERANCE_SECONDS,
	} satisfies JWTVerifyOptions;
}

type ProviderWithIdTokenConfig = Pick<
	OAuthProvider,
	"id" | "idToken" | "options"
>;

async function sha256Hex(value: string) {
	const data = new TextEncoder().encode(value);
	const digest = await crypto.subtle.digest("SHA-256", data);
	return Array.from(new Uint8Array(digest))
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

async function nonceMatches(
	claimNonce: unknown,
	nonce: string,
	comparison: "exact" | "exact-or-sha256" = "exact",
) {
	if (typeof claimNonce !== "string") {
		return false;
	}
	if (claimNonce === nonce) {
		return true;
	}
	if (comparison === "exact-or-sha256") {
		return claimNonce === (await sha256Hex(nonce));
	}
	return false;
}

/**
 * Verifies an ID token's signature and claims against a verification config,
 * and its `nonce` when one is expected. Throws when the token is not valid.
 *
 * @see https://openid.net/specs/openid-connect-core-1_0.html#IDTokenValidation
 * @internal
 */
export async function verifyIdToken(
	token: string,
	config: Extract<OAuthIdTokenConfig, { jwks: unknown }>,
	nonce?: string,
) {
	// An empty audience would skip the audience check entirely.
	if (![config.audience].flat().some(Boolean)) {
		throw new Error("ID token audience is not configured");
	}
	// `kid` is optional in JWS: a JWKS resolver can still select a key by algorithm, so
	// key selection is left to config.jwks.
	const verified = await jwtVerify(
		token,
		config.jwks,
		getIdTokenVerifyOptions(config),
	);
	if (
		nonce &&
		!(await nonceMatches(verified.payload.nonce, nonce, config.nonceComparison))
	) {
		throw new Error("ID token nonce does not match");
	}
	// Provider-specific claim check on the now-verified payload (e.g. Google's
	// hosted-domain `hd`). Standard checks have already passed, so a token that
	// fails here is authentic but does not meet the provider's extra constraint.
	if (config.verifyClaims && !config.verifyClaims(verified.payload)) {
		throw new Error("ID token claims were rejected");
	}
	return verified;
}

/**
 * Whether a provider can verify a client-submitted id_token.
 *
 * A provider supports id_token sign-in when it declares an {@link OAuthProvider.idToken}
 * verification config, or when the integrator supplies a `verifyIdToken` override on the
 * provider options. A provider whose options set `disableIdTokenSignIn`, or that declares
 * neither, rejects the client id_token sign-in path with `ID_TOKEN_NOT_SUPPORTED`.
 */
export function supportsIdTokenSignIn(provider: ProviderWithIdTokenConfig) {
	const options = (provider.options ?? {}) as Partial<ProviderOptions>;
	if (options.disableIdTokenSignIn) {
		return false;
	}
	return Boolean(provider.idToken || options.verifyIdToken);
}

/**
 * Verify a client-submitted id_token against a provider's verification config.
 *
 * This is the single id_token verifier for every social provider. Providers no longer
 * implement their own boolean `verifyIdToken`; they declare an {@link OAuthProvider.idToken}
 * config and this function performs the cryptographic check. The contract is fail-closed: a
 * provider without a config (and without an integrator `verifyIdToken` override) returns
 * `false`, so a forged token can never be accepted by omission.
 *
 * @returns `true` only when the token is authentic for the provider.
 */
export async function verifyProviderIdToken(
	provider: ProviderWithIdTokenConfig,
	token: string,
	nonce?: string,
	ctx?: GenericEndpointContext,
): Promise<boolean> {
	const options = (provider.options ?? {}) as Partial<ProviderOptions>;
	if (options.disableIdTokenSignIn) {
		return false;
	}
	// Every verification path is fail-closed: a throw from the integrator override, a custom
	// remote verifier, the JWKS resolver, or signature checking resolves to `false` instead of
	// escaping to the caller as a server error.
	try {
		if (options.verifyIdToken) {
			return await options.verifyIdToken(token, nonce, ctx);
		}
		const config = provider.idToken;
		if (!config) {
			return false;
		}
		if ("verify" in config) {
			return await config.verify(token, nonce, ctx);
		}
		// Opaque (non-JWS) tokens carry no signature to check. They are accepted only when the
		// provider opts in, in which case getUserInfo resolves identity from the access token via
		// the provider's userinfo endpoint, which validates it (e.g. Facebook Graph access tokens).
		// An expected `nonce` is not enforced here: an opaque token carries no `nonce` claim, and the
		// access-token-backed userinfo exchange (not the token itself) is the identity source.
		if (token.split(".").length !== 3) {
			return config.allowOpaqueToken === true;
		}
		await verifyIdToken(token, config, nonce);
		return true;
	} catch {
		return false;
	}
}
