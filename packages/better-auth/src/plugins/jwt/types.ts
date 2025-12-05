import type { JWTPayload } from "jose";
import type { GenericEndpointContext } from "../..";
import type { InferOptionSchema, Session, User } from "../../types";
import type { Awaitable } from "../../types/helper";
import type { schema } from "./schema";

export interface JwtOptions {
	jwks?:
		| {
				/**
				 * Disables the /jwks endpoint and uses this endpoint in discovery.
				 *
				 * Useful if jwks are not managed at /jwks or
				 * if your jwks are signed with a certificate and placed on your CDN.
				 */
				remoteUrl?: string | undefined;
				/**
				 * Key pair configuration
				 * @description A subset of the options available for the generateKeyPair function
				 *
				 * @see https://github.com/panva/jose/blob/main/src/runtime/node/generate.ts
				 *
				 * @default { alg: 'EdDSA', crv: 'Ed25519' }
				 */
				keyPairConfig?: JWKOptions | undefined;
				/**
				 * Disable private key encryption
				 * @description Disable the encryption of the private key in the database
				 *
				 * @default false
				 */
				disablePrivateKeyEncryption?: boolean | undefined;
				/**
				 * The key rotation interval in seconds.
				 *
				 * @default undefined (disabled)
				 */
				rotationInterval?: number | undefined;
				/**
				 * The grace period in seconds.
				 *
				 * @default 2592000 (30 days)
				 */
				gracePeriod?: number | undefined;
				/**
				 * The path of the endpoint exposing the JWKS.
				 * When set, this replaces the default /jwks endpoint.
				 * The old endpoint will return 404.
				 *
				 * @default /jwks
				 * @example "/.well-known/jwks.json"
				 */
				jwksPath?: string | undefined;
		  }
		| undefined;

	jwt?:
		| {
				/**
				 * The issuer of the JWT
				 */
				issuer?: string | undefined;
				/**
				 * The audience of the JWT
				 */
				audience?: string | undefined;
				/**
				 * Set the "exp" (Expiration Time) Claim.
				 *
				 * - If a `number` is passed as an argument it is used as the claim directly.
				 * - If a `Date` instance is passed as an argument it is converted to unix timestamp and used as the
				 *   claim.
				 * - If a `string` is passed as an argument it is resolved to a time span, and then added to the
				 *   current unix timestamp and used as the claim.
				 *
				 * Format used for time span should be a number followed by a unit, such as "5 minutes" or "1
				 * day".
				 *
				 * Valid units are: "sec", "secs", "second", "seconds", "s", "minute", "minutes", "min", "mins",
				 * "m", "hour", "hours", "hr", "hrs", "h", "day", "days", "d", "week", "weeks", "w", "year",
				 * "years", "yr", "yrs", and "y". It is not possible to specify months. 365.25 days is used as an
				 * alias for a year.
				 *
				 * If the string is suffixed with "ago", or prefixed with a "-", the resulting time span gets
				 * subtracted from the current unix timestamp. A "from now" suffix can also be used for
				 * readability when adding to the current unix timestamp.
				 *
				 * @default 15m
				 */
				expirationTime?: number | string | Date | undefined;
				/**
				 * A function that is called to define the payload of the JWT
				 */
				definePayload?: (session: {
					user: User & Record<string, any>;
					session: Session & Record<string, any>;
				}) => Promise<Record<string, any>> | Record<string, any> | undefined;
				/**
				 * A function that is called to get the subject of the JWT
				 *
				 * @default session.user.id
				 */
				getSubject?: (session: {
					user: User & Record<string, any>;
					session: Session & Record<string, any>;
				}) => Promise<string> | string | undefined;
				/**
				 * A custom function to remote sign the jwt payload.
				 *
				 * All headers, such as `alg` and `kid`,
				 * MUST be defined within this function.
				 * You can safely define the header `typ: 'JWT'`.
				 *
				 * @requires jwks.remoteUrl
				 * @invalidates other jwt.* options
				 */
				sign?: ((payload: JWTPayload) => Awaitable<string>) | undefined;
		  }
		| undefined;

	/**
	 * Disables setting JWTs through middleware.
	 *
	 * Recommended to set `true` when using an oAuth provider plugin
	 * like OIDC or MCP where session payloads should not be signed.
	 *
	 * @default false
	 */
	disableSettingJwtHeader?: boolean | undefined;
	/**
	 * Custom schema for the admin plugin
	 */
	schema?: InferOptionSchema<typeof schema> | undefined;
	/**
	 * Custom adapter for the jwt plugin
	 *
	 * This will override the default adapter
	 *
	 * @default adapter from the database
	 */
	adapter?: {
		/**
		 * A custom function to get the JWKS from the database or
		 * other source
		 *
		 * This will override the default getJwks from the database
		 *
		 * @param ctx - The context of the request
		 * @returns The JWKS
		 */
		getJwks?: (
			ctx: GenericEndpointContext,
		) => Promise<Jwk[] | null | undefined>;
		/**
		 * A custom function to create a new key in the database or
		 * other source
		 *
		 * This will override the default createJwk from the database
		 *
		 * @param data - The key to create
		 * @returns The created key
		 */
		createJwk?: (
			data: Omit<Jwk, "id">,
			ctx: GenericEndpointContext,
		) => Promise<Jwk>;
	};
}

/**
 * Asymmetric (JWS) Supported.
 *
 * @see https://github.com/panva/jose/issues/210
 */
// JWE is symmetric (ie sharing a secret) thus a jwks is not applicable since there is no public key to share.
// All new JWK "alg" and/or "crv" MUST have an associated test in jwt.test.ts
export type JWKOptions =
	| {
			alg: "EdDSA"; // EdDSA with Ed25519 key
			crv?: "Ed25519" | undefined;
	  }
	| {
			alg: "ES256"; // ECDSA with P-256 curve
			crv?: never | undefined; // Only one valid option, no need for crv
	  }
	| {
			alg: "ES512"; // ECDSA with P-521 curve
			crv?: never | undefined; // Only P-521 for ES512
	  }
	| {
			alg: "PS256"; // RSA-PSS with SHA-256
			modulusLength?: number | undefined; // Default to 2048 or higher
	  }
	| {
			alg: "RS256"; // RSA with SHA-256
			modulusLength?: number | undefined; // Default to 2048 or higher
	  };

export type JWSAlgorithms = JWKOptions["alg"];

export interface Jwk {
	id: string;
	publicKey: string;
	privateKey: string;
	createdAt: Date;
	expiresAt?: Date;
	alg?: JWSAlgorithms | undefined;
	crv?: ("Ed25519" | "P-256" | "P-521") | undefined;
}
