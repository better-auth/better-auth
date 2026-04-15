import type {
	BetterAuthPlugin,
	GenericEndpointContext,
	LiteralString,
} from "@better-auth/core";
import type { InferOptionSchema, User } from "../../types";
import type { BackupCodeOptions } from "./backup-codes";
import type { OTPOptions } from "./otp";
import type { schema } from "./schema";
import type { TOTPOptions } from "./totp";

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
	 * Maximum age (in seconds) for the trusted device cookie.
	 * When a user opts to trust a device, this controls how long
	 * the device stays trusted before requiring 2FA again.
	 *
	 * @default 2592000 (30 days)
	 */
	trustDeviceMaxAge?: number | undefined;
	/**
	 * Decides whether to challenge 2FA on a given sign-in. Return `true`
	 * to challenge, `false` to skip. Setting this option replaces the
	 * built-in decision, including the passkey UV exemption.
	 *
	 * Same-user session rewrites (session refresh, `updateUser`) and
	 * session-transition endpoints (admin impersonation, multi-session
	 * switching) are never matched and cannot be overridden.
	 *
	 * The authenticating user is available at `ctx.context.newSession.user`.
	 *
	 * @see {@link https://better-auth.com/docs/plugins/2fa#enforcement-scope}
	 */
	shouldEnforce?:
		| ((ctx: GenericEndpointContext) => boolean | Promise<boolean>)
		| undefined;
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
