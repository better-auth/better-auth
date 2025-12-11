import { betterFetch } from "@better-fetch/fetch";
import { APIError } from "better-call";
import type {
	JSONWebKeySet,
	JWTPayload,
	JWTVerifyOptions,
	ProtectedHeaderParameters,
} from "jose";
import {
	createLocalJWKSet,
	decodeProtectedHeader,
	jwtVerify,
	UnsecuredJWT,
} from "jose";
import { logger } from "../env";

/** Last fetched jwks used locally in getJwks @internal */
let jwks: JSONWebKeySet | undefined;

export interface VerifyAccessTokenRemote {
	/** Full url of the introspect endpoint. Should end with `/oauth2/introspect` */
	introspectUrl: string;
	/** Client Secret */
	clientId: string;
	/** Client Secret */
	clientSecret: string;
	/**
	 * Forces remote verification of a token.
	 * This ensures attached session (if applicable)
	 * is also still active.
	 */
	force?: boolean;
}

/**
 * Performs local verification of an access token for your APIs.
 *
 * Can also be configured for remote verification.
 */
export async function verifyJwsAccessToken(
	token: string,
	opts: {
		/** Jwks url or promise of a Jwks */
		jwksFetch: string | (() => Promise<JSONWebKeySet | undefined>);
		/** Verify options */
		verifyOptions: JWTVerifyOptions &
			Required<Pick<JWTVerifyOptions, "audience" | "issuer">>;
	},
) {
	try {
		const jwks = await getJwks(token, opts);
		const jwt = await jwtVerify<JWTPayload>(
			token,
			createLocalJWKSet(jwks),
			opts.verifyOptions,
		);
		// Return the JWT payload in introspection format
		// https://datatracker.ietf.org/doc/html/rfc7662#section-2.2
		if (jwt.payload.azp) {
			jwt.payload.client_id = jwt.payload.azp;
		}
		return jwt.payload;
	} catch (error) {
		if (error instanceof Error) throw error;
		throw new Error(error as unknown as string);
	}
}

export async function getJwks(
	token: string,
	opts: {
		/** Jwks url or promise of a Jwks */
		jwksFetch: string | (() => Promise<JSONWebKeySet | undefined>);
	},
) {
	// Attempt to decode the token and find a matching kid in jwks
	let jwtHeaders: ProtectedHeaderParameters | undefined;
	try {
		jwtHeaders = decodeProtectedHeader(token);
	} catch (error) {
		if (error instanceof Error) throw error;
		throw new Error(error as unknown as string);
	}

	if (!jwtHeaders.kid) throw new Error("Missing jwt kid");

	// Fetch jwks if not set or has a different kid than the one stored
	if (!jwks || !jwks.keys.find((jwk) => jwk.kid === jwtHeaders.kid)) {
		jwks =
			typeof opts.jwksFetch === "string"
				? await betterFetch<JSONWebKeySet>(opts.jwksFetch, {
						headers: {
							Accept: "application/json",
						},
					}).then(async (res) => {
						if (res.error)
							throw new Error(
								`Jwks failed: ${res.error.message ?? res.error.statusText}`,
							);
						return res.data;
					})
				: await opts.jwksFetch();
		if (!jwks) throw new Error("No jwks found");
	}

	return jwks;
}

/**
 * Performs local verification of an access token for your API.
 *
 * Can also be configured for remote verification.
 */
export async function verifyAccessToken(
	token: string,
	opts: {
		/** Verify options */
		verifyOptions: JWTVerifyOptions &
			Required<Pick<JWTVerifyOptions, "audience" | "issuer">>;
		/** Scopes to additionally verify. Token must include all but not exact. */
		scopes?: string[];
		/** Required to verify access token locally */
		jwksUrl?: string;
		/** If provided, can verify a token remotely */
		remoteVerify?: VerifyAccessTokenRemote;
	},
) {
	let payload: JWTPayload | undefined;
	// Locally verify
	if (opts.jwksUrl && !opts?.remoteVerify?.force) {
		try {
			payload = await verifyJwsAccessToken(token, {
				jwksFetch: opts.jwksUrl,
				verifyOptions: opts.verifyOptions,
			});
		} catch (error) {
			if (error instanceof Error) {
				if (error.name === "TypeError" || error.name === "JWSInvalid") {
					// likely an opaque token (continue)
				} else if (error.name === "JWTExpired") {
					throw new APIError("UNAUTHORIZED", {
						message: "token expired",
					});
				} else if (error.name === "JWTInvalid") {
					throw new APIError("UNAUTHORIZED", {
						message: "token invalid",
					});
				} else {
					throw error;
				}
			} else {
				throw new Error(error as unknown as string);
			}
		}
	}

	// Remote verify
	if (opts?.remoteVerify) {
		const { data: introspect, error: introspectError } = await betterFetch<
			JWTPayload & {
				active: boolean;
			}
		>(opts.remoteVerify.introspectUrl, {
			method: "POST",
			headers: {
				Accept: "application/json",
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: new URLSearchParams({
				client_id: opts.remoteVerify.clientId,
				client_secret: opts.remoteVerify.clientSecret,
				token,
				token_type_hint: "access_token",
			}).toString(),
		});
		if (introspectError)
			logger.error(
				`Introspection failed: ${introspectError.message ?? introspectError.statusText}`,
			);
		if (!introspect)
			throw new APIError("INTERNAL_SERVER_ERROR", {
				message: "introspection failed",
			});
		if (!introspect.active)
			throw new APIError("UNAUTHORIZED", {
				message: "token inactive",
			});
		// Verifies payload using verify options (token valid through introspect)
		try {
			const unsecuredJwt = new UnsecuredJWT(introspect).encode();
			const { audience: _audience, ...verifyOptions } = opts.verifyOptions;
			const verify = introspect.aud
				? UnsecuredJWT.decode(unsecuredJwt, opts.verifyOptions)
				: UnsecuredJWT.decode(unsecuredJwt, verifyOptions);
			payload = verify.payload;
		} catch (error) {
			throw new Error(error as unknown as string);
		}
	}

	if (!payload)
		throw new APIError("UNAUTHORIZED", {
			message: `no token payload`,
		});

	// Check scopes if provided
	if (opts.scopes) {
		const validScopes = new Set(
			(payload.scope as string | undefined)?.split(" "),
		);
		for (const sc of opts.scopes) {
			if (!validScopes.has(sc)) {
				throw new APIError("FORBIDDEN", {
					message: `invalid scope ${sc}`,
				});
			}
		}
	}

	return payload;
}
