import { ZodObject, ZodSchema } from "zod";
import { User } from "../../adapters/schema";
import { AuthEndpoint } from "../../api/call";
import { LiteralString } from "../../types/helper";
import { BackupCodeOptions } from "./backup-codes";
import { TOTPOptions } from "./totp";
import { Endpoint } from "better-call";
import { OTPOptions } from "./otp";

export interface TwoFactorOptions {
	issuer: string;
	totpOptions?: Omit<TOTPOptions, "issuer">;
	otpOptions?: OTPOptions;
	backupCodeOptions?: BackupCodeOptions;
	requireOn?: {
		signIn: () => boolean;
	};
	/**
	 * The url to redirect to after the user has
	 * signed in to validate the two factor. If not
	 * provided, the callbackURL will be used. If
	 * callbackURL is not provided, the user will be
	 * redirected to the root path.
	 *
	 * @default "/"
	 */
	twoFactorURL?: string;
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
