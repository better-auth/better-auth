import type { User } from "../../types";
import type { AuthEndpoint } from "../../api/call";
import type { LiteralString } from "../../types/helper";
import type { BackupCodeOptions } from "./backup-codes";
import type { OTPOptions } from "./otp";
import type { TOTPOptions } from "./totp";
import type { InferOptionSchema } from "../../types";
import type { schema } from "./schema";

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
	 * Skip verification on enabling two factor authentication.
	 * @default false
	 */
	skipVerificationOnEnable?: boolean;
	/**
	 * Custom schema for the two factor plugin
	 */
	schema?: InferOptionSchema<typeof schema>;
	/**
	 * Function to send email verification for 2FA changes
	 * If not provided, will fallback to password verification
	 */
	sendVerificationOTP?: (
		data: {
			email: string;
			otp: string;
			type: "2fa-enable" | "2fa-disable";
		},
		request?: Request,
	) => Promise<void>;
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
