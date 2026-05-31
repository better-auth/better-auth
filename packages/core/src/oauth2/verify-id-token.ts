import { decodeProtectedHeader, jwtVerify } from "jose";
import type { ProviderOptions, UpstreamProvider } from "./oauth-provider";

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
 * Whether a provider can verify a client-submitted id_token.
 *
 * A provider supports id_token sign-in when it declares an {@link UpstreamProvider.idToken}
 * verification config, or when the integrator supplies a `verifyIdToken` override on the
 * provider options. Providers without either reject the client id_token sign-in path with
 * `ID_TOKEN_NOT_SUPPORTED`.
 */
export function supportsIdTokenSignIn(provider: UpstreamProvider<any, any>) {
	const options = (provider.options ?? {}) as Partial<ProviderOptions>;
	return Boolean(provider.idToken || options.verifyIdToken);
}

/**
 * Verify a client-submitted id_token against a provider's verification config.
 *
 * This is the single id_token verifier for every social provider. Providers no longer
 * implement their own boolean `verifyIdToken`; they declare an {@link UpstreamProvider.idToken}
 * config and this function performs the cryptographic check. The contract is fail-closed: a
 * provider without a config (and without an integrator `verifyIdToken` override) returns
 * `false`, so a forged token can never be accepted by omission.
 *
 * @returns `true` only when the token is authentic for the provider.
 */
export async function verifyProviderIdToken(
	provider: UpstreamProvider<any, any>,
	token: string,
	nonce?: string,
): Promise<boolean> {
	const options = (provider.options ?? {}) as Partial<ProviderOptions>;
	if (options.disableIdTokenSignIn) {
		return false;
	}
	if (options.verifyIdToken) {
		return options.verifyIdToken(token, nonce);
	}
	const config = provider.idToken;
	if (!config) {
		return false;
	}
	if ("verify" in config) {
		return config.verify(token, nonce);
	}
	// Opaque (non-JWS) tokens carry no signature to check. They are accepted only when the
	// provider opts in, in which case getUserInfo resolves identity from the access token via
	// the provider's userinfo endpoint, which validates it (e.g. Facebook Graph access tokens).
	if (token.split(".").length !== 3) {
		return config.allowOpaqueToken === true;
	}
	try {
		const header = decodeProtectedHeader(token);
		if (!header.kid || !header.alg) {
			return false;
		}
		const { payload } = await jwtVerify(token, config.jwks, {
			issuer: config.issuer,
			audience: config.audience,
			algorithms: config.algorithms ?? [header.alg],
			maxTokenAge: config.maxTokenAge,
		});
		if (
			nonce &&
			!(await nonceMatches(payload.nonce, nonce, config.nonceComparison))
		) {
			return false;
		}
		return true;
	} catch {
		return false;
	}
}
