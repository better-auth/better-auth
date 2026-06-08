/**
 * Authentication Methods References (AMR) primitives.
 *
 * Implements the session-scoped "which factors were used to authenticate"
 * record per OIDC Core §2 and RFC 8176. The canonical storage field is
 * `session.amr: AuthenticationMethodReference[]`; the OIDC claim is a
 * projection of that field at token-issue time.
 */

import * as z from "zod";

/**
 * A single factor event that contributed to the current session.
 *
 * `method` is an open string with a two-tier vocabulary:
 * - Built-in Better Auth methods use the `BUILTIN_AMR_METHOD` constants
 *   (`"password"`, `"magic-link"`, `"totp"`, ...). The closed union type
 *   `BuiltinAMRMethod` captures these at the type level.
 * - OAuth providers emit the provider id directly (`"google"`, `"github"`,
 *   ...). The namespace is open because RFC 8176 §2 allows "other acceptable
 *   values", and relying parties may federate any number of providers.
 *
 * `factor` is a closed union aligned with NIST SP 800-63B categories.
 * Passkey stays `possession` even when UV=true because the framework cannot
 * distinguish biometric UV from PIN UV without platform attestation; a
 * future attestation-aware plugin can upgrade specific passkeys to
 * `inherence` through this same surface (see docs: Authentication Factors).
 *
 * `completedAt` is the instant the factor verification completed. It
 * enables per-factor freshness checks (step-up) without a schema change.
 */
export interface AuthenticationMethodReference {
	method: string;
	factor: "knowledge" | "possession" | "inherence";
	completedAt: Date;
}

/**
 * Shared vocabulary of Better Auth built-in method names.
 *
 * Lowercase kebab-case. Plugins and integrations import these constants
 * so that one factor's spelling is identical everywhere it appears
 * (`session.amr`, OIDC `amr` claim, `last_used_login_method` cookie).
 *
 * `PASSWORD` unifies email+password and username+password: the
 * identifier choice is not itself a factor event.
 *
 * `EMAIL_VERIFICATION` is a possession factor distinct from `MAGIC_LINK`:
 * clicking a verification link proves mailbox control, but the `magic-link`
 * plugin may not even be installed and the user may have authenticated
 * with a different primary factor at sign-up.
 */
export const BUILTIN_AMR_METHOD = {
	PASSWORD: "password",
	MAGIC_LINK: "magic-link",
	EMAIL_OTP: "email-otp",
	EMAIL_VERIFICATION: "email-verification",
	PHONE_OTP: "phone-otp",
	PASSKEY: "passkey",
	SIWE: "siwe",
	TOTP: "totp",
	OTP: "otp",
	BACKUP_CODE: "backup-code",
	API_KEY: "api-key",
} as const;

export type BuiltinAMRMethod =
	(typeof BUILTIN_AMR_METHOD)[keyof typeof BUILTIN_AMR_METHOD];

/**
 * Build an `AuthenticationMethodReference` for an OAuth-style sign-in.
 *
 * Every OAuth path (callback, oauth-proxy, generic-oauth, sso, one-tap,
 * native ID-token, SAML) funnels through this helper so the emitted shape
 * cannot drift between sites. `providerId` must be the provider's canonical
 * id (what the account row stores), not a human-facing label.
 */
export function amrForProvider(
	providerId: string,
): AuthenticationMethodReference {
	return {
		method: providerId,
		factor: "possession",
		completedAt: new Date(),
	};
}

/**
 * RFC 8176 registry mapping for the OIDC `amr` claim.
 *
 * Better Auth's internal vocabulary (kebab-case domain names) is not the
 * RFC 8176 registry, so the `id_token.amr` projection must translate.
 * Relying parties that enforce assurance based on RFC values would
 * otherwise reject or misread the claim. Values not in the registry
 * (SIWE, custom provider ids) pass through unchanged: RFC 8176 §2
 * explicitly permits "other acceptable values", and relying parties that
 * federate specific providers already recognize the provider id.
 *
 * Mapping rationale:
 * - `password` → `"pwd"`: direct registry match (knowledge factor).
 * - `email-otp` / `phone-otp` / `otp` / `magic-link` → `"otp"`: all are
 *   one-time codes or tokens delivered out-of-band.
 * - `email-verification` → `"otp"`: same shape (one-time token) even
 *   though the intent is account verification rather than sign-in.
 * - `totp` → `"mfa"`: totp implies a second factor; `"mfa"` is the
 *   closest registry value signaling multi-factor evidence.
 * - `passkey` → `"hwk"`: hardware-bound key material (WebAuthn). Upgrades
 *   to `"hwk"+"mfa"` or `"pop"` are a separate change once UV-aware
 *   attestation lands.
 * - `backup-code` → `"kba"`: knowledge-based answer consumed once.
 * - `api-key` → `"pop"`: proof-of-possession of long-lived key material.
 * - OAuth provider ids → pass through: federation is expressed through
 *   the provider id itself; discovery advertises `"fed"` separately.
 */
const RFC_8176_AMR_MAP: Record<BuiltinAMRMethod, string> = {
	password: "pwd",
	"magic-link": "otp",
	"email-otp": "otp",
	"email-verification": "otp",
	"phone-otp": "otp",
	passkey: "hwk",
	siwe: "siwe",
	totp: "mfa",
	otp: "otp",
	"backup-code": "kba",
	"api-key": "pop",
};

/**
 * Closed set of values projected into `id_token.amr`. Advertised on the
 * OIDC discovery document as `amr_values_supported` so relying parties can
 * discover the vocabulary without out-of-band documentation.
 */
export const RFC_8176_AMR_VALUES = [
	"pwd",
	"otp",
	"mfa",
	"hwk",
	"pop",
	"fed",
	"kba",
] as const;

export type RFC8176AMRValue = (typeof RFC_8176_AMR_VALUES)[number];

/**
 * Project a Better Auth `method` string into its RFC 8176 equivalent for
 * the OIDC `id_token.amr` claim. Built-in methods are translated via the
 * registry map; unrecognized values (OAuth provider ids, SIWE, custom
 * plugin methods) are emitted as `"fed"` for providers the caller marks
 * as federation and passed through verbatim otherwise. Callers that need
 * provider-id fidelity in the claim (common for the federation case) can
 * use `toRfc8176Amr(method, { provider: true })`.
 */
export function toRfc8176Amr(
	method: string,
	options: { provider?: boolean } = {},
): string {
	if (method in RFC_8176_AMR_MAP) {
		return RFC_8176_AMR_MAP[method as BuiltinAMRMethod];
	}
	return options.provider ? "fed" : method;
}

/**
 * Runtime validator for a single AMR entry. `completedAt` is coerced from
 * either a `Date` or an ISO string so the same schema parses values straight
 * out of `JSON.parse(...)` (secondary storage, JSON columns) without a
 * separate revival step. Unknown extra keys are stripped to keep stored
 * payloads stable across plugin versions.
 */
export const amrEntrySchema: z.ZodType<AuthenticationMethodReference> = z
	.object({
		method: z.string().min(1),
		factor: z.enum(["knowledge", "possession", "inherence"]),
		completedAt: z.coerce.date(),
	})
	.strip();

/**
 * Runtime validator for a chain of AMR entries. Use this for any storage
 * column that holds `AuthenticationMethodReference[]` (currently `session.amr`
 * and `signInAttempt.amr`).
 */
export const amrSchema = z.array(amrEntrySchema);
