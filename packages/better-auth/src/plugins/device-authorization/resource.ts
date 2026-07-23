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
	"auth_time",
	"acr",
	"amr",
	"typ",
	"cnf",
]);

function sanitizeCustomClaims(
	ctx: GenericEndpointContext,
	claims: unknown,
): Record<string, unknown> {
	if (typeof claims !== "object" || claims === null || Array.isArray(claims)) {
		throw new APIError("INTERNAL_SERVER_ERROR", {
			error: "server_error",
			error_description:
				DEVICE_AUTHORIZATION_ERROR_CODES.INVALID_CUSTOM_ACCESS_TOKEN_CLAIMS
					.message,
		});
	}

	const stripped: string[] = [];
	const safe: Record<string, unknown> = {};
	for (const [claim, value] of Object.entries(claims)) {
		if (RESERVED_CLAIMS.has(claim)) {
			stripped.push(claim);
			continue;
		}
		safe[claim] = value;
	}
	if (stripped.length > 0) {
		ctx.context.logger.warn(
			`device-authorization: stripped reserved access-token claim name(s): ${stripped.join(
				", ",
			)}. The authorization server owns these claim values.`,
		);
	}
	return safe;
}

/**
 * Normalize an RFC 8707 `resource` value (string or repeated string) into a
 * de-duplicated, non-empty array, or `undefined` when absent/empty. Duplicate
 * entries are collapsed so a repeated single resource resolves to one audience.
 */
function normalizeResource(
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
function assertValidResources(
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
		// `url.hash` is "" for a bare trailing `#`, but RFC 8707 forbids any
		// fragment component (empty or not), so also check the raw string.
		if (url.hash || resource.includes("#")) {
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
 * Recover repeated RFC 8707 `resource` values from a form body. `better-call`'s
 * parsed body keeps only the final value for repeated form keys, so both device
 * endpoints clone and re-read the request before resolving the audience.
 */
export async function extractRepeatedResourceFromForm(
	request: Request,
): Promise<string[] | undefined> {
	const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
	if (!contentType.includes("application/x-www-form-urlencoded")) {
		return undefined;
	}

	let text: string;
	try {
		text = await request.text();
	} catch {
		return undefined;
	}
	if (!text) return undefined;

	const params = new URLSearchParams(text);
	if (!params.has("resource")) return undefined;
	return params.getAll("resource").filter((resource) => resource.length > 0);
}

/**
 * Resolve the `jwt` plugin's options, throwing `server_error` if the plugin is
 * not registered. The plugin supplies the signer and publishes verification
 * keys through its local or remote JWKS configuration. Call this before
 * consuming the device code so a misconfigured server does not burn the user's
 * approval.
 */
export function requireJwtOptions(
	ctx: GenericEndpointContext,
): JwtOptions | undefined {
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
	return jwtPlugin.options as JwtOptions | undefined;
}

/**
 * Mint an RFC 9068 JWT access token audience-restricted to `audience`.
 * Requires the `jwt` plugin for signing and JWKS publication. Returns the
 * compact JWT and its lifetime in seconds.
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

	const jwtOptions = requireJwtOptions(ctx);

	const iat = Math.floor(Date.now() / 1000);
	const exp = toExpJWT(jwtOptions?.jwt?.expirationTime ?? "15m", iat);
	const scopes = scope ? scope.split(" ") : [];
	const rawCustomClaims: unknown = opts.customAccessTokenClaims
		? await opts.customAccessTokenClaims({
				user,
				scopes,
				resource: audience,
				clientId,
			})
		: {};
	// Strip reserved/registered claims so the hook can never forge protocol
	// claims (e.g. `iss`, `sub`, `aud`); those are set authoritatively below.
	const customClaims = sanitizeCustomClaims(ctx, rawCustomClaims);

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
