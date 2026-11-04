import type { Awaitable } from "@better-auth/core";
import type { InferOptionSchema } from "../../types/plugins";
import type { PinSchema } from "./schema";

export interface PinOptions {
	/**
	 * Custom schema for the PIN plugin.
	 */
	schema?: InferOptionSchema<PinSchema> | undefined;
	/**
	 * Minimum number of characters accepted for a PIN.
	 *
	 * @default 4
	 */
	minLength?: number | undefined;
	/**
	 * Maximum number of characters accepted for a PIN.
	 *
	 * @default 12
	 */
	maxLength?: number | undefined;
	/**
	 * How long a successful step-up verification stays valid, in seconds.
	 *
	 * @default 120
	 */
	stepUpTTL?: number | undefined;
	/**
	 * Number of consecutive failed attempts before the PIN is locked.
	 *
	 * @default 5
	 */
	maxAttempts?: number | undefined;
	/**
	 * How long the PIN stays locked after too many failed attempts, in seconds.
	 *
	 * @default 300
	 */
	lockoutDuration?: number | undefined;
	/**
	 * Require the account password to set or disable a PIN.
	 *
	 * @default true
	 */
	requirePassword?: boolean | undefined;
	/**
	 * Allow users without a credential account (for example, OAuth-only users)
	 * to set or disable a PIN without a password.
	 *
	 * @default false
	 */
	allowPasswordless?: boolean | undefined;
	/**
	 * Custom PIN validator. When provided, it replaces the default digits-only
	 * check. Length limits still apply.
	 */
	pinValidator?: ((pin: string) => Awaitable<boolean>) | undefined;
}

export interface PinTable {
	id: string;
	userId: string;
	hash: string;
	failedAttempts?: number | null;
	lockedUntil?: Date | string | null;
	createdAt?: Date | string;
	updatedAt?: Date | string;
}
