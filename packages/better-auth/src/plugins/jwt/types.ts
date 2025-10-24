import type { JSONWebKeySet, JWK } from "jose";
import type { InferOptionSchema, Session, User } from "../../types";
import type { Awaitable } from "../../types/helper";
import type { schema } from "./schema";
import z from "zod/v4";

export interface JwtPluginOptions {
	/**
	 * Options for JWKS.
	 *
	 * @description Contains `keyPairConfig` which tells how the keys should be created by default.
	 * The key is created when a JWT function is called, but there is no key or when calling `createJwk` function, or `/create-jwk` endpoint.
	 * In the latter 2 cases, these defaults can be overriden and a key with different configuration can be created.
	 */
	jwks?: JwksOptions;
	/**
	 * Default options for signing and veryfing.
	 *
	 * @description They can be overriden in **JWT signing and verification functions** or by providing `options` argument to the `/sign-jwt` or `/verify-jwt` endpoints.
	 */
	jwt?: JwtOptions;
	/**
	 * Disables setting JWTs through middleware.
	 *
	 * Recommended to set `true` when using an **oAuth** provider plugin
	 * like OIDC or MCP where session payloads should not be signed.
	 *
	 * @default false
	 */
	disableSettingJwtHeader?: boolean;
	/**
	 * Custom schema for the **jwt plugin**.
	 */
	schema?: InferOptionSchema<typeof schema>;
}

/**
 * Asymmetric (JWS) Supported.
 *
 * @see https://github.com/panva/jose/issues/210
 */
// JWE is symmetric (ie sharing a secret) thus a jwks is not applicable since there is no public key to share.
// All new JWK "alg" and/or "crv" MUST have an associated test in jwt.test.ts
export type JwkOptions =
	| {
			alg: "EdDSA"; // EdDSA with Ed25519 key
			crv?: "Ed25519";
	  }
	| {
			alg: "ES256"; // ECDSA with P-256 curve
			crv?: never; // Only one valid option, no need for crv
	  }
	| {
			alg: "ES512"; // ECDSA with P-521 curve
			crv?: never; // Only P-521 for ES512
	  }
	| {
			alg: "PS256"; // RSA with probabilistic signature scheme, so same plaintext generates different ciphertexts. Uses SHA-256
			/**
			 * @default 2048
			 */
			modulusLength?: number;
	  }
	| {
			alg: "RS256"; // RSA with SHA-256
			/**
			 * @default 2048
			 */
			modulusLength?: number;
	  };

// todo: add describe() to fields
export const jwkOptionsSchema = z
	.discriminatedUnion("alg", [
		z.object({
			alg: z.literal("EdDSA"),
			crv: z.literal("Ed25519").optional(),
		}),

		z.object({
			alg: z.literal("ES256"),
			crv: z.never().optional(),
		}),

		z.object({
			alg: z.literal("ES512"),
			crv: z.never().optional(),
		}),

		z.object({
			alg: z.literal("PS256"),
			modulusLength: z.number().optional(),
		}),

		z.object({
			alg: z.literal("RS256"),
			modulusLength: z.number().optional(),
		}),
	])
	.describe("Algorithm to create a new JSON Web Key pair");

export type JwkAlgorithm = JwkOptions["alg"];

export interface JwksOptions {
	/**
	 * Array of functions to fetch **JSON Web Keys (JWK)** from **remote** JSON Web Key Set (JWKS) that will be added to JWKS in the **database**.
	 *
	 * @description Whenever an unknown **"kid" (Key ID)** Header Parameter is encountered, JWKS cache will be updated with keys from remote locations.
	 *
	 * ⚠ If two keys from different sources share the same "kid", the newly fetched key will be ignored. After a server restart, the prioritization of keys may differ.
	 *
	 * ⚠ If a key is revoked, a POST request to /revoke-jwk **server-only** endpoint must be done or the server must be restarted.
	 * @todo optional CRON that checks for key revocation from remote JWKS
	 */
	remoteJwks?: (() => Awaitable<JSONWebKeySet>)[];
	/**
	 * Default key pair configuration.
	 * @description A subset of the options available for the JOSE `generateKeyPair` function.
	 *
	 * @see https://github.com/panva/jose/blob/main/src/runtime/node/generate.ts
	 *
	 * @default { alg: 'EdDSA', crv: 'Ed25519' }
	 */
	keyPairConfig?: JwkOptions;
	/**
	 * Disable the encryption of the **private keys** in the database.
	 *
	 * @default false
	 */
	disablePrivateKeyEncryption?: boolean;
	/**
	 * @todo: describe
	 * @default false
	 */
	disableJwksCaching?: boolean;
	/**
	 * @todo describe
	 * @todo if key rotation is enabled, this is keyChainId instead
	 * @default getJwksAdapter(adapter).getLatestKey() // Latest key in the database
	 */
	defaultKeyId?: string;
}

export interface JwtOptions {
	/**
	 * The issuer of the JWT.
	 *
	 * @default baseURL // Taken from `BetterAuthOptions` inside `AuthContext` if defined, otherwise `process.env.BETTER_AUTH_URL`
	 */
	issuer?: string;
	/**
	 * The audience of the JWT.
	 *
	 * @default baseURL // Taken from in `BetterAuthOptions` inside `AuthContext` if defined, otherwise `process.env.BETTER_AUTH_URL`
	 */
	audience?: string | string[];
	/**
	 * Set the "exp" (Expiration Time) Claim.
	 *
	 * - If a `number` is passed as an argument it is used as the claim directly. It should be a unix timestamp in seconds.
	 * - If a `Date` instance is passed as an argument it is converted to unix timestamp in seconds and used as the
	 *   claim.
	 * - If a `string` is passed as an argument it is resolved to a time span, and then added to the
	 *   current unix timestamp in seconds and used as the claim.
	 *
	 * Format used for time span should be a number followed by a unit, such as "5 minutes" or "1 day".
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
	 * @default "15m"
	 */
	expirationTime?: number | string | Date;
	/**
	 * Maximum time from payload's `iat` (**"Issued At" Claim**).
	 *
	 * @description This is the **maximum allowed expiration time**, but this **will verify** the **JWT** if the **JWT `exp` ("Expiration Time") Claim** is set to higher than this.
	 * Once `maxTokenAge` time has passed since the **JWT `iat` ("Issued At") Claim**, it will be then rejected. Even if the **JWT `exp` Claim** suggets it's still valid.
	 *
	 * Expects the same **time as {`string`} format** as `expirationTime` in `JwtOptions` interface. If present, `iat` is necessary in the payload.
	 *
	 * ⚠ Might be necessary to set to a **null** and not `undefined` when dealing with **JWT**s that set `iat`, but the default `maxTokenAge` behaviour is not desired.
	 *
	 * @default "1 week" // only if `iat` is present in `requiredClaims` in verification's {`JwtVerifyOptions`}, otherwise `null`
	 */
	maxTokenAge?: string | null;
	/**
	 * Time in seconds.
	 *
	 * @description Tells how far the requested `iat` ("Issued At" Claim) can be "into the past" or "into the future"
	 * because of the clock differences of different machines within the request chain and processing time.
	 *
	 * @default 30
	 */
	maxClockSkew?: number | null;
	/**
	 * Logs to console when **JWT verification** fails as **info**.
	 *
	 * @description Useful for debugging and telemetry, but may impact performance under high load if current {`Logger`}'s {`LogLevel`} allows for printing **info** status.
	 *
	 * @default true
	 */
	logFailure?: boolean;
	/**
	 * A function that is called to define the data of the **JWT** in the `getSessionJwt` function.
	 *
	 * @default session.user // If `defineSessionJwtData` is `undefined`
	 */
	defineSessionJwtData?: (session: {
		user: User & Record<string, any>;
		session: Session & Record<string, any>;
	}) => Awaitable<Record<string, any>>;
	/**
	 * A function that is called to get the subject of the **JWT** in the `getSessionJwt` function.
	 *
	 * @default session.user.id // If `defineSessionJwtSubject` is `undefined`
	 */
	defineSessionJwtSubject?: (session: {
		user: User & Record<string, any>;
		session: Session & Record<string, any>;
	}) => Awaitable<string>;
}

export interface JwtCustomClaims {
	/**
	 * Changes **JWT "Audience" Claim**.
	 *
	 * ⚠ Undefined value or an empty array sets it to **default**, but only passing `null` sets it to no `aud` claim.
	 *
	 * @default getJWTPluginOptions(ctx)?.jwt?.audience // Plugin configuration
	 */
	aud?: string | string[] | null;
	/**
	 * Changes **JWT "Expiration Time" Claim**. Expects the same type as `expirationTime` in `JwtOptions` interface.
	 *
	 * ⚠ Undefined value sets it to **default**, but only passing `null` sets it to no `exp` claim.
	 *
	 * @default getJWTPluginOptions(ctx)?.jwt?.expirationTime // Plugin configuration, by default "15 min"
	 */
	exp?: string | number | Date | null;
	/**
	 * Changes **JWT "Issued At" Claim**. Expects the same type as `expirationTime` in `JwtOptions` interface.
	 *
	 * ⚠ Undefined value sets it to **default**, but only passing `null` sets it to no `iat` claim.
	 *
	 * @default Date.now() // Current local machine time
	 */
	iat?: string | number | Date | null;
	/**
	 * Disables **JWT "Issuer" Claim** when this is `null`.
	 *
	 * @default baseURL // Taken from `BetterAuthOptions` inside `AuthContext` if defined, otherwise `process.env.BETTER_AUTH_URL`
	 */
	iss?: null;
	/**
	 * Sets **JWT "JWT ID" Claim**. Used in JWT revocation list.
	 */
	jti?: string;
	/**
	 * Sets **JWT "Not Before" Claim**.
	 */
	nbf?: string | number | Date;
	/**
	 * Sets **JWT "Subject" Claim**.
	 */
	sub?: string;
	/**
	 * Changes **"typ" (Type) JWT Protecter Header Parameter**.
	 *
	 * @description It is technically not a JWT Claim, but having it here is more convienient.
	 * @default "JWT"
	 */
	typ?: string | null;
}

export const jwtCustomClaimsSchema = z
	.object({
		aud: z
			.union([z.string(), z.array(z.string()), z.null()])
			.optional()
			.describe('Changes JWT "Audience" Claim'),

		exp: z
			.union([z.string(), z.number(), z.date(), z.null()])
			.optional()
			.describe('Changes JWT "Expiration Time" Claim'),

		iat: z
			.union([z.string(), z.number(), z.date(), z.null()])
			.optional()
			.describe('Changes JWT "Issued At" Claim'),

		iss: z
			.null()
			.optional()
			.describe('Disables **JWT "Issuer" Claim** when this is `null`'),

		jti: z
			.string()
			.optional()
			.describe('Sets JWT "JWT ID" Claim. Used in JWT revocation list'),

		nbf: z
			.union([z.string(), z.number(), z.date()])
			.optional()
			.describe('Sets JWT "Not Before" Claim'),

		sub: z.string().optional().describe('Sets JWT "Subject" Claim'),

		typ: z
			.union([z.string(), z.null()])
			.optional()
			.describe('Sets "typ" (Type) JWT Protecter Header Parameter'),
	})
	.describe("Custom JWT claims that override or add to standard claims");

type JwtClaim = "aud" | "exp" | "iat" | "iss" | "jti" | "nbf" | "sub";
export interface JwtVerifyOptions {
	/**
	 * Array of allowed **payload**'s `aud` (**"Audience" Claim**).
	 *
	 * @description If provided, `aud` presence is necessary in the payload and the payload **must have at least one audience** from this array.
	 *
	 * ⚠ Might be necessary to set to an **empty array or null** and not `undefined` when dealing with **JWT**s that do not set `aud` at all.
	 *
	 * @default [baseURL] // Taken from `BetterAuthOptions` inside `AuthContext` if defined, otherwise `process.env.BETTER_AUTH_URL`
	 */
	allowedAudiences?: string[] | null;
	/**
	 * Array of allowed **payload**'s `iss` (**"Issuer" Claim**).
	 *
	 * @description If provided, `iss` presence is necessary in the payload.
	 *
	 * ⚠ It might be necessary to set this to an **empty array or null** and not `undefined` when dealing with **JWT**s that do not set `iss` at all.
	 *
	 * @default [baseURL] // Taken from `BetterAuthOptions` inside `AuthContext` if defined, otherwise `process.env.BETTER_AUTH_URL`
	 */
	allowedIssuers?: string[] | null;
	/**
	 * Maximum time from payload's `iat` (**"Issued At" Claim**).
	 *
	 * @description This is the **maximum allowed expiration time**, but this **will verify** the **JWT** if the **JWT `exp` ("Expiration Time") Claim** is set to higher than this.
	 * Once `maxTokenAge` time has passed since the **JWT `iat` ("Issued At") Claim**, it will be then rejected. Even if the **JWT `exp` Claim** suggets it's still valid.
	 *
	 * Expects the same **time as {`string`} format** as `expirationTime` in `JwtOptions` interface. If present, `iat` is necessary in the payload.
	 *
	 * ⚠ Might be necessary to set to a **null** and not `undefined` when dealing with **JWT**s that set `iat`, but the default `maxTokenAge` behaviour is not desired.
	 *
	 * @default getJwtPluginOptions(ctx.context)?.jwt?.maxTokenAge // if not defined: "1 week" if `iat` is present
	 */
	maxTokenAge?: string | null;
	/**
	 * Expected `sub` (**"Subject" Claim**).
	 *
	 * @description If provided, `sub` presence is necessary in the payload.
	 */
	expectedSubject?: string;
	/**
	 * Expected **JWT "typ" (Type) Header Parameter** value.
	 *
	 * @description This option makes the **"typ"** presence required.
	 *
	 * ⚠ Might be necessary to set to an **empty string or null** when dealing with **JWT**s that do not set **JWT "typ" (Type) Header Parameter** at all.
	 *
	 * @default "JWT"
	 */
	expectedType?: string | null;
	/**
	 * Expected **JWT Claims** for **JWT** to have.
	 *
	 * @description
	 *
	 * ⚠ Might be necessary to set to an **empty array or `null`** and not `undefined` when dealing with **JWT**s that do not require to set any claims.
	 *
	 * @default ["aud", "exp", "iat", "iss"] // "jti" is added to this array, if JWT revocation is enabled
	 */
	requiredClaims?: JwtClaim[] | null;
	/**
	 * The key used to verify a JWT ought belong to this key ring.
	 */
	expectedKeyRing?: string;
	/**
	 * Do not throw error when `CryptoKeyIdAlg` has set `id`, but `jwt` does not have **JWT "kid" (Key ID) Header Parameter**.
	 *
	 * @description
	 *
	 * ⚠ Might be necessary to set this to `true` when dealing with **JWT**s issued by external systems if the key has an assigned `id`.
	 *
	 * @default false
	 */
	allowNoKeyId?: boolean;
	/**
	 * Time in seconds.
	 *
	 * @description Tells how far the requested `iat` ("Issued At" Claim) can be "into the past" or "into the future"
	 * because of the clock differences of different machines within the request chain and processing time.
	 * This becomes a leeway for `exp` ("Expiration Time" Claim) and `nbf` ("Not Before" Claim).
	 * It effectively extends the allowed `exp` time and lowers the `nbf` requirement by this amount.
	 *
	 * @default getJwtPluginOptions(ctx.context)?.jwt?.allowedClockSkew // 30 if not defined
	 */
	maxClockSkew?: number | null;

	/**
	 * Logs to console when **JWT verification** fails as **info**.
	 *
	 * @description Useful for debugging and telemetry, but may impact performance under high load if current {`Logger`}'s {`LogLevel`} allows for printing **info** status.
	 *
	 * @default true
	 */
	logFailure?: boolean;
}

export const JwtVerifyOptionsSchema = z
	.object({
		allowedAudiences: z
			.array(z.string())
			.nullable()
			.optional()
			.describe(
				"Array of allowed payload's `aud` (Audience Claim). If provided, `aud` presence is necessary in the payload and the payload must have at least one audience from this array",
			),

		allowedIssuers: z
			.array(z.string())
			.nullable()
			.optional()
			.describe(
				"Array of allowed payload's `iss` (Issuer Claim). If provided, `iss` presence is necessary in the payload",
			),

		maxTokenAge: z
			.string()
			.nullable()
			.optional()
			.describe(
				"Maximum time from payload's `iat` (Issued At Claim). If present, `iat` is necessary in the payload",
			),

		expectedSubject: z
			.string()
			.optional()
			.describe(
				"Expected `sub` (Subject Claim). If provided, `sub` presence is necessary in the payload",
			),

		expectedType: z
			.string()
			.nullable()
			.optional()
			.describe(
				"Expected JWT `typ` (Type) Header Parameter value. This option makes the `typ` presence required",
			),

		requiredClaims: z
			.array(z.enum(["aud", "exp", "iat", "iss", "jti", "nbf", "sub"]))
			.nullable()
			.optional()
			.describe("Expected JWT Claims for the JWT to have"),

		expectedKeyRing: z
			.string()
			.optional()
			.describe("The key used to verify a JWT ought belong to this key ring"),

		allowNoKeyId: z
			.boolean()
			.optional()
			.describe(
				"Do not throw error when CryptoKeyIdAlg has set `id`, but JWT does not have `kid` (Key ID) header parameter",
			),

		maxClockSkew: z
			.number()
			.nullable()
			.optional()
			.describe(
				"The default time in seconds that `iat` (Issued At), `exp` (Expiration), and `nbf` (Not Before) claims can be offset to account for clock skew between systems",
			),
		// todo: describe()
		logFailure: z.boolean().optional(),
	})
	.describe("Strictness of verification");

// todo: add describe() to fields
export const jwkSchema = z
	.object({
		id: z.string(),
		publicKey: z.string(),
		privateKey: z.string(),
		createdAt: z.date(),
	})
	.describe("Database representation of JOSE's JWK");

/**
 * Database representation of **JOSE's `JWK` type**
 */
export type Jwk = z.infer<typeof jwkSchema>;

export type CryptoKeyIdAlg = {
	/**
	 * Optional ID identifying a **key pair** (**public key** and **private key**).
	 *
	 * If provided, JWT's **"kid" (Key ID)** Header Parameter will be checked to match this when **verifying** unless `allowNoKeyId` is `true` in **`JwtVerifyOptions`** or this field will be added to the **JWT Protected Header** when **signing**.
	 */
	id?: string;
	/**
	 * Algorithm name as in `JwksOpts`.
	 */
	alg: JwkAlgorithm;
	key: CryptoKey;
};

// todo: add describe() to fields
export const jwkParametersSchema = z.object({
	kty: z.string().optional(),
	alg: z.string().optional(),
	key_ops: z.array(z.string()).optional(),
	ext: z.boolean().optional(),
	use: z.string().optional(),
	x5c: z.array(z.string()).optional(),
	x5t: z.string().optional(),
	"x5t#S256": z.string().optional(),
	x5u: z.string().optional(),
	kid: z.string().optional(),
});

// todo: add describe() to fields
export const jwkExportedSchema = jwkParametersSchema
	.extend({
		crv: z.string().optional(),
		d: z.string().optional(),
		dp: z.string().optional(),
		dq: z.string().optional(),
		e: z.string().optional(),
		k: z.string().optional(),
		n: z.string().optional(),
		p: z.string().optional(),
		q: z.string().optional(),
		qi: z.string().optional(),
		x: z.string().optional(),
		y: z.string().optional(),
		pub: z.string().optional(),
		priv: z.string().optional(),
	})
	.describe("Exported CryptoKey");

export interface JwkCache extends Omit<Jwk, "publicKey" | "createdAt"> {
	publicKey: JWK;
}

export interface JwksCache {
	keys: JwkCache[];
	remoteKeys: JwkCache[];
	jwks: JSONWebKeySet;
	cachedAt: Date;
}
