import type {
	BetterAuthPlugin,
	BetterAuthSignInChallengeRegistry,
	LiteralString,
} from "@better-auth/core";
import type { InferOptionSchema, User } from "../../types";
import type { BackupCodeOptions } from "./backup-codes";
import type { OTPOptions } from "./otp";
import type { schema } from "./schema";
import type { TOTPOptions } from "./totp";

/**
 * Input passed to `twoFactor({ enforcement: { decide } })`. `method` is the
 * primary factor the caller just proved (e.g. `"password"`, `"passkey"`, or a
 * provider id); `request` is the in-flight HTTP request so the hook can
 * consult headers, IP, or geo to make policy decisions.
 *
 * `request` is `undefined` when the pipeline is invoked directly via
 * `auth.api.*` on the server (there is no real fetch `Request` in that
 * path). Hooks that key on headers/IP/geo must handle the undefined case.
 */
export interface TwoFactorEnforcementDecideInput {
	challenge: keyof BetterAuthSignInChallengeRegistry;
	user: User;
	method: string;
	request?: Request;
}

/**
 * Return value of `enforcement.decide`. Accepts the literal union for
 * quick hooks, or a structured object when the operator wants to attach a
 * reason that lands in the audit log (`"idp-amr-mfa"`,
 * `"low-risk-network"`, ...).
 */
export type TwoFactorEnforcementDecision =
	| "enforce"
	| "skip"
	| undefined
	| { decision: "enforce" | "skip"; reason?: string };

/**
 * Per-request enforcement policy for 2FA.
 *
 * Returns `"skip"` to bypass the challenge (e.g. upstream IdP asserted MFA
 * with `amr=mfa`), `"enforce"` to require the challenge even when the
 * defaults would skip it (e.g. trust-device cookie valid but action is
 * high-sensitivity), or `undefined` to defer to the defaults. Return
 * `{ decision, reason }` to pair the decision with an audit-log reason.
 *
 * Every `"skip"` decision is audit-logged at `info` level by the framework
 * so bypasses stay visible to operators.
 */
export type TwoFactorEnforcementDecide = (
	input: TwoFactorEnforcementDecideInput,
) => TwoFactorEnforcementDecision | Promise<TwoFactorEnforcementDecision>;

export interface TwoFactorEnforcementOptions {
	decide?: TwoFactorEnforcementDecide | undefined;
}

export interface TwoFactorTrustDeviceOptions {
	/**
	 * Maximum age (in seconds) for the trusted-device cookie. Apps that want
	 * the longer legacy window set this explicitly; the default is a 7-day
	 * window to limit replay of a stolen cookie during inactive periods.
	 *
	 * @default 604800 (7 days)
	 */
	maxAge?: number | undefined;
	/**
	 * Endpoint paths (exact matches against `ctx.path`) that force a fresh
	 * 2FA challenge even when the trust-device cookie is valid.
	 *
	 * This allowlist is consulted inside the sign-in resolution pipeline,
	 * so entries only take effect on sign-in routes such as
	 * `/sign-in/email`, `/sign-in/username`, `/sign-in/magic-link`, or
	 * `/callback/:provider`. Listing non-sign-in paths (for example
	 * `/update-password` or `/two-factor/disable`) is a silent no-op;
	 * those endpoints need their own step-up integration.
	 *
	 * Matched exactly against `ctx.path` (no prefix / glob) so the
	 * allowlist intent is unambiguous: `/sign-in/email` never silently
	 * covers `/sign-in/email/magic-link`.
	 */
	requireReverificationFor?: readonly string[] | undefined;
}

export interface TwoFactorOptions {
	/**
	 * Application Name
	 */
	issuer?: string | undefined;
	/**
	 * The name of the table that stores the two factor
	 * authentication data.
	 *
	 * @default "twoFactor"
	 */
	twoFactorTable?: string | undefined;
	/**
	 * TOTP OPtions
	 */
	totpOptions?: Omit<TOTPOptions, "issuer"> | undefined;
	/**
	 * OTP Options
	 */
	otpOptions?: OTPOptions | undefined;
	/**
	 * Backup code options
	 */
	backupCodeOptions?: BackupCodeOptions | undefined;
	/**
	 * Skip verification on enabling two factor authentication.
	 * @default false
	 */
	skipVerificationOnEnable?: boolean | undefined;
	/**
	 * Allow enabling and managing 2FA without a password when the user does not
	 * have a credential account (e.g. passkey-only users).
	 * When enabled, password is still required if a credential account exists.
	 * @default false
	 */
	allowPasswordless?: boolean | undefined;
	/**
	 * Custom schema for the two factor plugin
	 */
	schema?: InferOptionSchema<typeof schema> | undefined;
	/**
	 * Maximum age (in seconds) for the two-factor verification cookie.
	 * This controls how long users have to complete the 2FA flow
	 * after signing in.
	 *
	 * @default 600 (10 minutes)
	 */
	twoFactorCookieMaxAge?: number | undefined;
	/**
	 * Trusted-device policy: cookie lifetime and per-path reverification
	 * allowlist. See `TwoFactorTrustDeviceOptions` for field-level docs.
	 */
	trustDevice?: TwoFactorTrustDeviceOptions | undefined;
	/**
	 * Per-request enforcement policy. `enforcement.decide` is the server-side
	 * allowlist hook that overrides the defaulted challenge resolution, for
	 * example to trust an upstream IdP's MFA assertion or to require a fresh
	 * challenge for a specific sensitive route.
	 */
	enforcement?: TwoFactorEnforcementOptions | undefined;
	/**
	 * Maximum number of failed verification attempts allowed against a single
	 * sign-in attempt before it is locked. Further verifications return
	 * `TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE` and the caller must start a new
	 * sign-in. Guards against brute-forcing a single paused attempt
	 * (NIST SP 800-63B-4 §5.2.2).
	 *
	 * @default 5
	 */
	maxVerificationAttempts?: number | undefined;
}

export type TwoFactorMethod = "totp" | "otp" | "backup-code";

declare module "@better-auth/core" {
	interface BetterAuthSignInChallengeRegistry {
		"two-factor": {
			attemptId: string;
			availableMethods: TwoFactorMethod[];
		};
	}
}

export interface UserWithTwoFactor extends User {
	/**
	 * If the user has enabled two factor authentication.
	 */
	twoFactorEnabled: boolean;
}

export interface TwoFactorProvider {
	id: LiteralString;
	version?: string | undefined;
	endpoints?: BetterAuthPlugin["endpoints"] | undefined;
}

export interface TwoFactorTable {
	id: string;
	userId: string;
	secret: string;
	backupCodes: string;
	verified: boolean;
}
