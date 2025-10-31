import type { JSONWebKeySet, JWK } from "jose";
import type { InferOptionSchema, Session, User } from "../../types";
import type { Awaitable } from "../../types/helper";
import type { schema } from "./schema";
import z from "zod/v4";

/**
 * Configuration for the **"jwt" plugin**.
 */
export interface JwtPluginOptions {
	/**
	 * Options for {@link JSONWebKeySet **JSON Web Key Sets** (**JWKS**)}.
	 *
	 * @description Defines how {@link JWK **JWKs**} are created by **default** via the {@link JwksOptions `keyPairConfig`} property.
	 * A new {@link JWK **JWK**} is **generated automatically** when a **"jwt" plugin function** is called but no {@link JWK **JWK**} is available when needed, or manually through the {@link createJwk `createJwk`} function or the `/create-jwk` **endpoint**.
	 * 
	 * In the latter two cases, these **defaults** can be **overridden** to create a {@link JWK **JWK**} with a **different configuration**.
	 */
	jwks?: JwksOptions;
	/**
	 * Default options for **signing** and **verifying**.
	 *
	 * @description These options can be overridden in the **"jwt" plugin signing** and **verification functions**, or by providing the `options` to the `/sign-jwt` or `/verify-jwt` **endpoints**.
	 */
	jwt?: JwtOptions;
	/**
	 * Disables setting **JWTs** through **middleware**.
	 *
	 * Recommended to set to `true` when using **OAuth** provider plugins such as **OIDC** or **MCP**, where **session payloads** should **not** be **signed**.
	 *
	 * @default false
	 */
	disableSettingJwtHeader?: boolean;
	/**
	 * Custom schema for the **"jwt" plugin**.
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
			/**
			* Edwards-curve Digital Signature Algorithm (EdDSA).
			*/
			alg: "EdDSA"; 
			crv?: "Ed25519";
	  }
	| {
			/**
			* Elliptic Curve Digital Signature Algorithm (ECDSA) with P-256 elliptic curve.
			*/
			alg: "ES256";
			/**
			* Only P-256 for ES256.
			*/
			crv?: never; 
	  }
	| {
			/**
			* Elliptic Curve Digital Signature Algorithm (ECDSA) with P-521 elliptic curve.
			*/
			alg: "ES512";
			/**
			* Only P-521 for ES512.
			*/
			crv?: never; 
	  }
	| {
			/**
			* RSA with SHA-256.
			* 
			* Uses a **probabilistic signature scheme**, so **the same plaintext** generates **different ciphertexts**.
			*/
			alg: "PS256";
			/**
			 * @default 2048
			 */
			modulusLength?: number;
	  }
	| {
			/**
			* RSA with SHA-256.
			*/
			alg: "RS256"; 
			/**
			 * @default 2048
			 */
			modulusLength?: number;
	  };

export const jwkOptionsSchema = z
	.discriminatedUnion("alg", [
		z
			.object({
				alg: z
					.literal("EdDSA")
					.describe("Edwards-curve Digital Signature Algorithm"),
				crv: z
					.literal("Ed25519")
					.optional()
					.describe("Curve for EdDSA. Default and only supported value is Ed25519 for now"),
		}),

		z
			.object({
				alg: z
					.literal("ES256")
					.describe("Elliptic Curve Digital Signature Algorithm with P-256 elliptic curve"),
				crv: z
					.never()
					.optional()
					.describe("Curve parameter is fixed to P-256 for ES256"),
		}),

		z
			.object({
				alg: z
					.literal("ES512")
					.describe("Elliptic Curve Digital Signature Algorithm with P-521 elliptic curve"),
				crv: z
					.never()
					.optional()
					.describe("Curve parameter is fixed to P-521 for ES512"),
		}),

		z
			.object({
				alg: z
					.literal("PS256")
					.describe(
						"RSA with SHA-256. Uses a probabilistic signature scheme, so identical plaintexts produce different ciphertexts",
					),
				modulusLength: z
					.number()
					.optional()
					.describe("RSA key modulus length in bits. Default is 2048"),
		}),

		z
			.object({
				alg: z.literal("RS256").describe("RSA with SHA-256"),
				modulusLength: z
					.number()
					.optional()
					.describe("RSA key modulus length in bits. Default is 2048"),
		}),
	])
	.describe("Algorithm options used to create a new JSON Web Key (JWK) pair");

export type JwkAlgorithm = JwkOptions["alg"];

/**
 * Configuration for {@link JSONWebKeySet **JWKS**}**-related** options.
 */
export interface JwksOptions {
	/**
	 * Array of functions to **fetch** {@link JWK **JWK**s} from **remote** {@link JSONWebKeySet **JSON Web Key Sets** (**JWKS**)}.
	 *
	 * @description Whenever an unknown **JWT** `kid` **("Key ID") Header Parameter** is encountered, the {@link JwksCache **JWKS cache**} is updated with {@link JWK **JWK**s} **fetched** from these **remote sources**.
	 *
	 * ⚠ If two {@link JWK **JWK**s} from different sources share the same "kid", the ambiguity results in {@link JWKSMultipleMatchingKeys} error when trying to access the {@link JWK **JWK**}.
	 *
	 * ⚠ If a {@link JWK **JWK**} is **removed** from a **remote source**, a **POST request** to the **server-only** `/revoke-jwk` **endpoint** might be needed. Otherwise, that {@link JWK **JWK**} will be treated as still available until {@link updateCachedJwks `updateCachedJwks`} is called. However, if `/revoke-jwk` (or {@link revokeJwk `revokeJwk`}) is not called, verification of **JWTs** signed with the removed {@link JWK **JWK**} will fail with an error that does not indicate the {@link JWK **JWK**} was **revoked**.
	 * @todo optional CRON that checks for key revocation from remote JWKS
	 * @todo Should check removed keys from the remote sources and auto-revoke them? Make it an option?
	 */
	remoteJwks?: (() => Awaitable<JSONWebKeySet>)[];
	/**
	 * Default {@link Jwk **JWK pair**} configuration. If a {@link JWK **JWK**} is **automatically generated**, it will use these options. 
	 * 
	 * @description A subset of the options available for the *JOSE* `generateKeyPair` function.
	 *
	 * @see https://github.com/panva/jose/blob/main/src/runtime/node/generate.ts
	 *
	 * @default { alg: 'EdDSA', crv: 'Ed25519' }
	 */
	keyPairConfig?: JwkOptions;
	/**
	 * Disable the encryption of the **private** {@link JWK **JWK**s} in the **database**. 
	 *
	 * @default false
	 */
	disablePrivateKeyEncryption?: boolean;
	/**
	 * Disable {@link JwksCache **JWKS cache**}.
	 *
	 * @description When `true`, everytime {@link JSONWebKeySet **JWKS**} or {@link JWK **JWK**s} are needed, they are fetched directly from the **database** or **remote sources** without **caching**.
	 *
	 * @default false
	 */
	disableJwksCaching?: boolean;
	/**
	 * **ID** of the default {@link Jwk **JWK pair**} to use when **signing or verifying JWTs**.
	 *
	 * @todo If **key rotation** is **enabled**, this represents the **keyChainId** instead.  
	 *
	 * @default getJwksAdapter(adapter).getLatestKey() // Latest key in the database
	 */
	defaultKeyId?: string;
}

export interface JwtOptions {
	/**
	 * The **issuer** of the **JWT**.
	 * 
	 * @description Defaults to `baseURL` from {@link BetterAuthOptions `BetterAuthOptions`} if defined, otherwise `process.env.BETTER_AUTH_URL`.
	 *
	 * @default baseURL ?? process.env.BETTER_AUTH_URL
	 */
	issuer?: string;
	/**
	 * The **audience** of the **JWT**.
	 *
	 * @description Defaults to `baseURL` from {@link BetterAuthOptions `BetterAuthOptions`} if defined, otherwise `process.env.BETTER_AUTH_URL`.
	 * 
	 * @default baseURL ?? process.env.BETTER_AUTH_URL
	 */
	audience?: string | string[];
	/**
	 * Sets **JWT** `exp` **("Expiration Time") Claim**.
	 *
	 * - If `number`: Used directly as a **UNIX timestamp** (seconds).
	 * - If `Date`: Converted to **UNIX timestamp** (seconds).
	 * - If `string`: Parsed as **time span** and added to **current UNIX timestamp**.
	 *
	 * Time span format: `<number> <unit>`, e.g. `"5 minutes"`, `"1 day"`.
	 * 
	 * Valid units: `"sec"`, `"secs"`, `"second"`, `"seconds"`, `"s"`, `"minute"`, `"minutes"`, `"min"`, `"mins"`, `"m"`, `"hour"`, `"hours"`, `"hr"`, `"hrs"`, `"h"`, `"day"`, `"days"`, `"d"`, `"week"`, `"weeks"`, `"w"`, `"year"`, `"years"`, `"yr"`, `"yrs"`, `"y"`.
	 *
	 * `"year" = "365.25 days"`. **Months not supported**.
	 *
	 * `"ago"` suffix or `"-"` prefix **subtracts** time span from **current timestamp**.
	 * `"from now"` suffix adds time span (optional, for readability).
	 *
	 * @default "15m"
	 */
	expirationTime?: number | string | Date;
	/**
	 * Maximum time allowed since the **JWT** `iat` **("Issued At") Claim**.
	 *
	 * @description Defines the **maximum JWT lifetime** relative to its `iat` value. Once the `maxTokenAge` duration has elapsed since `iat`, the **JWT** will be **rejected** even if its `exp` suggests it’s still valid.
	 *
	 * Accepts the same **time span** {`string`} **format** as {@link JwtOptions.expirationTime | `expirationTime`}.
	 * 
	 * ⚠ If this option is set and not `null`, the payload **must include** `iat`.
	 *
	 *  Defaults to `"1 week"`, but only if `"iat"` is listed in {@link JwtVerifyOptions.requiredClaims | `requiredClaims`}.
	 *
	 * ⚠ To disable the **default behavior**, set this to `null` (not `undefined`).
	 */
	maxTokenAge?: string | null;
	/**
	 * Time in **seconds**.
	 *
	 * @description Defines how far the **JWT** `iat` **("Issued At") Claim** is allowed to drift **into the past** or **into the future** due to clock differences between machines or network processing delays.
	 *
	 * @default 30
	 */
	maxClockSkew?: number | null;
	/**
	 * Logs to console when **JWT verification** fails, as **info**.
	 *
	 * @description Useful for **debugging** and **telemetry**. 
	 * 
	 * ⚠ May impact **performance** under high load. 
	 *
	 * @default true
	 */
	logFailure?: boolean;
	/**
	 * Function defining the **JWT Data** in {@link getSessionJwt `getSessionJwt`}.
	 *
	 * @description Called to construct the **JWT** data. If omitted, defaults to the **user object** from the **current session**. If `undefined`, `session.user` will be used.
	 *
	 * @default defineSessionJwtData ? defineSessionJwtData() : session.user
	 */
	defineSessionJwtData?: (session: {
		user: User & Record<string, any>;
		session: Session & Record<string, any>;
	}) => Awaitable<Record<string, any>>;
	/**
	 * Function defining the **JWT** `sub` **("Subject") Claim** in `getSessionJwt`.
	 *
	 * @description Called to set the **JWT** `sub` **("Subject") Claim** of the **JWT**. If omitted, defaults to the **user's ID** from the **current session**. If `undefined`, `session.user.id` will be used.
	 *
	 * @default defineSessionJwtSubject ? defineSessionJwtSubject : session.user.id
	 */
	defineSessionJwtSubject?: (session: {
		user: User & Record<string, any>;
		session: Session & Record<string, any>;
	}) => Awaitable<string>;
}

export interface JwtCustomClaims {
	/**
	 * Changes **JWT** `aud` **("Audience") Claim**.
	 *
	 * ⚠ An `undefined` value or an **empty array** applies the **default audience**, but explicitly passing `null` **removes** the `aud` **Claim**.
	 *
	 * @default getJwtPluginOptions(ctx)?.jwt?.audience // Plugin configuration
	 */
	aud?: string | string[] | null;
	/**
	 * Changes **JWT** `exp` **("Expiration Time") Claim**. Expects the same **time format** as {@link JwtOptions.expirationTime `expirationTime`}.
	 *
	 * ⚠ An `undefined` value sets this to **default **, but explicitly passing `null` **removes** the `exp` **Claim**.
	 *
	 * @default getJwtPluginOptions(ctx)?.jwt?.expirationTime ?? "15min" // Plugin configuration; default: "15 min"
	 */
	exp?: string | number | Date | null;
	/**
	 * Changes **JWT** `iat` **("Issued At") Claim**. Expects the same **time format** as {@link JwtOptions.expirationTime `expirationTime`}.
	 *
	 * ⚠ An `undefined` value sets it to **default time**, but explicitly passing `null` **removes** `iat` **Claim**.
	 *
	 * @default Date.now() // Current local machine time
	 */
	iat?: string | number | Date | null;
	/**
	 * Disables **JWT** `iss` **("Issuer") Claim** set to `null`.
	 *
	 * @description Defaults to `baseURL` from {@link BetterAuthOptions `BetterAuthOptions`} if defined, otherwise `process.env.BETTER_AUTH_URL`. It can be changed only in {@link BetterAuthOptions `BetterAuthOptions`} to promote the **best practices**.
	 * 
	 * @default baseURL ?? process.env.BETTER_AUTH_URL
	 */
	iss?: null;
	/**
	 * Sets **JWT** `jti` **("JWT ID") Claim**. 
	 * 
	 * @todo Used in **JWT revocation list** if **enabled**
	 */
	jti?: string;
	/**
	 * Sets **JWT** `nbf` **("Not Before") Claim**.
	 */
	nbf?: string | number | Date;
	/**
	 * Sets **JWT** **("Subject") Claim**.
	 */
	sub?: string;
	/**
	 * Changes **JWT** `typ` **("Type") Header Parameter**.
	 *
	 * @description It is technically not a **JWT Claim**, but having it here is more convienient. Setting it to `null` or an **empty string** will not include this field in the **JWT Header**.
	 * 
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
			.describe('Disables JWT "Issuer" Claim when `null`'),

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
			.describe('Sets JWT "Type" Header Parameter'),
	})
	.describe("Custom JWT Claims that override or add to default Claims");

type JwtClaim = "aud" | "exp" | "iat" | "iss" | "jti" | "nbf" | "sub";
export interface JwtVerifyOptions {
	/**
	 * Array of allowed **JWT** `aud` **("Audience") Claims**.
	 * 
	 * @description If defined, the **JWT Payload must include** `aud` **Claim** containing a value present in this array.
	 *
	 * Defaults to `[baseURL]` from {@link BetterAuthOptions `BetterAuthOptions`} if defined, otherwise `process.env.BETTER_AUTH_URL`.
	 *
	 * ⚠ When verifying **JWTs without** `aud` **Claim**, set this to `[]` or `null` instead of `undefined`.
	 *
	 * @default [baseURL ?? process.env.BETTER_AUTH_URL]
	 */
	allowedAudiences?: string[] | null;
	/**
	 * Array of allowed **JWT** `iss` **("Issuer") Claims**.
	 *
	 * @description If defined, the **JWT Payload must include** `iss` **Claim** containing a value present in this array.
	 *
	 * ⚠ When verifying **JWTs without** `iss` **Claim**, set this to `[]` or `null` instead of `undefined`.
	 *
	 * @default [baseURL ?? process.env.BETTER_AUTH_URL]
	 */
	allowedIssuers?: string[] | null;
	/**
	 * Maximum time allowed since the **JWT** `iat` **("Issued At") Claim**.
	 *
	 * @description Defines the **maximum JWT lifetime** relative to its `iat` value. Once the `maxTokenAge` duration has elapsed since `iat`, the **JWT** will be **rejected** even if its `exp` suggests it’s still valid.
	 *
	 * Accepts the same **time span** {`string`} **format** as {@link JwtOptions.expirationTime | `expirationTime`}.
	 * 
	 * ⚠ Might be necessary to set to a `null` and not `undefined` when dealing with **JWT**s that set `iat`, but the default `maxTokenAge` behaviour is not desired.
	 *
	 * Defaults to {@link JwtOptions.maxTokenAge | `jwt.maxTokenAge`} from {@link JwtPluginOptions the "jwt" plugin configuration} or `"1 week"`, but only if `"iat"` is listed in {@link JwtVerifyOptions.requiredClaims | `requiredClaims`}. Otherwise it is not checked.
	 *
	 * @default getJwtPluginOptions(ctx)?.jwt?.maxTokenAge // if `undefined`: "1 week", but only if `iat` is in `requiredClaims`
	 */
	maxTokenAge?: string | null;
	/**
	 * Expected **JWT** `sub` **("Subject") Claim**.
	 *
	 * @description If provided, `sub` presence is necessary in the payload.
	 */
	expectedSubject?: string;
	/**
	 * Expected **JWT "typ" (Type) Header Parameter** value.
	 *
	 * @description This option makes the **JWT "typ" (Type) Header Parameter** presence required.
	 *
	 * ⚠ Might be necessary to set to `""` or `null` when dealing with **JWT**s that do not set **JWT "typ" (Type) Header Parameter** at all.
	 *
	 * @default "JWT"
	 */
	expectedType?: string | null;
	/**
	 * Expected **JWT Claims** for **JWT** to have.
	 *
	 * @description
	 *
	 * ⚠ Might be necessary to set to `[]` or `null` and not `undefined` when dealing with **JWT**s that do not need to have any **JWT Claims**.
	 *
	 * @default ["aud", "exp", "iat", "iss"] // "jti" is added to this array, if JWT revocation is enabled
	 */
	requiredClaims?: JwtClaim[] | null;
	/**
	 * The key used to verify a **JWT** ought belong to this **key ring**.
	 */
	//expectedKeyRing?: string;
	/**
	 * Do not throw an error when `CryptoKeyExtended` has `id`, but **JWT** does not have **JWT "kid" (Key ID) Header Parameter**.
	 *
	 * @description
	 *
	 * ⚠ Might be necessary to set this to `true` when dealing with **JWT**s issued by external systems. To verify such a **JWT**, use {@link verifyJwtWithKey `verifyJwtWithKey`}. 
	 *
	 * @default false
	 */
	allowNoKeyId?: boolean;
	/**
	 * Time in **seconds**.
	 *
	 * @description Defines how far the **JWT** `iat` **("Issued At") Claim** is allowed to drift **into the past** or **into the future** due to clock differences between machines or network processing delays.
	 *
	 * Defaults to {@link JwtOptions.maxClockSkew | `jwt.maxClockSkew`} from {@link JwtPluginOptions the "jwt" plugin configuration}. 
	 * 
	 * @default getJwtPluginOptions(ctx)?.jwt?.maxClockSkew ?? 30
	 */
	maxClockSkew?: number | null;

	/**
	 * Logs to console when **JWT verification** fails, as **info**.
	 *
	 * @description Useful for **debugging** and **telemetry**. 
	 * 
	 * Defaults to {@link JwtOptions.logFailure | `jwt.logFailure`} from {@link JwtPluginOptions the "jwt" plugin configuration}. 
	 * 
	 * ⚠ May impact **performance** under high load. 
	 *
	 * @default getJwtPluginOptions(ctx)?.jwt?.logFailure ?? true
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
				"Array of allowed JWT Audience Claims. If provided, `aud` presence is necessary in the payload",
			),

		allowedIssuers: z
			.array(z.string())
			.nullable()
			.optional()
			.describe(
				"Array of allowed JWT Issuer Claims. If provided, `iss` presence is necessary in the payload",
			),

		maxTokenAge: z
			.string()
			.nullable()
			.optional()
			.describe(
				"Maximum time from `iat`. If present, `iat` is necessary in the payload",
			),

		expectedSubject: z
			.string()
			.optional()
			.describe(
				"Expected JWT Subject Claim. If provided, `sub` presence is necessary in the payload",
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

		// expectedKeyRing: z
		// 	.string()
		// 	.optional()
		// 	.describe("The key used to verify a JWT ought belong to this key ring"),

		allowNoKeyId: z
			.boolean()
			.optional()
			.describe(
				"Do not throw an error when CryptoKeyExtended has set `id`, but JWT does not have any JWT `kid` (Key ID) Header Parameter",
			),

		maxClockSkew: z
			.number()
			.nullable()
			.optional()
			.describe(
				"The default time in seconds that `iat` can be offset to account for clock skew between systems",
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

export type CryptoKeyExtended = {
	/**
	 * **ID** identifying a **key pair** (**public key** and **private key**).
	 *
	 * @description If provided, **JWT "kid" (Key ID) Header Parameter** will be checked to match this when **verifying** unless `allowNoKeyId` is `true` in **`JwtVerifyOptions`** or this field will be added to the **JWT Header** when **signing**.
	 */
	id?: string;
	/**
	 * **JWK algorithm** name.
	 *
	 * @description Although {`CryptoKey`} contains `algorithm` field, it differs from `alg` in {`JWK`} and this is needed to use the key.
	 * @todo Check if this field is really needed, that is, if {`CryptoKey`} `algorithm` can be used to derieve the **JWK algorithm** universally on all *JOSE*\*SubtleCrypto* versions and if its guaranteed not to change in future.
	 */
	alg: JwkAlgorithm;
	key: CryptoKey;
};

// JWK parameter schema
export const jwkParametersSchema = z
	.object({
		kty: z.string().optional().describe("Key type (e.g., 'RSA', 'EC', 'OKP')"),
		alg: z
			.string()
			.optional()
			.describe("Algorithm intended for use with the key (e.g., 'EdDSA', 'RS256')"),
		key_ops: z
			.array(z.string())
			.optional()
			.describe("Permitted key operations (e.g., 'sign', 'verify')"),
		ext: z
			.boolean()
			.optional()
			.describe("Indicates whether the key is extractable from the crypto context"),
		use: z
			.string()
			.optional()
			.describe("Intended use of the key (e.g., 'sig' for signature)"),
		x5c: z
			.array(z.string())
			.optional()
			.describe("X.509 certificate chain (base64-encoded)"),
		x5t: z
			.string()
			.optional()
			.describe("SHA-1 thumbprint of the DER encoding of the X.509 certificate (base64url-encoded)"),
		"x5t#S256": z
			.string()
			.optional()
			.describe("SHA-256 thumbprint of the DER encoding of the X.509 certificate (base64url-encoded)"),
		x5u: z.string().optional().describe("URI pointing to a set of X.509 public key certificates"),
		kid: z
			.string()
			.optional()
			.describe("Key ID uniquely identifying the key; corresponds to 'id' in stored JWK"),
	})
	.describe("Base JSON Web Key (JWK) parameters");

// Exported JWK schema (includes key material)
export const jwkExportedSchema = jwkParametersSchema
	.extend({
		crv: z.string().optional().describe("Curve name for elliptic curve keys (e.g., 'Ed25519', 'P-256')"),
		d: z.string().optional().describe("Private exponent or key parameter (base64url-encoded)"),
		dp: z.string().optional().describe("RSA CRT first factor exponent (base64url-encoded)"),
		dq: z.string().optional().describe("RSA CRT second factor exponent (base64url-encoded)"),
		e: z.string().optional().describe("RSA public exponent (base64url-encoded)"),
		k: z.string().optional().describe("Symmetric key value (base64url-encoded)"),
		n: z.string().optional().describe("RSA modulus (base64url-encoded)"),
		p: z.string().optional().describe("RSA first prime factor (base64url-encoded)"),
		q: z.string().optional().describe("RSA second prime factor (base64url-encoded)"),
		qi: z.string().optional().describe("RSA CRT coefficient (base64url-encoded)"),
		x: z.string().optional().describe("Elliptic curve X coordinate (base64url-encoded)"),
		y: z.string().optional().describe("Elliptic curve Y coordinate (base64url-encoded)"),
		pub: z.string().optional().describe("Serialized public key (non-standard)"),
		priv: z.string().optional().describe("Serialized private key (non-standard)"),
	})
	.describe("Exported JSON Web Key (JWK)");

/**
 * {@link Jwk **JWK pair**} with the **public** {@link Jwk **JWK**} already imported (parsed from {`string`}).
 */
export interface JwkCache extends Omit<Jwk, "publicKey" | "createdAt"> {
	publicKey: JWK;
}

/**
 * **Cached** {@link JSONWebKeySet **JWKS**} and its components.
 *
 * @description Contains both **local** and **remote** {@link JwkCache **cached JWKs**}, and a combined {@link JSONWebKeySet **JWKS**} representation.
 */
export interface JwksCache {
	/**
	 * **Local** {@link JwkCache **cached JWKs**} from the **database**.
	 */
	keys: JwkCache[];
	/**
	 * **Remote** {@link JwkCache **cached JWKs**} from {@link JwksOptions.remoteJwks | **remote sources**}.
	 */
	remoteKeys: JwkCache[];
	/**
	 * Combined {@link JSONWebKeySet **JWKS**} containing both **local** and **remote** {@link JwkCache **cached JWKs**}.
	 */
	jwks: JSONWebKeySet;
	/**
	 * The time when the {@link JwksCache **JWKS**} was last cached.
	 */
	cachedAt: Date;
}