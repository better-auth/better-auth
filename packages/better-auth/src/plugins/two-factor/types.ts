import type {
	Awaitable,
	BetterAuthSignInChallengeRegistry,
	GenericEndpointContext,
} from "@better-auth/core";
import type { InferOptionSchema, User } from "../../types";
import type { schema } from "./schema";

/**
 * Input passed to `twoFactor({ enforcement: { decide } })`. `primaryMethod` is the
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
	primaryMethod: string;
	request?: Request;
}

export type TwoFactorEnforcementDecision =
	| "enforce"
	| "skip"
	| undefined
	| { decision: "enforce" | "skip"; reason?: string };

export type TwoFactorEnforcementDecide = (
	input: TwoFactorEnforcementDecideInput,
) => TwoFactorEnforcementDecision | Promise<TwoFactorEnforcementDecision>;

export interface TwoFactorEnforcementOptions {
	decide?: TwoFactorEnforcementDecide | undefined;
}

export interface TwoFactorTrustDeviceOptions {
	/**
	 * Maximum age (in seconds) for the trusted-device cookie.
	 *
	 * @default 604800 (7 days)
	 */
	maxAge?: number | undefined;
	/**
	 * Endpoint paths (exact matches against `ctx.path`) that force a fresh
	 * two-factor challenge even when the trust-device cookie is valid.
	 */
	requireReverificationFor?: readonly string[] | undefined;
}

export interface TOTPOptions {
	issuer?: string | undefined;
	digits?: (6 | 8) | undefined;
	period?: number | undefined;
	disable?: boolean | undefined;
}

export interface OTPOptions {
	period?: number | undefined;
	digits?: number | undefined;
	sendOTP?:
		| ((
				data: {
					user: User;
					otp: string;
				},
				ctx?: GenericEndpointContext,
		  ) => Awaitable<void>)
		| undefined;
	allowedAttempts?: number | undefined;
	storeOTP?:
		| (
				| "plain"
				| "encrypted"
				| "hashed"
				| { hash: (token: string) => Promise<string> }
				| {
						encrypt: (token: string) => Promise<string>;
						decrypt: (token: string) => Promise<string>;
				  }
		  )
		| undefined;
}

export interface RecoveryCodeOptions {
	/**
	 * The number of recovery codes to issue when a recovery method is created
	 * or replaced.
	 *
	 * @default 10
	 */
	amount?: number | undefined;
	/**
	 * Number of random alphanumeric characters in each recovery code.
	 *
	 * @default 12
	 */
	length?: number | undefined;
	customGenerate?: (() => string[]) | undefined;
}

export interface TwoFactorOptions {
	issuer?: string | undefined;
	totpOptions?: Omit<TOTPOptions, "issuer"> | undefined;
	otpOptions?: OTPOptions | undefined;
	recoveryCodeOptions?: RecoveryCodeOptions | undefined;
	/**
	 * Skip interactive verification for freshly created methods.
	 * TOTP/OTP methods are marked verified immediately when enabled.
	 *
	 * @default false
	 */
	skipVerificationOnEnable?: boolean | undefined;
	schema?: InferOptionSchema<typeof schema> | undefined;
	/**
	 * Maximum age (in seconds) for the pending two-factor cookie.
	 *
	 * @default 600 (10 minutes)
	 */
	pendingChallengeMaxAge?: number | undefined;
	trustDevice?: TwoFactorTrustDeviceOptions | undefined;
	enforcement?: TwoFactorEnforcementOptions | undefined;
	/**
	 * Maximum number of failed verification attempts allowed against a single
	 * sign-in attempt before it is locked.
	 *
	 * @default 5
	 */
	maxVerificationAttempts?: number | undefined;
}

export const TWO_FACTOR_METHOD_KIND = {
	TOTP: "totp",
	OTP: "otp",
	RECOVERY_CODE: "recovery-code",
} as const;

export type TwoFactorMethodKind =
	(typeof TWO_FACTOR_METHOD_KIND)[keyof typeof TWO_FACTOR_METHOD_KIND];

export interface TwoFactorMethodDescriptor {
	id: string;
	kind: TwoFactorMethodKind;
	label: string | null;
}

declare module "@better-auth/core" {
	interface BetterAuthSignInChallengeRegistry {
		"two-factor": {
			attemptId: string;
			methods: TwoFactorMethodDescriptor[];
		};
	}
}

export interface TwoFactorMethod {
	id: string;
	userId: string;
	kind: TwoFactorMethodKind;
	label?: string | null;
	verifiedAt?: Date | null;
	lastUsedAt?: Date | null;
	createdAt: Date;
	updatedAt: Date;
}

export interface TwoFactorTotpSecret {
	id: string;
	methodId: string;
	secret: string;
	createdAt: Date;
	updatedAt: Date;
}

export interface TwoFactorRecoveryCode {
	id: string;
	methodId: string;
	codeHash: string;
	usedAt?: Date | null;
	createdAt: Date;
	updatedAt: Date;
}

export interface TrustedDevice {
	id: string;
	userId: string;
	lookupKeyHash: string;
	label?: string | null;
	userAgent?: string | null;
	createdAt: Date;
	updatedAt: Date;
	lastUsedAt?: Date | null;
	expiresAt: Date;
}
