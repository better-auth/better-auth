import type { BetterAuthPlugin, LiteralString } from "@better-auth/core";
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
}

export interface UserWithTwoFactor extends User {
	/**
	 * If the user has enabled two factor authentication.
	 */
	twoFactorEnabled: boolean;
}

export interface TwoFactorProvider {
	id: LiteralString;
	endpoints?: BetterAuthPlugin["endpoints"] | undefined;
}

export interface TwoFactorTable {
	id: string;
	userId: string;
	secret: string;
	backupCodes: string;
	enabled: boolean;
}
