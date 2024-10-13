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
	/**
	 * Table name for two factor authentication.
	 * @default "userTwoFactor"
	 */
	twoFactorTable?: string;
}

export interface UserWithTwoFactor extends User {
	/**
	 * If the user has enabled two factor authentication.
	 */
	twoFactorEnabled: boolean;
}

export interface TwoFactorProvider {
	id: LiteralString;
	endpoints?: Record<string, AuthEndpoint>;
}

export interface TwoFactorTable {
	userId: string;
	secret: string;
	backupCodes: string;
	enabled: boolean;
}
