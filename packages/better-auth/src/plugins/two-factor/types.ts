import type {
	Awaitable,
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
	 * TOTP OPtions
	 */
	totpOptions?: Omit<TOTPOptions, "issuer"> | undefined;
	/**
	 * Trust device options
	 */
	trustDevice?:
		| {
				/**
				 * If true, the trust device feature will be disabled
				 * @default false
				 */
				disabled?: boolean | undefined;
				/**
				 * The max age of the trust device cookie in seconds
				 * @default 30 * 24 * 60 * 60 - 30 days
				 */
				maxAge?: number | undefined;
				/**
				 * The name of the trust device cookie
				 * @default "trust_device"
				 */
				name?: string | undefined;
		  }
		| undefined;
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
	 * Custom schema for the two factor plugin
	 */
	schema?: InferOptionSchema<typeof schema> | undefined;
	/**
	 * Two factor state options
	 *
	 * The two factor state is used to store the state that the user has already
	 * verified the first authentication method.
	 *
	 * We use cookies only by default
	 */
	twoFactorState?:
		| {
				/**
				 * Defines how the two-factor authentication (2FA) state is stored.
				 *
				 * - "cookie": Stores the 2FA state in a cookie. Easiest to set up.
				 *
				 * - "database": Stores the 2FA state in the database. You must persist the
				 *   `verificationToken` returned after the first authentication step and provide it
				 *   again when requesting verification or verifying the second factor.
				 *
				 * - "cookieAndDatabase": Requires both a cookie and a database check. The `verificationToken`
				 *   is automatically stored in a cookie, so you don't need to manually send
				 * 	it back when verifying the two factor state.
				 *
				 * @default "cookie"
				 */
				storeStrategy?: "cookie" | "database" | "cookieAndDatabase" | undefined;
				/**
				 * The max age of how long the two factor state will be valid for in seconds.
				 *
				 * This isn't how long a specific verification will be valid for, it's how long the state will be valid for.
				 * @default 10 * 60 (10 minutes)
				 */
				maxAge?: number | undefined;
				/**
				 * The name of the two factor cookie
				 * @default "two_factor"
				 */
				cookieName?: string | undefined;
		  }
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
	endpoints?: BetterAuthPlugin["endpoints"] | undefined;
}

export interface TwoFactorTable {
	userId: string;
	secret: string;
	backupCodes: string;
	enabled: boolean;
}

export interface TwoFactorRedirectResponse {
	twoFactorRedirect: true;
	verificationToken?: string | null;
}
