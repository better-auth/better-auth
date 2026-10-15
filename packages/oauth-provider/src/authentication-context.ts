import { logger } from "@better-auth/core/env";
import type { Session, User } from "better-auth/types";
import { APIError } from "better-call";
import { getRequestedAcrValues } from "./claims-request";
import type {
	OAuthAuthenticationContext,
	OAuthInteractionQuery,
	OAuthOptions,
	SchemaClient,
	Scope,
} from "./types";

/**
 * OIDC Core Authentication Context Class Reference for authentication that
 * does not meet ISO/IEC 29115 level 1.
 *
 * Better Auth does not evaluate a stronger ACR policy on its own, so without an
 * `authenticationContext` resolver, discovery and ID tokens must not claim an
 * assurance profile such as InCommon bronze.
 */
export const LEVEL_0_ACR = "0";

/** The ACR values the provider may assert, advertised in discovery. */
export function getAcrValuesSupported(opts: OAuthOptions<Scope[]>) {
	return opts.authenticationContext?.acrValuesSupported ?? [LEVEL_0_ACR];
}

function invalidAuthenticationContext(description: string): never {
	throw new APIError("INTERNAL_SERVER_ERROR", {
		error: "server_error",
		error_description: `authenticationContext.resolve ${description}`,
	});
}

/**
 * Runs the configured `authenticationContext.resolve` for an approval and
 * validates its result. Returns an empty context, which ID tokens report as
 * `acr: "0"`, when no resolver is configured or no ID token can be issued.
 * Invalid results throw an `APIError` with `server_error`.
 */
export async function resolveAuthenticationContext(
	opts: OAuthOptions<Scope[]>,
	info: {
		user: User & Record<string, unknown>;
		session: Session & Record<string, unknown>;
		client: SchemaClient<Scope[]>;
		scopes: string[];
		headers: Headers;
		query: Pick<OAuthInteractionQuery, "claims" | "acr_values">;
	},
): Promise<OAuthAuthenticationContext> {
	const resolve = opts.authenticationContext?.resolve;
	// acr and amr only reach ID tokens, which need the openid scope.
	if (!resolve || !info.scopes.includes("openid")) return {};
	const { query, ...resolveInfo } = info;
	const resolved = await resolve({
		...resolveInfo,
		requestedAcrValues: getRequestedAcrValues(query.claims, query.acr_values),
	});
	// The resolver is user code; check the runtime shape, not just the types.
	const acr: unknown = resolved?.acr ?? LEVEL_0_ACR;
	const amr: unknown = resolved?.amr;
	if (typeof acr !== "string") {
		invalidAuthenticationContext("returned a non-string acr");
	}
	if (!getAcrValuesSupported(opts).includes(acr)) {
		invalidAuthenticationContext(
			`returned acr "${acr}", which is not in acrValuesSupported`,
		);
	}
	if (amr === undefined) return { acr };
	if (
		!Array.isArray(amr) ||
		!amr.every((value): value is string => typeof value === "string")
	) {
		invalidAuthenticationContext("returned an amr that is not a string array");
	}
	return { acr, amr: amr.length ? amr : undefined };
}

const RESERVED_ID_TOKEN_CLAIMS = new Set([
	"iss",
	"sub",
	"aud",
	"exp",
	"nbf",
	"iat",
	"jti",
	"auth_time",
	"nonce",
	"acr",
	"amr",
	"azp",
	"sid",
	"at_hash",
	"c_hash",
	"s_hash",
]);

/**
 * Removes provider-owned ID token claim names from custom claims.
 *
 * `customIdTokenClaims` is an extension point for additional claims. It must not
 * replace the issuer, subject, audience, lifetime, nonce, authorized party,
 * token-binding hashes, session binding, or authentication context that the
 * provider owns.
 */
export function stripReservedIdTokenClaims(
	claims: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
	if (!claims) return {};
	const stripped: string[] = [];
	const safeClaims = Object.create(null) as Record<string, unknown>;
	for (const [key, value] of Object.entries(claims)) {
		if (RESERVED_ID_TOKEN_CLAIMS.has(key)) {
			stripped.push(key);
			continue;
		}
		safeClaims[key] = value;
	}
	if (stripped.length > 0) {
		logger.warn(
			`oauth-provider: stripped reserved id-token claim name(s): ${stripped.join(
				", ",
			)}. The AS owns these claim values.`,
		);
	}
	return safeClaims;
}
