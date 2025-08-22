import {
	createLocalJWKSet,
	decodeProtectedHeader,
	jwtVerify,
	UnsecuredJWT,
	type JSONWebKeySet,
	type JWTPayload,
	type JWTVerifyOptions,
	type ProtectedHeaderParameters,
} from "jose";
import type { GenericEndpointContext } from "@better-auth/core";
import { getJwtPlugin } from "./utils";
import { APIError } from "better-call";
import type { OAuthOptions } from "./types";

/** Last fetched jwks */
// Never export (used locally in ONLY verifyJwsAccessToken)
let jwks: JSONWebKeySet | undefined;

/**
 * Performs local verification of an access token for your APIs.
 *
 * Can also be configured for remote verification.
 *
 * @internal
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
				? await fetch(opts.jwksFetch, {
						headers: {
							Accept: "application/json",
						},
					}).then(async (res) => {
						if (!res.ok) throw new Error(`Jwks error: status ${res.status}`);
						return (await res.json()) as JSONWebKeySet | undefined;
					})
				: await opts.jwksFetch();
		if (!jwks) throw new Error("No jwks found");
	}

	// Actually verify token
	try {
		const jwt = await jwtVerify<JWTPayload>(
			token,
			createLocalJWKSet(jwks),
			opts.verifyOptions,
		);
		return jwt.payload;
	} catch (error) {
		if (error instanceof Error) throw error;
		throw new Error(error as unknown as string);
	}
}

interface VerifyAccessTokenRemote {
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
 * Performs local verification of an access token for your API.
 *
 * Can also be configured for remote verification.
 *
 * @external
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
		const introspect = await fetch(opts.remoteVerify.introspectUrl, {
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
		}).then(async (res) => {
			if (!res.ok) throw new Error(`Introspect error: status ${res.status}`);
			return (await res.json()) as
				| (JWTPayload & {
						active: boolean;
				  })
				| undefined;
		});
		if (!introspect || !introspect?.active) throw new Error("inactive");
		// Verifies payload using verify options (token valid through introspect)
		try {
			const unsecuredJwt = new UnsecuredJWT(introspect).encode();
			const { audience, ...verifyOptions } = opts.verifyOptions;
			const verify = introspect.aud
				? UnsecuredJWT.decode(unsecuredJwt, opts.verifyOptions)
				: UnsecuredJWT.decode(unsecuredJwt, verifyOptions);
			payload = verify.payload;
		} catch (error) {
			throw new Error(error as unknown as string);
		}
	}

	if (!payload) throw new Error("missing payload");

	// Check scopes if provided
	if (opts.scopes) {
		const scopes = (payload.scope as string | undefined)?.split(" ");
		for (const sc of opts.scopes) {
			if (!scopes?.includes(sc)) {
				throw new APIError("FORBIDDEN", {
					message: `invalid scope ${sc}`,
				});
			}
		}
	}

	return payload;
}

/**
 * Performs verification of an access token for your API
 * using the oAuth configuration values.
 *
 * Utilizes `verifyAccessToken` under the hood.
 */
export async function introspectVerifyEndpoint(
	ctx: GenericEndpointContext,
	opts: OAuthOptions,
	token?: string,
	verifyOpts?: {
		/** Verify options */
		verifyOptions?: JWTVerifyOptions;
		/** Scopes to additionally verify. Token must include all but not exact. */
		scopes?: string[];
		/** If provided, can verify a token remotely */
		remoteVerify?: Omit<VerifyAccessTokenRemote, "introspectUrl">;
	},
) {
	const jwtPlugin = opts.disableJwtPlugin
		? undefined
		: getJwtPlugin(ctx.context);
	const baseURL = ctx.context.baseURL;

	if (!token) {
		throw new APIError("UNAUTHORIZED", {
			message: "missing access token",
		});
	}

	try {
		const accessToken = await verifyAccessToken(token, {
			verifyOptions: {
				audience: jwtPlugin?.options?.jwt?.audience ?? baseURL,
				issuer: jwtPlugin?.options?.jwt?.issuer ?? baseURL,
				...verifyOpts?.verifyOptions,
			},
			scopes: verifyOpts?.scopes,
			jwksUrl: opts.disableJwtPlugin
				? undefined
				: (jwtPlugin?.options?.jwks?.remoteUrl ?? `${baseURL}/jwks`),
			remoteVerify: verifyOpts?.remoteVerify
				? {
						...verifyOpts.remoteVerify,
						introspectUrl: `${baseURL}/oauth2/introspect`,
					}
				: undefined,
		});
		return accessToken;
	} catch (error) {
		if (error instanceof APIError) {
			throw error;
		} else if (error instanceof Error) {
			throw new APIError("UNAUTHORIZED", {
				message: error.message,
			});
		}
		throw new APIError("UNAUTHORIZED", {
			message: error as unknown as string,
		});
	}
}
