import type { JWSAlgorithms, JwtOptions } from "better-auth/plugins";
import { DEFAULT_JWT_ALGORITHM } from "better-auth/plugins";
import type { Session, User } from "better-auth/types";
import type {
	OAuthAuthenticationContext,
	OAuthOptions,
	SchemaClient,
	Scope,
} from "./types";
import { parseClientMetadata, resolveSessionAuthTime } from "./utils";

/**
 * OpenID Connect level 0: no assurance that the same person is present.
 *
 * @see https://openid.net/specs/openid-connect-core-1_0.html#IDToken
 */
export const LEVEL_0_ACR = "0";
export const DEFAULT_ACR_VALUES_SUPPORTED = [LEVEL_0_ACR] as const;
export const DEFAULT_ID_TOKEN_SIGNING_ALGORITHM = DEFAULT_JWT_ALGORITHM;

const RESERVED_ID_TOKEN_CLAIMS = new Set([
	"iss",
	"sub",
	"aud",
	"exp",
	"nbf",
	"iat",
	"jti",
	"nonce",
	"auth_time",
	"acr",
	"amr",
	"azp",
	"at_hash",
	"c_hash",
	"sid",
	"scope",
]);

type NormalizedOAuthAuthenticationContext = OAuthAuthenticationContext & {
	acr: string;
};

function uniqueValues<T extends string>(values: T[]): T[] {
	return Array.from(new Set(values));
}

function normalizeString(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function normalizeStringArray(value: unknown): string[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const values = value.filter(
		(item): item is string => typeof item === "string" && item.length > 0,
	);
	return values.length ? uniqueValues(values) : undefined;
}

export function sanitizeCustomIdTokenClaims(
	claims: unknown,
): Record<string, unknown> {
	const sanitized: Record<string, unknown> = {};
	if (!claims || typeof claims !== "object" || Array.isArray(claims)) {
		return sanitized;
	}
	for (const [name, value] of Object.entries(claims)) {
		if (!RESERVED_ID_TOKEN_CLAIMS.has(name)) {
			sanitized[name] = value;
		}
	}
	return sanitized;
}

export function getAcrValuesSupported(
	opts: OAuthOptions<Scope[]>,
): readonly string[] {
	const configured = opts.authenticationContext?.acrValuesSupported?.filter(
		(value) => value.length > 0,
	);
	return configured?.length
		? uniqueValues(configured)
		: DEFAULT_ACR_VALUES_SUPPORTED;
}

export function isAuthenticationFresh(
	authTime: Date | undefined,
	maxAgeSeconds: number | undefined,
	now: Date = new Date(),
): boolean {
	if (maxAgeSeconds === undefined) return true;
	if (!authTime) return false;
	if (maxAgeSeconds === 0) return false;
	return now.getTime() - authTime.getTime() <= maxAgeSeconds * 1000;
}

export function getStoredAuthenticationContext(
	authenticationContext: OAuthAuthenticationContext,
) {
	return {
		authTime: authenticationContext.authTime?.getTime(),
		acr: authenticationContext.acr,
		amr: authenticationContext.amr,
	};
}

export function normalizeAuthenticationContext(
	authenticationContext: OAuthAuthenticationContext | undefined,
): NormalizedOAuthAuthenticationContext {
	return {
		authTime: authenticationContext?.authTime,
		acr: normalizeString(authenticationContext?.acr) ?? LEVEL_0_ACR,
		amr: normalizeStringArray(authenticationContext?.amr),
	};
}

export async function resolveAuthenticationContext(input: {
	opts: OAuthOptions<Scope[]>;
	user: User & Record<string, unknown>;
	session: Session & Record<string, unknown>;
	client: SchemaClient<Scope[]>;
	scopes: string[];
	headers: Headers;
	requestedAcrValues?: string[];
}): Promise<OAuthAuthenticationContext> {
	const defaultContext = normalizeAuthenticationContext({
		authTime: resolveSessionAuthTime(input.session),
		acr: LEVEL_0_ACR,
	});
	const resolved = await input.opts.authenticationContext?.resolve?.({
		user: input.user,
		session: input.session,
		client: input.client,
		scopes: input.scopes,
		headers: input.headers,
		metadata: parseClientMetadata(input.client.metadata),
		requestedAcrValues: input.requestedAcrValues,
		defaultContext,
	});
	const authenticationContext = normalizeAuthenticationContext({
		...defaultContext,
		...resolved,
	});

	const acrValuesSupported = getAcrValuesSupported(input.opts);
	if (!acrValuesSupported.includes(authenticationContext.acr)) {
		throw new Error(
			`authenticationContext.resolve returned unsupported acr "${authenticationContext.acr}"`,
		);
	}

	return authenticationContext;
}

export function getIdTokenSigningAlgValuesSupported(input: {
	disableJwtPlugin?: boolean;
	jwtPluginOptions?: JwtOptions;
}): JWSAlgorithms[] | ["HS256"] {
	if (input.disableJwtPlugin) {
		return ["HS256"];
	}
	return [
		input.jwtPluginOptions?.jwks?.keyPairConfig?.alg ??
			DEFAULT_ID_TOKEN_SIGNING_ALGORITHM,
	];
}
