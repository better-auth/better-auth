import type { GenericEndpointContext } from "@better-auth/core";
import { APIError } from "@better-auth/core/error";
import { generateRandomString } from "../../crypto";
import type { User } from "../../types";
import { signJWT, toExpJWT } from "../jwt";
import type { JwtOptions } from "../jwt/types";
import type { DeviceAuthorizationOptions } from ".";
import { DEVICE_AUTHORIZATION_ERROR_CODES } from "./error-codes";

/**
 * Registered / protocol claims a `customAccessTokenClaims` hook must not be
 * able to override: they are set authoritatively when minting the access token
 * (or, for `iss`, derived by `signJWT`). Filtering these keeps the issued token
 * RFC 9068-conformant regardless of what the hook returns.
 */
const RESERVED_CLAIMS = new Set([
	"iss",
	"sub",
	"aud",
	"exp",
	"nbf",
	"iat",
	"jti",
	"client_id",
	"azp",
	"scope",
	"typ",
	"cnf",
]);

/**
 * Normalize an RFC 8707 `resource` value (string or repeated string) into a
 * de-duplicated, non-empty array, or `undefined` when absent/empty. Duplicate
 * entries are collapsed so a repeated single resource resolves to one audience.
 */
export function normalizeResource(
	resource: string | string[] | undefined,
): string[] | undefined {
	if (resource === undefined) return undefined;
	const arr = [...new Set(Array.isArray(resource) ? resource : [resource])];
	return arr.length ? arr : undefined;
}

function invalidTarget(message: string): APIError {
	return new APIError("BAD_REQUEST", {
		error: "invalid_target",
		error_description: message,
	});
}

/**
 * Validate every resource: must be an absolute URI without a fragment
 * (RFC 8707 §2) and a member of `opts.allowedResources`. Throws `invalid_target`
 * otherwise. An unset/empty allow-list rejects all resources.
 */
export function assertValidResources(
	opts: DeviceAuthorizationOptions,
	resources: string[],
): void {
	const allowed = new Set(opts.allowedResources ?? []);
	for (const resource of resources) {
		let url: URL;
		try {
			url = new URL(resource);
		} catch {
			throw invalidTarget(
				DEVICE_AUTHORIZATION_ERROR_CODES.RESOURCE_NOT_ABSOLUTE_URI.message,
			);
		}
		if (url.hash) {
			throw invalidTarget(
				DEVICE_AUTHORIZATION_ERROR_CODES.RESOURCE_HAS_FRAGMENT.message,
			);
		}
		if (!allowed.has(resource)) {
			throw invalidTarget(
				DEVICE_AUTHORIZATION_ERROR_CODES.RESOURCE_NOT_ALLOWED.message,
			);
		}
	}
}

/**
 * Resolve the effective audience from the resource bound at `/device/code`
 * (`boundResource`) and the resource requested at `/device/token`
 * (`requestedResource`), applying the RFC 8707 §2.2 subset rule. Returns a
 * single string for one resource, an array for many, or `undefined` when no
 * resource is involved (opaque-token path).
 *
 * `requireBinding` (set at the token endpoint) rejects a `requestedResource`
 * that was never authorized at the device-authorization request, so the issued
 * token's audience is always tied to what the user's approval covered. RFC 8707
 * §2.2 permits this stricter policy. It is left unset at the authorization
 * request itself, since that is where a resource is first declared.
 */
export function resolveResourceAudience(params: {
	opts: DeviceAuthorizationOptions;
	boundResource: string | string[] | undefined;
	requestedResource: string | string[] | undefined;
	requireBinding?: boolean;
}): string | string[] | undefined {
	const { opts, boundResource, requestedResource, requireBinding } = params;
	const bound = normalizeResource(boundResource);
	const requested = normalizeResource(requestedResource);

	if (!bound && !requested) return undefined;

	let effective: string[];
	if (bound && requested) {
		// Token-time resource(s) must equal or be a subset of the bound set.
		const boundSet = new Set(bound);
		for (const resource of requested) {
			if (!boundSet.has(resource)) {
				throw invalidTarget(
					DEVICE_AUTHORIZATION_ERROR_CODES.RESOURCE_EXCEEDS_GRANT.message,
				);
			}
		}
		effective = requested;
	} else if (bound) {
		effective = bound;
	} else {
		// A resource requested with nothing bound at the authorization request:
		// rejected at the token endpoint (`requireBinding`); the normal
		// first-declaration path at `/device/code`.
		if (requireBinding) {
			throw invalidTarget(
				DEVICE_AUTHORIZATION_ERROR_CODES.RESOURCE_NOT_AUTHORIZED.message,
			);
		}
		effective = requested as string[];
	}

	assertValidResources(opts, effective);
	return effective.length === 1 ? effective[0] : effective;
}

/** Serialize a resolved audience for storage on the deviceCode row. */
export function serializeResource(audience: string | string[]): string {
	return Array.isArray(audience) ? JSON.stringify(audience) : audience;
}

/** Parse a stored resource value back into a string or string[]. */
export function parseStoredResource(
	stored: string | null | undefined,
): string | string[] | undefined {
	if (!stored) return undefined;
	if (stored.startsWith("[")) {
		try {
			const parsed = JSON.parse(stored);
			if (Array.isArray(parsed)) return parsed as string[];
		} catch {
			// fall through to treat as a single opaque string
		}
	}
	return stored;
}

/**
 * Mint an RFC 9068 JWT access token audience-restricted to `audience`.
 * Requires the `jwt` plugin (for JWKS signing + the /jwks verification
 * endpoint). Returns the compact JWT and its lifetime in seconds.
 */
export async function createDeviceJwtAccessToken(params: {
	ctx: GenericEndpointContext;
	opts: DeviceAuthorizationOptions;
	user: User;
	clientId: string;
	scope: string;
	audience: string | string[];
}): Promise<{ token: string; expiresIn: number }> {
	const { ctx, opts, user, clientId, scope, audience } = params;

	const jwtPlugin = ctx.context.getPlugin("jwt");
	if (!jwtPlugin) {
		ctx.context.logger.error(
			"device-authorization: a `resource` was requested but the jwt plugin is not registered. Add the jwt() plugin to issue JWT access tokens.",
		);
		throw new APIError("INTERNAL_SERVER_ERROR", {
			error: "server_error",
			error_description:
				DEVICE_AUTHORIZATION_ERROR_CODES.JWT_PLUGIN_REQUIRED.message,
		});
	}
	const jwtOptions = jwtPlugin.options as JwtOptions | undefined;

	const iat = Math.floor(Date.now() / 1000);
	const exp = toExpJWT(jwtOptions?.jwt?.expirationTime ?? "15m", iat);
	const scopes = scope ? scope.split(" ") : [];
	const rawCustomClaims = opts.customAccessTokenClaims
		? await opts.customAccessTokenClaims({
				user,
				scopes,
				resource: audience,
				clientId,
			})
		: {};
	// Strip reserved/registered claims so the hook can never forge protocol
	// claims (e.g. `iss`, `sub`, `aud`); those are set authoritatively below.
	const customClaims = Object.fromEntries(
		Object.entries(rawCustomClaims).filter(
			([claim]) => !RESERVED_CLAIMS.has(claim),
		),
	);

	const token = await signJWT(ctx, {
		options: jwtOptions,
		// RFC 9068 §2.1: access tokens use the `at+jwt` media type. `signJWT`
		// merges this into the JWS protected header and forwards it to custom
		// remote signers.
		header: { typ: "at+jwt" },
		payload: {
			...customClaims,
			// `iss` is derived by signJWT (options.jwt.issuer ?? baseURL origin).
			sub: user.id,
			aud: audience,
			client_id: clientId,
			azp: clientId,
			scope: scopes.length ? scopes.join(" ") : undefined,
			iat,
			exp,
			jti: generateRandomString(32, "a-z", "A-Z", "0-9"),
		},
	});

	return { token, expiresIn: exp - iat };
}
