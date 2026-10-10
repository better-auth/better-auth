import type { GenericEndpointContext } from "@better-auth/core";
import {
	constantTimeEqual,
	symmetricDecrypt,
	symmetricEncrypt,
} from "../../crypto";
import type { Verification } from "../../types";
import { getDate } from "../../utils/date";
import type { EmailOTPOptions, RequiredEmailOTPOptions } from "./types";
import { defaultKeyHasher, splitAtLastColon } from "./utils";

export async function storeOTP(
	ctx: GenericEndpointContext,
	opts: EmailOTPOptions,
	otp: string,
) {
	if (opts.storeOTP === "encrypted") {
		return await symmetricEncrypt({
			key: ctx.context.secretConfig,
			data: otp,
		});
	}
	if (opts.storeOTP === "hashed") {
		return await defaultKeyHasher(otp);
	}
	if (typeof opts.storeOTP === "object" && "hash" in opts.storeOTP) {
		return await opts.storeOTP.hash(otp);
	}
	if (typeof opts.storeOTP === "object" && "encrypt" in opts.storeOTP) {
		return await opts.storeOTP.encrypt(otp);
	}

	return otp;
}

export async function verifyStoredOTP(
	ctx: GenericEndpointContext,
	opts: EmailOTPOptions,
	storedOtp: string,
	otp: string,
): Promise<boolean> {
	if (opts.storeOTP === "encrypted") {
		const decryptedOtp = await symmetricDecrypt({
			key: ctx.context.secretConfig,
			data: storedOtp,
		});
		return constantTimeEqual(decryptedOtp, otp);
	}
	if (opts.storeOTP === "hashed") {
		const hashedOtp = await defaultKeyHasher(otp);
		return constantTimeEqual(hashedOtp, storedOtp);
	}
	if (typeof opts.storeOTP === "object" && "hash" in opts.storeOTP) {
		const hashedOtp = await opts.storeOTP.hash(otp);
		return constantTimeEqual(hashedOtp, storedOtp);
	}
	if (typeof opts.storeOTP === "object" && "decrypt" in opts.storeOTP) {
		const decryptedOtp = await opts.storeOTP.decrypt(storedOtp);
		return constantTimeEqual(decryptedOtp, otp);
	}

	return constantTimeEqual(otp, storedOtp);
}

/**
 * Retrieves the plain-text OTP from a stored value.
 * Returns `null` if the OTP is hashed and cannot be recovered.
 */
async function retrieveOTP(
	ctx: GenericEndpointContext,
	opts: EmailOTPOptions,
	storedOtp: string,
): Promise<string | null> {
	if (opts.storeOTP === "plain" || opts.storeOTP === undefined) {
		return storedOtp;
	}
	if (opts.storeOTP === "encrypted") {
		return await symmetricDecrypt({
			key: ctx.context.secretConfig,
			data: storedOtp,
		});
	}
	if (typeof opts.storeOTP === "object" && "decrypt" in opts.storeOTP) {
		return await opts.storeOTP.decrypt(storedOtp);
	}
	// hashed or custom hash -> cannot recover
	return null;
}

/**
 * Whether a stored OTP can still be verified: not expired and not out of
 * attempts.
 */
function isPendingOTP(
	opts: RequiredEmailOTPOptions,
	existing: Verification,
): boolean {
	if (existing.expiresAt < new Date()) return false;
	const [, attempts] = splitAtLastColon(existing.value);
	const allowedAttempts = opts.allowedAttempts || 3;
	return !attempts || parseInt(attempts) < allowedAttempts;
}

export type ReuseOTPResult =
	| { status: "reused"; otp: string }
	/** The row holds a pending code that cannot be read back (hashed storage). */
	| { status: "unrecoverable" }
	/** The row is expired, out of attempts, or gone. */
	| { status: "unusable" };

/**
 * Tries to reuse the stored OTP row the caller has read.
 */
export async function tryReuseOTP(
	ctx: GenericEndpointContext,
	opts: RequiredEmailOTPOptions,
	identifier: string,
	existing: Verification,
): Promise<ReuseOTPResult> {
	if (!isPendingOTP(opts, existing)) return { status: "unusable" };

	const [storedOtpValue] = splitAtLastColon(existing.value);
	const plainOtp = await retrieveOTP(ctx, opts, storedOtpValue);
	if (!plainOtp) return { status: "unrecoverable" };

	// Extend only the row that was read: a concurrent request may have replaced
	// it in the meantime, and extending the replacement while returning this
	// row's code would email a code that is already invalid. When the row is
	// gone, report that nothing could be reused so the caller re-reads.
	const extended = await ctx.context.internalAdapter.updateVerificationById(
		identifier,
		existing.id,
		{ expiresAt: getDate(opts.expiresIn, "sec") },
	);
	if (!extended) return { status: "unusable" };

	return { status: "reused", otp: plainOtp };
}
