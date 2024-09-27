import type { User } from "../../db/schema";
import type { AuthEndpoint } from "../../api/call";
import type { LiteralString } from "../../types/helper";
import type { BackupCodeOptions } from "./backup-codes";
import type { OTPOptions } from "./otp";
import type { TOTPOptions } from "./totp";

export interface TwoFactorOptions {
	/**
	 * Application Name
	 */
	issuer?: string;
	/**
	 * TOTP OPtions
	 */
	totpOptions?: Omit<TOTPOptions, "issuer">;
	/**
	 * OTP Options
	 */
	otpOptions?: OTPOptions;
	/**
	 * Backup code options
	 */
	backupCodeOptions?: BackupCodeOptions;
}

export interface UserWithTwoFactor extends User {
	/**
	 * If the user has enabled two factor authentication.
	 */
	twoFactorEnabled: boolean;
	/**
	 * The secret used to generate the TOTP or OTP.
	 */
	twoFactorSecret: string;
	/**
	 * List of backup codes separated by a
	 * comma
	 */
	twoFactorBackupCodes: string;
}

export interface TwoFactorProvider {
	id: LiteralString;
	endpoints?: Record<string, AuthEndpoint>;
}
