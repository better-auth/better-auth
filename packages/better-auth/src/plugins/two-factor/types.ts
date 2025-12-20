import type { BetterAuthPlugin, LiteralString } from "@better-auth/core";
import type { InferOptionSchema, User } from "../../types";
import type { BackupCodeOptions } from "./backup-codes";
import type { OTPOptions } from "./otp";
import type { schema } from "./schema";
import type { TOTPOptions } from "./totp";

export interface TwoFactorOptions {
	/**
	 * The issuer is the name of your application. It's used to generate TOTP codes. It'll be displayed in the authenticator apps.
	 * @default "My App"
	 */
	issuer?: string | undefined;
	/**
	 * The options for the TOTP authentication.
	 */
	totpOptions?: Omit<TOTPOptions, "issuer"> | undefined;
	/**
	 * The options for the OTP authentication.
	 */
	otpOptions?: OTPOptions | undefined;
	/**
	 * The options for the backup code authentication.
	 */
	backupCodeOptions?: BackupCodeOptions | undefined;
	/**
	 * Skip verification on enabling two factor authentication.
	 * @default false
	 */
	skipVerificationOnEnable?: boolean | undefined;
	/**
	 * Custom schema for the two factor plugin
	 */
	schema?: InferOptionSchema<typeof schema> | undefined;
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
	userId: string;
	secret: string;
	backupCodes: string;
	enabled: boolean;
}
